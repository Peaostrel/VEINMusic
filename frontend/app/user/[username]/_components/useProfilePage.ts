"use client";

import type { getRankInfo, getNextRankInfo } from "@/app/lib/ranks";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  API_URL,
  subscribeSocket,
  type SocketSubscription,
} from "@/app/lib/api";
import { applyPlaybackUpdate } from "@/app/lib/playback";
import { useCountries } from "@/app/lib/geo";
import { useT } from "@/app/lib/i18n/client";
import { useProfileTheme } from "./hooks";
import { fetchAndShowNotifications } from "./notifications";
import type {
  AchievementInfo,
  ArtistRecommendation,
  CompatibilityResult,
  FollowStats,
  HistoryEntry,
  MoodInfo,
  SocialLink,
  TasteMatch,
  UserCard,
  UserInfo,
  UserStats,
  WrappedStats,
} from "@/app/lib/types";

/** Achievement pop-up shown on the owner's profile. */
export interface AchievementToast {
  id: string;
  ach_id: number;
  name: string;
  icon: string | null;
  xp: number;
  image: string | null;
}

export interface ProfileData {
  history: HistoryEntry[];
  stats: Partial<UserStats>;
  user: UserInfo | null;
  taste: TasteMatch | null;
  followStats: FollowStats;
}

export interface FollowModalState {
  isOpen: boolean;
  type: string;
  title: string;
  users: UserCard[];
  loading: boolean;
}

