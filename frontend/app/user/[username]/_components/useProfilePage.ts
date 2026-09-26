"use client";

import type { getRankInfo, getNextRankInfo } from "@/app/lib/ranks";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_URL, wsUrl } from "@/app/lib/api";
import { useCountries } from "@/app/lib/geo";
import { useProfileTheme, useAccentColor } from "./hooks";
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
  const accentColor = useAccentColor(data.history[0]?.cover_url);

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
  const wsRef = useRef<WebSocket | null>(null);

  const handleNewScrobble = (track: HistoryEntry) => {
    setData((prev) => {
      const newHistory = [
        track,
        ...prev.history.filter((h) => h.id !== track.id),
      ].slice(0, 50);
      return { ...prev, history: newHistory };
    });
  };

  useEffect(() => {
    setIsMyProfile(localStorage.getItem("username") === username);
    setIsLogged(!!localStorage.getItem("username"));
  }, [username]);

  useEffect(() => {
    if (!username) return;

    const fetchAllData = async () => {
      try {
        const viewer = localStorage.getItem("username") || "null";
        const ts = Date.now();
        const [hRes, sRes, uRes, fRes, tRes, rRes, wRes, mRes] =
          await Promise.all([
            fetch(`${API_URL}/api/history/${username}?t=${ts}`, {
              credentials: "include",
            })
              .then((r) => (r.ok ? r.json() : { history: [] }))
              .catch((e) => {
                console.error("history err", e);
                return { history: [] };
              }),
            fetch(`${API_URL}/api/stats/${username}?t=${ts}`, {
              credentials: "include",
            })
              .then((r) => (r.ok ? r.json() : {}))
              .catch((e) => {
                console.error("stats err", e);
                return {};
              }),
            fetch(`${API_URL}/api/user/${username}?t=${ts}`, {
              credentials: "include",
            })
              .then((r) => (r.ok ? r.json() : null))
              .catch((e) => {
                console.error("user err", e);
                return null;
              }),
            fetch(`${API_URL}/api/follow-stats/${viewer}/${username}?t=${ts}`, {
              credentials: "include",
            })
              .then((r) => (r.ok ? r.json() : null))
              .catch((e) => {
                console.error("follow err", e);
                return null;
              }),
            viewer !== "null" && viewer !== username
              ? fetch(
                  `${API_URL}/api/taste-match/${viewer}/${username}?t=${ts}`,
                  { credentials: "include" },
                )
                  .then((r) => (r.ok ? r.json() : null))
                  .catch(() => null)
              : Promise.resolve(null),
            fetch(`${API_URL}/api/recommendations?username=${username}`, {
              credentials: "include",
            })
              .then((r) => (r.ok ? r.json() : []))
              .catch((e) => {
                console.error("recs err", e);
                return [];
              }),
            fetch(`${API_URL}/api/stats/wrapped?username=${username}`, {
              credentials: "include",
            })
              .then((r) => (r.ok ? r.json() : null))
              .catch((e) => {
                console.error("wrapped err", e);
                return null;
              }),
            fetch(`${API_URL}/api/user/mood?username=${username}`, {
              credentials: "include",
            })
              .then((r) => (r.ok ? r.json() : null))
              .catch((e) => {
                console.error("mood err", e);
                return null;
              }),
          ]);

        setData({
          history: hRes.history || [],
          stats: sRes || {},
          user: uRes || null,
          taste: tRes,
          followStats: fRes || {
            followers: 0,
            following: 0,
            is_following: false,
          },
        });
        setRecs(rRes);
        setWrapped(wRes);
        setMood(mRes);
        if (uRes) setError("");
        else setError("User not found");
      } catch (err) {
        console.error("Ошибка загрузки профиля:", err);
        setError("Ошибка подключения к серверу");
      } finally {
        setLoading(false);
      }
    };

    const checkNotifications = () => {
      fetchAndShowNotifications(
        username as string,
        isMyProfile,
        setToasts,
        removeToast,
      );
    };

    fetchAllData();
    checkNotifications();

    // WebSocket Integration
    const ws = new WebSocket(wsUrl(`/ws/${username}`));
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "NEW_SCROBBLE") {
        handleNewScrobble(msg.track);
        checkNotifications();
      } else if (msg.type === "SYNC_INVITE") {
        if (
          confirm(
            `Пользователь ${msg.from} хочет слушать музыку вместе! Перейти к нему?`,
          )
        ) {
          router.push(`/user/${msg.from}`);
        }
      } else if (msg.type === "IMPORT_FINISHED") {
        alert(msg.message);
        fetchAllData();
      }
    };

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [username, isMyProfile, router]);

  // Таймеры для уведомлений теперь создаются индивидуально при их добавлении

  const handleFollow = async () => {
    try {
      const res = await fetch(`${API_URL}/api/follow/${username}`, {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const result = await res.json();
        setData((prev) => ({
          ...prev,
          followStats: {
            ...prev.followStats,
            is_following: result.status === "followed",
            followers:
              prev.followStats.followers +
              (result.status === "followed" ? 1 : -1),
          },
        }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openFollowModal = async (type: string) => {
    setFollowModal({
      isOpen: true,
      type,
      title: type === "followers" ? "Подписчики" : "Подписки",
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
            ? "⏳ Импорт уже идёт. Прогресс виден в настройках → Интеграции."
            : "🚀 Импорт запущен в фоновом режиме. Прогресс виден в настройках → Интеграции.",
        );
      } else {
        let errorMessage = "Не удалось запустить импорт";
        try {
          const err = await res.json();
          errorMessage = err.detail || errorMessage;
        } catch {
          errorMessage = `Ошибка сервера (${res.status})`;
        }
        alert(`Ошибка: ${errorMessage}`);
      }
    } catch (e) {
      console.error(e);
      alert("Ошибка сети: Бэкенд не отвечает. Проверьте соединение.");
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
    accentColor,
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