/** State, data loading and actions of the profile page. */
export function useProfilePage() {
  const t = useT();
  const username = useParams()?.username;
  const router = useRouter();

  const [data, setData] = useState<ProfileData>({
    history: [],
    stats: {},
    user: null,
    taste: null,
    followStats: { followers: 0, following: 0, is_following: false },
  });
  const [loading, setLoading] = useState(true);
  const [showWrapped, setShowWrapped] = useState(false);
  const [toasts, setToasts] = useState<AchievementToast[]>([]);

  const removeToast = (toastId: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== toastId));
  };

  const [followModal, setFollowModal] = useState<FollowModalState>({
    isOpen: false,
    type: "",
    title: "",
    users: [],
    loading: false,
  });
  const [isMyProfile, setIsMyProfile] = useState(false);
  const [isLogged, setIsLogged] = useState(false);

  const countries = useCountries();
  useProfileTheme(data.user?.theme);

  const [error, setError] = useState("");
  const [recs, setRecs] = useState<ArtistRecommendation[]>([]);
  const [compatibility, setCompatibility] =
    useState<CompatibilityResult | null>(null);
  const [compatModalOpen, setCompatModalOpen] = useState(false);
  const [compatLoading, setCompatLoading] = useState(false);

  const handleShowCompatibility = async () => {
    setCompatModalOpen(true);
    setCompatLoading(true);
    try {
      const loggedUser = window.localStorage.getItem("username");
      if (!loggedUser || loggedUser === username) {
        setCompatLoading(false);
        return;
      }
      const res = await fetch(
        `${API_URL}/api/user/${loggedUser}/compatibility/${username}`,
        { credentials: "include" },
      );
      if (res.ok) {
        const d = await res.json();
        setCompatibility(d);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCompatLoading(false);
    }
  };
  const [wrapped, setWrapped] = useState<WrappedStats | null>(null);
  const [mood, setMood] = useState<MoodInfo | null>(null);
  const wsRef = useRef<SocketSubscription | null>(null);
  const followPending = useRef(false);
  const [identityReady, setIdentityReady] = useState(false);
  const playbackRevision = useRef(0);

  const handleNewScrobble = (track: HistoryEntry) => {
    playbackRevision.current++;
    setData((prev) => {
      const newHistory = applyPlaybackUpdate(prev.history, track);
      return { ...prev, history: newHistory };
    });
  };

  const handlePlaybackState = (id: number, isPlaying: boolean) => {
    setData((prev) => ({
      ...prev,
      history: prev.history.map((h) =>
        h.id === id ? { ...h, is_playing: isPlaying } : h,
      ),
    }));
  };

  useEffect(() => {
    setIsMyProfile(localStorage.getItem("username") === username);
    setIsLogged(!!localStorage.getItem("username"));
    setIdentityReady(true);
  }, [username]);

  useEffect(() => {
    if (!username || !identityReady) return;
    let active = true;
    let refreshing = false;
    let refreshQueued = false;

    const fetchSnapshot = async () => {
      if (refreshing) {
        refreshQueued = true;
        return;
      }
      refreshing = true;
      const revision = playbackRevision.current;
      try {
        const response = await fetch(
          `${API_URL}/api/profile/${encodeURIComponent(String(username))}/snapshot`,
          { credentials: "include", cache: "no-store" },
        );
        if (!response.ok) throw new Error(`Profile ${response.status}`);
        const snapshot = await response.json();
        if (!active) return;
        setData((prev) => ({
          history:
            revision === playbackRevision.current
              ? snapshot.history || []
              : prev.history,
          stats: snapshot.stats || {},
          user: snapshot.user || null,
          taste: prev.taste,
          followStats: snapshot.followStats || {
            followers: 0,
            following: 0,
            is_following: false,
          },
        }));
        if (snapshot.user) setError("");
        else setError("User not found");
      } catch (err) {
        if (!active) return;
        console.error("Ошибка загрузки профиля:", err);
        setError(t("Ошибка подключения к серверу"));
      } finally {
        refreshing = false;
        if (active && refreshQueued) {
          refreshQueued = false;
          void fetchSnapshot();
        } else if (active) {
          setLoading(false);
        }
      }
    };

    const fetchSecondary = async () => {
      const viewer = localStorage.getItem("username");
      const json = (url: string, fallback: unknown) =>
        fetch(url, { credentials: "include" })
          .then((response) => (response.ok ? response.json() : fallback))
          .catch(() => fallback);
      const [taste, recommendations, wrappedData, moodData] = await Promise.all(
        [
          viewer && viewer !== username
            ? json(`${API_URL}/api/taste-match/${viewer}/${username}`, null)
            : Promise.resolve(null),
          json(`${API_URL}/api/recommendations?username=${username}`, []),
          json(`${API_URL}/api/stats/wrapped?username=${username}`, null),
          json(`${API_URL}/api/user/mood?username=${username}`, null),
        ],
      );
      if (!active) return;
      setData((previous) => ({
        ...previous,
        taste: taste as TasteMatch | null,
      }));
      setRecs(recommendations as ArtistRecommendation[]);
      setWrapped(wrappedData as WrappedStats | null);
      setMood(moodData as MoodInfo | null);
    };
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      void fetchSnapshot();
    };
    const timer = setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);

    const checkNotifications = () => {
      void fetchAndShowNotifications(
        username as string,
        isMyProfile,
        setToasts,
        removeToast,
      );
    };

    void fetchSnapshot();
    void fetchSecondary();
    checkNotifications();

    // Live updates: the server only opens a user's own channel
    const subscription = isMyProfile
      ? subscribeSocket(
          `/ws/${username}`,
          {
            onOpen: refresh,
            onMessage: (event) => {
              try {
                const msg = JSON.parse(event.data);
                if (msg.type === "NEW_SCROBBLE") {
                  handleNewScrobble(msg.track);
                  if (msg.counted) refresh();
                  checkNotifications();
                } else if (msg.type === "PLAYBACK_STATE") {
                  if (msg.track) handleNewScrobble(msg.track);
                  else {
                    playbackRevision.current++;
                    handlePlaybackState(msg.id, msg.is_playing);
                  }
                  if (msg.counted) {
                    refresh();
                    checkNotifications();
                  }
                } else if (msg.type === "ACHIEVEMENTS_UNLOCKED") {
                  refresh();
                  checkNotifications();
                } else if (msg.type === "SYNC_INVITE") {
                  if (
                    confirm(
                      t(
                        "Пользователь {user} хочет слушать музыку вместе! Перейти к нему?",
                        { user: msg.from },
                      ),
                    )
                  ) {
                    router.push(`/user/${msg.from}`);
                  }
                } else if (msg.type === "IMPORT_FINISHED") {
                  alert(msg.message);
                  void fetchSnapshot();
                  void fetchSecondary();
                }
              } catch {
                // Ignore malformed messages; polling can still reconcile state.
              }
            },
          },
          { authed: true },
        )
      : null;
    wsRef.current = subscription;
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
      subscription?.close();
      if (wsRef.current === subscription) wsRef.current = null;
    };
  }, [username, isMyProfile, identityReady, router, t]);

  // Таймеры для уведомлений теперь создаются индивидуально при их добавлении

  const handleFollow = async () => {
    if (followPending.current) return;
    followPending.current = true;
    const previous = data.followStats;
    const nextFollowing = !previous.is_following;
    setData((current) => ({
      ...current,
      followStats: {
        ...current.followStats,
        is_following: nextFollowing,
        followers: Math.max(
          0,
          current.followStats.followers + (nextFollowing ? 1 : -1),
        ),
      },
    }));
    try {
      const res = await fetch(`${API_URL}/api/follow/${username}`, {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Follow ${res.status}`);
      if (res.ok) {
        const result = await res.json();
        const serverFollowing = result.status === "followed";
        setData((prev) => ({
          ...prev,
          followStats: {
            ...prev.followStats,
            is_following: serverFollowing,
            followers: Math.max(
              0,
              previous.followers + (serverFollowing ? 1 : -1),
            ),
          },
        }));
      }
    } catch (err) {
      console.error(err);
      setData((current) => ({ ...current, followStats: previous }));
    } finally {
      followPending.current = false;
    }
  };

  const openFollowModal = async (type: string) => {
    setFollowModal({
      isOpen: true,
      type,
      title: type === "followers" ? t("Подписчики") : t("Подписки"),
      users: [],
      loading: true,
    });
    try {
      const res = await fetch(`${API_URL}/api/${type}/${username}`, {
        credentials: "include",
      });
      if (res.ok) {
        const fetchedUsers = await res.json();
        setFollowModal((prev) => ({
          ...prev,
          users: fetchedUsers,
          loading: false,
        }));
      }
    } catch (err) {
      console.error(err);
      setFollowModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const [importLoading, setImportLoading] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);

  const handleLastfmImport = () => {
    setShowImportConfirm(true);
  };

  const executeLastfmImport = async () => {
    setShowImportConfirm(false);
    setImportLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/import/lastfm`, {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        const started = await res.json();
        alert(
          started.status === "already_running"
            ? t("⏳ Импорт уже идёт. Прогресс виден в настройках → Интеграции.")
            : t(
                "✅ Импорт запущен в фоновом режиме. Прогресс виден в настройках → Интеграции.",
              ),
        );
      } else {
        let errorMessage = t("Не удалось запустить импорт");
        try {
          const err = await res.json();
          errorMessage = err.detail || errorMessage;
        } catch {
          errorMessage = t("Ошибка сервера ({status})", { status: res.status });
        }
        alert(t("Ошибка: {message}", { message: errorMessage }));
      }
    } catch (e) {
      console.error(e);
      alert(t("Ошибка сети: Бэкенд не отвечает. Проверьте соединение."));
    } finally {
      setImportLoading(false);
    }
  };

  return {
    username,
    router,
    data,
    setData,
    loading,
    setLoading,
    showWrapped,
    setShowWrapped,
    toasts,
    setToasts,
    removeToast,
    followModal,
    setFollowModal,
    isMyProfile,
    setIsMyProfile,
    isLogged,
    setIsLogged,
    countries,
    error,
    setError,
    recs,
    setRecs,
    compatibility,
    setCompatibility,
    compatModalOpen,
    setCompatModalOpen,
    compatLoading,
    setCompatLoading,
    handleShowCompatibility,
    wrapped,
    setWrapped,
    mood,
    setMood,
    wsRef,
    handleNewScrobble,
    handleFollow,
    openFollowModal,
    importLoading,
    setImportLoading,
    showImportConfirm,
    setShowImportConfirm,
    handleLastfmImport,
    executeLastfmImport,
  };
}

export type ProfilePageState = ReturnType<typeof useProfilePage>;

/** Values derived from the loaded profile (computed by the page). */
export interface ProfileDerived {
  u: UserInfo;
  fallbackAvatar: string;
  totalXp: number;
  currentLevel: number;
  xpInCurrentLevel: number;
  progressPercent: number;
  rank: ReturnType<typeof getRankInfo>;
  nextRank: ReturnType<typeof getNextRankInfo>;
  socialLinks: SocialLink[];
  favoriteArtistQuery: string;
  favoriteAlbumSearchQuery: string;
  favoriteAlbumRedirectUrl: string;
  displayedAchs: AchievementInfo[];
}

export type ProfileViewProps = ProfilePageState & ProfileDerived;
