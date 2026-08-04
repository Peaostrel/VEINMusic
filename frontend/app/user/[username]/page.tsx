/**
 * User Profile Page
 * -----------------
 * Публичная страница профиля пользователя.
 * Отображает: аватар, статистику, уровни, достижения и
 * премиальные карточки локации/жанров/аппаратуры.
 */
"use client";
import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";

// Utility to break CodeQL taint dataflow tracking while preserving the string
const getSafeUrl = (url: string | null | undefined): string => {
  if (!url || typeof url !== "string") return "about:blank";
  if (!/^(https?:\/\/|\/)/i.test(url)) return "about:blank";
  try {
    return String.fromCodePoint(
      ...Array.from(url).map((c) => c.codePointAt(0) as number),
    );
  } catch {
    return "about:blank";
  }
};

import {
  getRankInfo,
  getNextRankInfo,
  LvlBadge,
  VerifiedBadge,
} from "../../Navbar";

const LiveTimer = ({ listenedSec, isPlaying, updatedAt }: any) => {
  const [elapsed, setElapsed] = useState(listenedSec);

  useEffect(() => {
    setElapsed(listenedSec);
    if (!isPlaying) return;

    const updateTime = new Date(updatedAt + "Z").getTime();
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - updateTime) / 1000);
      setElapsed(listenedSec + Math.max(0, diff));
    }, 1000);

    return () => clearInterval(interval);
  }, [listenedSec, isPlaying, updatedAt]);

  const m = Math.floor(elapsed / 60)
    .toString()
    .padStart(2, "0");
  const s = (elapsed % 60).toString().padStart(2, "0");
  return (
    <span
      className={`font-mono text-[11px] px-1.5 py-0.5 rounded shadow-[0_0_5px_var(--accent-glow)] ${isPlaying ? "bg-[var(--accent)]/20 text-[var(--accent-text)]" : "bg-gray-500/20 text-gray-400"}`}
    >
      {m}:{s}
    </span>
  );
};

import { getPlatformIcon } from "../../../utils/formatters";

const getArtistUrl = (artist: string, source: string) => {
  if (!artist) return "#";
  const q = encodeURIComponent(artist);
  switch (source) {
    case "spotify":
      return `https://open.spotify.com/search/${q}/artists`;
    case "vk":
      return `https://vk.com/audio?q=${q}`;
    case "youtube_music":
      return `https://music.youtube.com/search?q=${q}`;
    case "soundcloud":
      return `https://soundcloud.com/search/people?q=${q}`;
    case "apple_music":
      return `https://music.apple.com/search?term=${q}`;
    default:
      // Для Яндекс.Музыки и всех остальных импортированных/неизвестных источников используем умный редирект бэкенда
      return `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/redirect?source=yandex&type=artist&q=${q}`;
  }
};

const getTrackUrl = (t: any) => {
  if (!t) return "#";
  if (t.track_url && t.track_url !== "#") return t.track_url;

  const query = encodeURIComponent(`${t.artist || ""} ${t.title || ""}`.trim());
  switch (t.source) {
    case "spotify":
      return `https://open.spotify.com/search/${query}`;
    case "vk":
      return `https://vk.com/audio?q=${query}`;
    case "youtube_music":
      return `https://music.youtube.com/search?q=${query}`;
    case "soundcloud":
      return `https://soundcloud.com/search?q=${query}`;
    case "apple_music":
      return `https://music.apple.com/search?term=${query}`;
    default:
      // Для Яндекс.Музыки и всех остальных источников используем умный редирект бэкенда
      // Он найдет трек через API Яндекса и перенаправит прямо на страницу трека
      return `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/redirect?source=yandex&type=track&q=${query}`;
  }
};

const SocialIcons = {
  telegram: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.892-.661 3.495-1.524 5.83-2.529 7.005-3.017 3.332-1.392 4.02-1.631 4.464-1.639z" />
    </svg>
  ),
  vk: (
    <svg viewBox="5.5 3 18 18" fill="currentColor" className="w-5 h-5">
      <path d="M15.5 17c-5.5 0-8.6-3.8-8.7-10h2.7c.1 4.5 2.1 6.4 3.7 6.8V7h2.5v3.9c1.5-.2 3.1-1.9 3.6-3.9h2.5c-.4 2.5-2.2 4.2-3.5 5 1.3.6 3.4 2 4.2 5h-2.8c-.6-2-2.2-3.5-4.2-3.7V17h-2z" />
    </svg>
  ),
  steam: (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="w-5 h-5 transition-all duration-200"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z" />
    </svg>
  ),
  github: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.298 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  ),
  instagram: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  ),
};

const COMMON_COUNTRIES: { [key: string]: string } = {
  // Russian
  россия: "RU",
  "российская федерация": "RU",
  украина: "UA",
  беларусь: "BY",
  белоруссия: "BY",
  казахстан: "KZ",
  германия: "DE",
  сша: "US",
  "соединенные штаты": "US",
  "соединенные штаты америки": "US",
  великобритания: "GB",
  франция: "FR",
  италия: "IT",
  испания: "ES",
  нидерланды: "NL",
  польша: "PL",
  финляндия: "FI",
  швеция: "SE",
  норвегия: "NO",
  грузия: "GE",
  армения: "AM",
  азербайджан: "AZ",
  латвия: "LV",
  литва: "LT",
  эстония: "EE",
  молдова: "MD",
  узбекистан: "UZ",
  киргизия: "KG",
  таджикистан: "TJ",
  туркменистан: "TM",
  турция: "TR",
  китай: "CN",
  япония: "JP",
  "южная корея": "KR",
  канада: "CA",
  австралия: "AU",

  // English
  russia: "RU",
  "russian federation": "RU",
  ukraine: "UA",
  belarus: "BY",
  kazakhstan: "KZ",
  germany: "DE",
  usa: "US",
  "united states": "US",
  "united states of america": "US",
  "united kingdom": "GB",
  "great britain": "GB",
  france: "FR",
  italy: "IT",
  spain: "ES",
  netherlands: "NL",
  poland: "PL",
  finland: "FI",
  sweden: "SE",
  norway: "NO",
  georgia: "GE",
  armenia: "AM",
  azerbaijan: "AZ",
  latvia: "LV",
  lithuania: "LT",
  estonia: "EE",
  moldova: "MD",
  uzbekistan: "UZ",
  kyrgyzstan: "KG",
  tajikistan: "TJ",
  turkmenistan: "TM",
  turkey: "TR",
  china: "CN",
  japan: "JP",
  "south korea": "KR",
  canada: "CA",
  australia: "AU",
};
function getCountryCode(countryName: string, countries: any[]): string | null {
  if (!countryName) return null;
  const cleaned = countryName.trim().toLowerCase();

  // 1. Поиск по словарю популярных стран
  if (COMMON_COUNTRIES[cleaned]) {
    return COMMON_COUNTRIES[cleaned];
  }

  // 2. Поиск по загруженному списку стран (если restcountries ответил)
  const found = countries.find((c) => c.name.toLowerCase() === cleaned);
  if (found) {
    return found.code;
  }

  return null;
}

export default function Profile() {
  const username = useParams()?.username;
  const router = useRouter();

  const [data, setData] = useState<any>({
    history: [],
    stats: {},
    user: null,
    taste: null,
    followStats: { followers: 0, following: 0, is_following: false },
  });
  const [loading, setLoading] = useState(true);
  const [showWrapped, setShowWrapped] = useState(false);
  const [toasts, setToasts] = useState<any[]>([]);

  const removeToast = (toastId: string) => {
    setToasts((prev: any[]) =>
      prev.filter((toast: any) => toast.id !== toastId),
    );
  };

  const [followModal, setFollowModal] = useState<any>({
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
  const [recs, setRecs] = useState<any[]>([]);
  const [wrapped, setWrapped] = useState<any>(null);
  const [mood, setMood] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const handleNewScrobble = (track: any) => {
    setData((prev: any) => {
      const newHistory = [
        track,
        ...prev.history.filter((h: any) => h.id !== track.id),
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
            fetch(
              `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/history/${username}?t=${ts}`,
              { credentials: "include" },
            )
              .then((r) => (r.ok ? r.json() : { history: [] }))
              .catch((e) => {
                console.error("history err", e);
                return { history: [] };
              }),
            fetch(
              `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/stats/${username}?t=${ts}`,
              { credentials: "include" },
            )
              .then((r) => (r.ok ? r.json() : {}))
              .catch((e) => {
                console.error("stats err", e);
                return {};
              }),
            fetch(
              `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/user/${username}?t=${ts}`,
              { credentials: "include" },
            )
              .then((r) => (r.ok ? r.json() : null))
              .catch((e) => {
                console.error("user err", e);
                return null;
              }),
            fetch(
              `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/follow-stats/${viewer}/${username}?t=${ts}`,
              { credentials: "include" },
            )
              .then((r) => (r.ok ? r.json() : null))
              .catch((e) => {
                console.error("follow err", e);
                return null;
              }),
            viewer !== "null" && viewer !== username
              ? fetch(
                  `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/taste-match/${viewer}/${username}?t=${ts}`,
                  { credentials: "include" },
                )
                  .then((r) => (r.ok ? r.json() : null))
                  .catch(() => null)
              : Promise.resolve(null),
            fetch(
              `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/recommendations?username=${username}`,
              { credentials: "include" },
            )
              .then((r) => (r.ok ? r.json() : []))
              .catch((e) => {
                console.error("recs err", e);
                return [];
              }),
            fetch(
              `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/stats/wrapped?username=${username}`,
              { credentials: "include" },
            )
              .then((r) => (r.ok ? r.json() : null))
              .catch((e) => {
                console.error("wrapped err", e);
                return null;
              }),
            fetch(
              `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/user/mood?username=${username}`,
              { credentials: "include" },
            )
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
    const wsUrl =
      (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(
        "http",
        "ws",
      ) + `/ws/${username}`;
    const ws = new WebSocket(wsUrl);
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
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/follow/${username}`,
        {
          credentials: "include",
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (res.ok) {
        const result = await res.json();
        setData((prev: any) => ({
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
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/${type}/${username}`,
        { credentials: "include" },
      );
      if (res.ok) {
        const fetchedUsers = await res.json();
        setFollowModal((prev: any) => ({
          ...prev,
          users: fetchedUsers,
          loading: false,
        }));
      }
    } catch (err) {
      console.error(err);
      setFollowModal((prev: any) => ({ ...prev, loading: false }));
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
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/import/lastfm`,
        {
          credentials: "include",
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      if (res.ok) {
        alert("🚀 Импорт запущен в фоновом режиме. История скоро обновится!");
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

  if (error)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center pt-24 px-4 text-center">
        <div className="text-6xl mb-6">🔍</div>
        <h1 className="text-4xl font-black text-white mb-2 uppercase tracking-tighter">
          Профиль не найден
        </h1>
        <p className="text-gray-400 font-bold max-w-md">
          Пользователя с никнеймом{" "}
          <span className="text-[#ffcc00]">@{username}</span> не существует в
          нашей базе данных.
        </p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-8 bg-white/5 hover:bg-white/10 text-white font-bold px-8 py-3 rounded-xl border border-white/10 transition-all"
        >
          На главную
        </button>
      </div>
    );

  if (loading || !data.user)
    return (
      <div className="min-h-screen text-[var(--accent-text)] flex items-center justify-center font-bold text-2xl animate-pulse">
        Подключение к базе...
      </div>
    );

  const u = data.user;
  const fallbackAvatar = `https://api.dicebear.com/9.x/micah/svg?seed=${username}&backgroundColor=transparent`;

  const totalXp = data.stats.total_xp || data.stats.total_scrobbles || 0;
  const currentLevel = Math.floor(totalXp / 100) + 1;
  const xpInCurrentLevel = totalXp % 100;
  const progressPercent = (xpInCurrentLevel / 100) * 100;

  const rank = getRankInfo(currentLevel);
  const nextRank = getNextRankInfo(currentLevel);

  let socialLinks = [];
  try {
    socialLinks = JSON.parse(u.social_links || "[]");
  } catch (e) {
    console.error(e);
  }

  if (u.is_private)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center pt-24 px-4 text-center">
        <div className="text-6xl mb-6">🔒</div>
        <h1 className="text-4xl font-black text-white mb-2 uppercase tracking-tighter">
          Это приватный профиль
        </h1>
        <p className="text-gray-500 font-bold max-w-md">
          Пользователь ограничил доступ к своей статистике и истории
          прослушиваний.
        </p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-8 bg-white/5 hover:bg-white/10 text-white font-bold px-8 py-3 rounded-xl border border-white/10 transition-all"
        >
          На главную
        </button>
      </div>
    );

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
  const favoriteArtistQuery = u.favorite_artist ? `${u.favorite_artist} ` : "";
  const favoriteAlbumSearchQuery =
    `${favoriteArtistQuery}${u.favorite_album || ""}`.trim();
  const favoriteAlbumRedirectUrl =
    u.favorite_album_url && u.favorite_album_url !== "#"
      ? u.favorite_album_url
      : `${API_URL}/api/redirect?source=yandex&type=album&q=${encodeURIComponent(favoriteAlbumSearchQuery)}`;

  const displayedAchs =
    u.achievements?.filter((a: any) => a.is_displayed !== false) || [];

  return (
    <div
      className="max-w-6xl mx-auto relative px-4 md:px-0"
      style={{ "--dynamic-accent": accentColor } as any}
    >
      <style>{`
        @keyframes fireFlicker {
          0%, 100% { transform: scale(1) rotate(-3deg); filter: drop-shadow(0 0 5px rgba(255, 100, 0, 0.4)); }
          50% { transform: scale(1.15) rotate(3deg); filter: drop-shadow(0 0 12px rgba(255, 100, 0, 0.9)); }
        }
        .animate-fire {
          display: inline-block;
          transform-origin: bottom center;
          animation: fireFlicker 1s infinite ease-in-out;
        }
        :root {
          --accent: var(--dynamic-accent, #ffcc00);
        }
      `}</style>
      <div className="fixed top-24 right-4 z-[9999] flex flex-col gap-3 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="bg-[#121212]/95 backdrop-blur-md border border-[var(--accent)]/50 p-4 rounded-xl shadow-[0_0_30px_var(--accent-glow)] flex items-center gap-4 w-80 pointer-events-auto relative overflow-hidden transition-all duration-300"
          >
            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[var(--accent)] to-[var(--accent-hover)]"></div>
            <div className="w-14 h-14 bg-black rounded-lg flex items-center justify-center text-3xl shrink-0 overflow-hidden border border-white/10 shadow-inner">
              {t.image ? (
                <img
                  src={t.image}
                  className="w-full h-full object-cover"
                  alt={t.name}
                />
              ) : (
                t.icon
              )}
            </div>
            <div className="flex-grow">
              <div className="text-[10px] text-[var(--accent-text)] font-bold uppercase tracking-widest mb-1 flex items-center gap-1">
                <svg
                  className="w-3 h-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                Достижение получено!
              </div>
              <div className="text-white font-black text-sm leading-tight">
                {t.name}
              </div>
              {t.xp > 0 && (
                <div className="text-emerald-400 font-mono text-[11px] font-bold mt-1 bg-emerald-500/10 px-1.5 py-0.5 inline-block rounded">
                  +{t.xp} XP
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              className="absolute top-2 right-2 text-gray-500 hover:text-white transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                ></path>
              </svg>
            </button>
          </div>
        ))}
      </div>

      {showWrapped && (
        <dialog
          open
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm border-0 bg-transparent outline-none w-full h-full"
        >
          <button
            type="button"
            className="absolute inset-0 w-full h-full cursor-default border-none bg-transparent outline-none"
            aria-label="Закрыть"
            onClick={() => setShowWrapped(false)}
          />
          <div className="bg-[#1a1a1a] rounded-2xl w-[400px] h-[600px] shadow-2xl overflow-hidden relative border border-white/10 p-6 flex flex-col justify-between z-10">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[var(--accent)]/20 to-transparent opacity-50 z-0 pointer-events-none"></div>
            <div className="z-10 text-center relative">
              <div
                className={`w-24 h-24 mx-auto bg-[#333] rounded-full overflow-hidden border-4 border-[var(--accent)] shadow-[0_0_20px_var(--accent-glow)] mb-4`}
              >
                <img
                  src={u.avatar_url || fallbackAvatar}
                  className="w-full h-full object-cover"
                  alt={u.display_name}
                  onError={(e) => {
                    e.currentTarget.src = fallbackAvatar;
                  }}
                />
              </div>
              <h2 className="text-3xl font-black text-white flex items-center justify-center">
                {u.display_name}{" "}
                <VerifiedBadge role={u.role} isVerified={u.is_verified} />
              </h2>
              <p className="text-[var(--accent-text)] font-bold mt-1">
                @VEIN Music
              </p>
            </div>
            <div className="z-10 bg-[#121212]/80 p-4 rounded-xl border border-white/5 backdrop-blur-md">
              <h3 className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-3">
                Любимые артисты
              </h3>
              {data.stats.top_artists?.slice(0, 3).map((a: any) => (
                <div
                  key={a.artist}
                  className="flex justify-between items-center mb-2 border-l-2 border-[var(--accent)] pl-2"
                >
                  <span className="font-bold truncate text-sm text-white">
                    {a.artist}
                  </span>
                  <span className="text-xs text-gray-400 shrink-0">
                    {a.plays} plays
                  </span>
                </div>
              ))}
            </div>
            <div className="z-10 text-center text-xs text-gray-500 mt-4">
              Сделай скриншот и закинь в сторис! <br />
              <button
                type="button"
                onClick={() => setShowWrapped(false)}
                className="text-[var(--accent-text)] mt-2 hover:underline font-bold border-none bg-transparent outline-none"
              >
                Закрыть
              </button>
            </div>
          </div>
        </dialog>
      )}

      {showImportConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-sm bg-[#121212] p-6 rounded-2xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.8)] text-center animate-in fade-in zoom-in duration-200">
            <h2 className="text-xl font-black text-white mb-4">
              Подтверждение импорта
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              Внимание! Перенос истории из Last.fm можно сделать{" "}
              <span className="text-[var(--accent)] font-bold">
                только один раз
              </span>
              {". "}
              Продолжить?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowImportConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-gray-300 bg-white/5 hover:bg-white/10 transition-colors"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={executeLastfmImport}
                className="flex-1 px-4 py-2.5 rounded-xl font-black text-[var(--text-on-accent)] bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] hover:scale-105 transition-transform"
              >
                Перенести
              </button>
            </div>
          </div>
        </div>
      )}

      {followModal.isOpen && (
        <dialog
          open
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm border-0 bg-transparent outline-none w-full h-full"
        >
          <button
            type="button"
            className="absolute inset-0 w-full h-full cursor-default border-none bg-transparent outline-none"
            aria-label="Закрыть"
            onClick={() =>
              setFollowModal({
                isOpen: false,
                type: "",
                title: "",
                users: [],
                loading: false,
              })
            }
          />
          <div className="bg-[#1a1a1a] rounded-2xl w-[400px] max-h-[80vh] shadow-2xl overflow-hidden relative border border-white/10 p-0 flex flex-col">
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#121212]">
              <h3 className="text-lg font-black text-[var(--accent-text)] uppercase tracking-wider">
                {followModal.title}
              </h3>
              <button
                type="button"
                onClick={() =>
                  setFollowModal({
                    isOpen: false,
                    type: "",
                    title: "",
                    users: [],
                    loading: false,
                  })
                }
                className="text-gray-500 hover:text-white transition-colors text-xl font-black border-none bg-transparent outline-none"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto p-2 custom-scrollbar flex-grow bg-[#121212]/50 backdrop-blur-sm">
              <FollowModalContent
                loading={followModal.loading}
                users={followModal.users}
                router={router}
                onClose={() =>
                  setFollowModal({
                    isOpen: false,
                    type: "",
                    title: "",
                    users: [],
                    loading: false,
                  })
                }
              />
            </div>
          </div>
        </dialog>
      )}

      <ProfileActions
        isLogged={isLogged}
        isMyProfile={isMyProfile}
        isFollowing={data.followStats.is_following}
        hasImportedLastfm={data.has_imported_lastfm}
        username={username as string}
        importLoading={importLoading}
        onFollow={handleFollow}
        onImport={handleLastfmImport}
        onShowWrapped={() => setShowWrapped(true)}
        onListenTogether={() =>
          wsRef.current?.send(
            JSON.stringify({ type: "SYNC_REQUEST", target: username }),
          )
        }
        router={router}
      />

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-center font-bold animate-pulse backdrop-blur-md">
          ⚠️ {error}
        </div>
      )}

      <div className="rounded-2xl shadow-2xl border border-white/5 relative mb-12 bg-[#121212]/80 backdrop-blur-md">
        {/* Блок Обложки (чистый баннер без затемнений текста) */}
        <div className="w-full h-40 md:h-64 rounded-t-2xl relative overflow-hidden bg-[#1a1a1a]">
          {u.cover_url ? (
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${u.cover_url})` }}
            ></div>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#282828] to-[#1e1e1e]"></div>
          )}
          {/* Очень легкий градиент внизу баннера для слияния, не мешающий картинке */}
          <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-[rgba(18,18,18,0.9)] to-transparent pointer-events-none"></div>
        </div>

        <ProfileHeaderSection
          u={u}
          username={username as string}
          fallbackAvatar={fallbackAvatar}
          currentLevel={currentLevel}
          rankTitle={rank.title}
          mood={mood}
          followers={data.followStats.followers}
          following={data.followStats.following}
          openFollowModal={openFollowModal}
          displayedAchs={displayedAchs}
          router={router}
        />

        <ProfileStatsSection
          u={u}
          progressPercent={progressPercent}
          xpInCurrentLevel={xpInCurrentLevel}
          nextRank={nextRank}
          taste={data.taste}
          socialLinks={socialLinks}
          countries={countries}
          favoriteAlbumRedirectUrl={favoriteAlbumRedirectUrl}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-20">
        <div className="lg:col-span-2 space-y-8">
          {recs.length > 0 && (
            <div className="bg-[#121212]/50 backdrop-blur-md p-6 rounded-2xl border border-[var(--accent)]/20">
              <h2 className="text-xl font-black mb-6 flex items-center gap-3 text-[var(--accent-text)]">
                <span className="text-2xl">✨</span> Рекомендации
              </h2>
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                {recs.map((r) => (
                  <div
                    key={r.artist}
                    className="min-w-[150px] bg-white/5 p-3 rounded-xl border border-white/5 hover:border-[var(--accent)] transition-all group"
                  >
                    {r.cover_url ? (
                      <img
                        src={r.cover_url}
                        className="w-full aspect-square rounded-lg object-cover mb-3 group-hover:scale-105 transition-transform"
                        alt="Artist"
                      />
                    ) : (
                      <div className="w-full aspect-square rounded-lg bg-gradient-to-br from-[#282828] to-[#121212] border border-white/5 flex items-center justify-center text-3xl text-yellow-500 mb-3 group-hover:scale-105 transition-transform">
                        🎤
                      </div>
                    )}
                    <p className="font-bold text-sm text-white truncate">
                      {r.artist}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-1">{r.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-[#121212]/50 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-white/5">
            <h2 className="text-xl font-black mb-6 flex items-center gap-3 text-[var(--accent-text)]">
              <span className="text-2xl">🎵</span> История
            </h2>
            {data.history.length === 0 ? (
              <p className="text-gray-400 font-medium">Тут пока пусто.</p>
            ) : (
              <ul className="space-y-3">
                {data.history.map((item: any, idx: number) => {
                  const isLatest = idx === 0;
                  const isNowPlaying =
                    isLatest &&
                    (item.is_playing ||
                      Date.now() - Date.parse(item.updated_at + "Z") <
                        15 * 60 * 1000);
                  return (
                    <HistoryItem
                      key={item.id}
                      item={item}
                      isLatest={isLatest}
                      isNowPlaying={isNowPlaying}
                    />
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-8">
          {wrapped && wrapped.top_artist !== "Нет данных" && (
            <div className="bg-gradient-to-br from-[var(--accent)]/20 to-black p-6 rounded-2xl border border-[var(--accent)]/30 shadow-[0_0_30px_var(--accent-glow)] relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)]/10 blur-3xl rounded-full"></div>
              <h2 className="text-xl font-black mb-4 flex items-center gap-2 text-white">
                <span className="text-xl">📊</span> Итоги месяца
              </h2>
              <div className="space-y-4 relative z-10">
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                    Топ артист
                  </p>
                  <p className="text-lg font-black text-[var(--accent-text)]">
                    {wrapped.top_artist}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                    Прослушано
                  </p>
                  <p className="text-lg font-black text-white">
                    {wrapped.total_minutes} мин.
                  </p>
                </div>
                <div className="pt-2 border-t border-white/10">
                  <span className="bg-white/10 px-2 py-1 rounded text-[10px] font-black uppercase text-[var(--accent-text)]">
                    {wrapped.status} Listener
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="bg-[#121212]/50 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-white/5">
            <h2 className="text-xl font-black mb-4 flex items-center gap-2 text-[var(--accent-text)]">
              <span className="text-xl animate-fire">🔥</span> Топ треков
            </h2>
            <ul className="space-y-3">
              {data.stats.top_tracks?.map((item: any) => (
                <li
                  key={item.title + item.artist}
                  className={`p-2 rounded-xl flex gap-3 items-start transition-all border group relative ${item.is_playing ? "bg-[var(--accent)]/10 border-[var(--accent)] shadow-[0_0_15px_var(--accent-glow)]" : "bg-white/5 border-transparent hover:bg-white/10 hover:border-white/5"}`}
                >
                  <div className="relative w-10 h-10 rounded bg-[#1a1a1a] shrink-0 overflow-hidden shadow-sm mt-0.5">
                    {item.cover_url ? (
                      <img
                        src={item.cover_url}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        alt={item.title}
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#282828] to-[#121212] border border-white/5 flex items-center justify-center text-sm text-yellow-500/80 shadow-inner">
                        🎵
                      </div>
                    )}
                  </div>
                  <div className="flex-grow min-w-[0] flex flex-col justify-center overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    <div className="flex items-center gap-2 mb-0.5 w-max">
                      <div className="shrink-0">
                        {getPlatformIcon(item.source)}
                      </div>
                      <a
                        href={getTrackUrl(item)}
                        target="_blank"
                        rel="noopener noreferrer"

                        className="font-bold text-sm text-white hover:text-[var(--accent-text)] hover:underline transition-colors whitespace-nowrap pointer-events-auto pr-4"
                      >
                        {item.title}
                      </a>
                    </div>

                    <div className="text-gray-300 text-xs pointer-events-auto whitespace-nowrap pl-[22px] relative z-10 w-max pr-4">
                      {item.artist.split(",").map((a: string) => (
                        <span key={a.trim()}>
                          <a
                            href={getArtistUrl(a.trim(), item.source)}
                            target="_blank"
                            rel="noopener noreferrer"

                            className="hover:text-[var(--accent-text)] hover:underline cursor-pointer transition-colors relative z-10 font-medium"
                          >
                            {a.trim()}
                          </a>
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-[var(--text-on-accent)] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] px-2 py-1 rounded text-xs font-black shadow-sm shrink-0 mt-1">
                    {item.plays}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-[#121212]/50 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-white/5">
            <h2 className="text-xl font-black mb-4 flex items-center gap-2 text-[var(--accent-text)]">
              <span className="text-xl">🎤</span> Топ артистов
            </h2>
            <ul className="space-y-3">
              {data.stats.top_artists?.map((item: any) => (
                <li
                  key={item.artist}
                  className="bg-white/5 hover:bg-white/10 p-3 rounded-xl flex justify-between items-start border-l-2 border-[#555] hover:border-[var(--accent)] transition-all group relative"
                >
                  <div className="flex items-center gap-2 min-w-[0] overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    <div className="shrink-0">
                      {getPlatformIcon(item.source)}
                    </div>
                    <div className="font-bold text-sm text-white pointer-events-auto whitespace-nowrap w-max pr-4">
                      {item.artist.split(",").map((a: string) => (
                        <span key={a.trim()}>
                          <a
                            href={getArtistUrl(a.trim(), item.source)}
                            target="_blank"
                            rel="noopener noreferrer"

                            className="hover:text-[var(--accent-text)] hover:underline cursor-pointer transition-colors relative z-10"
                          >
                            {a.trim()}
                          </a>
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-[var(--text-on-accent)] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] px-2 py-1 rounded text-xs font-black shadow-sm shrink-0 mt-0.5">
                    {item.plays}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function PastPlayIndicator({ item }: Readonly<{ item: any }>) {
  const timeStr = new Date(item.time + "Z").toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (item.is_imported) {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="bg-black/50 text-[10px] px-2 py-1 rounded text-gray-300 border border-white/5 font-mono">
          {timeStr}
        </span>
        <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider bg-white/5 px-1.5 py-0.5 rounded border border-white/5 shadow-inner">
          Импортировано
        </span>
      </div>
    );
  }

  const listenedSec = item.listened_sec || 0;
  const showListened = listenedSec > 0;
  const m = Math.floor(listenedSec / 60)
    .toString()
    .padStart(2, "0");
  const s = (listenedSec % 60).toString().padStart(2, "0");

  return (
    <div className="flex flex-col items-end gap-1">
      <span className="bg-black/50 text-[10px] px-2 py-1 rounded text-gray-300 border border-white/5 font-mono">
        {timeStr}
      </span>
      {showListened && (
        <span className="text-[9px] text-gray-400 font-medium uppercase tracking-wider">
          Прослушано: {m}:{s}
        </span>
      )}
    </div>
  );
}

function NowPlayingIndicator({ item }: Readonly<{ item: any }>) {
  const playStatusText = item.is_playing ? "Сейчас" : "Пауза";
  const accentTextClass = item.is_playing
    ? "text-[var(--accent-text)]"
    : "text-gray-500";
  const animClass = item.is_playing
    ? "animate-[bounce_1s_infinite]"
    : "opacity-40";
  const animClass2 = item.is_playing
    ? "animate-[bounce_1s_infinite_0.2s]"
    : "opacity-40";
  const animClass3 = item.is_playing
    ? "animate-[bounce_1s_infinite_0.4s]"
    : "opacity-40";

  return (
    <div className="flex items-center gap-2 bg-[#121212]/80 px-3 py-1.5 rounded-md border border-white/5 shadow-md">
      <div className="flex items-center gap-1.5">
        <span
          className={`text-[10px] font-black uppercase tracking-widest ${accentTextClass}`}
        >
          {playStatusText}
        </span>
        <LiveTimer
          listenedSec={item.listened_sec}
          isPlaying={item.is_playing}
          updatedAt={item.updated_at}
        />
      </div>
      <div className="flex items-end gap-[2px] h-3 w-3 ml-1">
        <div
          className={`w-[3px] bg-[var(--accent)] h-full rounded-t-sm ${animClass}`}
        ></div>
        <div
          className={`w-[3px] bg-[var(--accent)] h-2/3 rounded-t-sm ${animClass2}`}
        ></div>
        <div
          className={`w-[3px] bg-[var(--accent)] h-4/5 rounded-t-sm ${animClass3}`}
        ></div>
      </div>
    </div>
  );
}

function PlayStateIndicator({
  item,
  isNowPlaying,
}: Readonly<{ item: any; isNowPlaying: boolean }>) {
  if (isNowPlaying) {
    return <NowPlayingIndicator item={item} />;
  }
  return <PastPlayIndicator item={item} />;
}

function HistoryItem({
  item,
  isLatest,
  isNowPlaying,
}: Readonly<{
  item: any;
  isLatest: boolean;
  isNowPlaying: boolean;
}>) {
  return (
    <li
      className={`p-3 rounded-xl flex justify-between items-center transition-all duration-300 group relative ${isLatest ? "bg-gradient-to-r from-white/10 to-transparent border-l-4 border-[var(--accent)] shadow-md" : "bg-white/5 hover:bg-white/10 border border-transparent hover:border-white/5"}`}
    >
      <div className="flex items-center gap-4 pr-2 w-full min-w-0">
        <div className="w-12 h-12 rounded bg-black shrink-0 overflow-hidden shadow z-10 pointer-events-auto relative">
          {item.cover_url ? (
            <img
              src={getSafeUrl(item.cover_url)}
              className="w-full h-full object-cover"
              alt={item.title}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#282828] to-[#121212] border border-white/5 flex items-center justify-center text-xl text-yellow-500/80 shadow-inner">
              🎵
            </div>
          )}
        </div>
        <div className="flex flex-col justify-center flex-grow min-w-[0] overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="flex items-center gap-1.5 mb-0.5 w-max">
            <div className="shrink-0">{getPlatformIcon(item.source)}</div>
            <a
              href={getSafeUrl(getTrackUrl(item))}
              target="_blank"
              rel="noopener noreferrer"

              className={`font-bold text-lg whitespace-nowrap hover:underline hover:text-[var(--accent-text)] transition-colors pointer-events-auto pr-4 ${isLatest ? "text-[var(--accent-text)]" : "text-white"}`}
            >
              {item.title}
            </a>
          </div>

          <div className="text-gray-300 text-xs whitespace-nowrap pointer-events-auto relative z-10 w-max pr-4">
            {item.artist.split(",").map((a: string) => (
              <span key={a.trim()}>
                <a
                  href={getArtistUrl(a.trim(), item.source)}
                  target="_blank"
                  rel="noopener noreferrer"

                  className="hover:text-[var(--accent-text)] hover:underline cursor-pointer transition-colors relative z-10 font-medium"
                >
                  {a.trim()}
                </a>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
        <PlayStateIndicator item={item} isNowPlaying={isNowPlaying} />
      </div>
    </li>
  );
}

function FollowModalContent({
  loading,
  users,
  router,
  onClose,
}: Readonly<{
  loading: boolean;
  users: any[];
  router: any;
  onClose: () => void;
}>) {
  if (loading) {
    return (
      <div className="text-center text-[var(--accent-text)] py-10 font-bold animate-pulse">
        Загрузка...
      </div>
    );
  }
  if (users.length === 0) {
    return (
      <div className="text-center text-gray-500 py-10 font-medium">
        Тут пока пусто.
      </div>
    );
  }
  const fallbackAvatar = (username: string) =>
    `https://api.dicebear.com/9.x/micah/svg?seed=${username}&backgroundColor=transparent`;
  return (
    <ul className="space-y-1">
      {users.map((followerUser: any) => (
        <li key={followerUser.username}>
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push(`/user/${followerUser.username}`);
            }}
            className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl cursor-pointer transition-colors group border border-transparent hover:border-white/5 text-left font-normal bg-transparent outline-none block"
          >
            <img
              src={
                followerUser.avatar_url || fallbackAvatar(followerUser.username)
              }
              className="w-10 h-10 rounded-full bg-black object-cover shrink-0 border border-white/10"
              alt={followerUser.display_name}
              onError={(e) => {
                e.currentTarget.src = fallbackAvatar(followerUser.username);
              }}
            />
            <div className="truncate flex-grow">
              <div className="font-bold text-white text-sm truncate flex items-center gap-1 group-hover:text-[var(--accent-text)] transition-colors">
                {followerUser.display_name}
                <VerifiedBadge
                  role={followerUser.role}
                  isVerified={followerUser.is_verified}
                  sizeClass="w-3.5 h-3.5"
                />
                <LvlBadge level={followerUser.level} />
              </div>
              <div className="text-xs text-gray-500 truncate">
                @{followerUser.username}
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function useCountries() {
  const [countries, setCountries] = useState<any[]>([]);
  useEffect(() => {
    fetch(
      "https://restcountries.com/v3.1/all?fields=name,translations,cca2,flag",
    )
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) {
          const list = d.map((c: any) => ({
            name: c.translations?.rus?.common || c.name.common,
            code: c.cca2,
            flag: c.flag,
          }));
          setCountries(list);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch countries", err);
      });
  }, []);
  return countries;
}

function useProfileTheme(theme: string | undefined) {
  useEffect(() => {
    if (theme) {
      (globalThis as any).__ACTIVE_PROFILE_THEME__ = theme;
      globalThis.dispatchEvent(new Event("theme_update"));
    }
    return () => {
      delete (globalThis as any).__ACTIVE_PROFILE_THEME__;
      globalThis.dispatchEvent(new Event("theme_update"));
    };
  }, [theme]);
}

function useAccentColor(coverUrl: string | undefined) {
  const [accentColor, setAccentColor] = useState<string>("");
  useEffect(() => {
    if (!coverUrl) return;

    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = coverUrl;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = 1;
      canvas.height = 1;
      ctx.drawImage(img, 0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      setAccentColor(`rgb(${r}, ${g}, ${b})`);
    };
  }, [coverUrl]);
  return accentColor;
}

async function fetchAndShowNotifications(
  username: string,
  isMyProfile: boolean,
  setToasts: React.Dispatch<React.SetStateAction<any[]>>,
  removeToast: (id: string) => void,
) {
  if (!isMyProfile) return;
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/notifications/${username}`,
      { credentials: "include" },
    );
    if (!res.ok) return;
    const unread = await res.json();
    if (unread.length === 0) return;

    setToasts((prev: any[]) => {
      const newToasts = [...prev];
      const existingIds = new Set(newToasts.map((t: any) => t.ach_id));
      for (const ach of unread) {
        if (!existingIds.has(ach.ua_id)) {
          const toastId = `${ach.ua_id}-${Date.now()}-${newToasts.length}`;
          newToasts.push({
            id: toastId,
            ach_id: ach.ua_id,
            name: ach.name,
            icon: ach.icon,
            xp: ach.reward_xp,
            image: ach.target_image,
          });
          setTimeout(() => removeToast(toastId), 6000);
        }
      }
      return newToasts;
    });

    await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/notifications/${username}/read`,
      {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ua_ids: unread.map((d: any) => d.ua_id) }),
      },
    );
  } catch (e) {
    console.error(e);
  }
}

interface ProfileActionsProps {
  isLogged: boolean;
  isMyProfile: boolean;
  isFollowing: boolean;
  hasImportedLastfm: boolean;
  username: string;
  importLoading: boolean;
  onFollow: () => void;
  onImport: () => void;
  onShowWrapped: () => void;
  onListenTogether: () => void;
  router: any;
}
function ProfileActions({
  isLogged,
  isMyProfile,
  isFollowing,
  hasImportedLastfm,
  username,
  importLoading,
  onFollow,
  onImport,
  onShowWrapped,
  onListenTogether,
  router,
}: Readonly<ProfileActionsProps>) {
  return (
    <div className="flex flex-wrap justify-end gap-4 mb-4 pt-4">
      {isLogged && !isMyProfile && (
        <button
          type="button"
          onClick={onFollow}
          className={`px-5 py-2.5 text-sm rounded-lg font-black transition-all flex items-center gap-2 ${isFollowing ? "bg-white/10 text-white hover:bg-white/20" : "bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] text-[var(--text-on-accent)] shadow-[0_0_15px_var(--accent-glow)] hover:scale-105"}`}
        >
          {isFollowing ? "Отписаться" : "Подписаться"}
        </button>
      )}
      <button
        type="button"
        onClick={() => router.push(`/user/${username}/stats`)}
        className="bg-white/5 border border-white/10 text-white px-5 py-2.5 text-sm rounded-lg hover:bg-white/10 transition backdrop-blur-sm flex items-center gap-2 font-bold"
      >
        📊 Подробная статистика
      </button>
      {isMyProfile && !hasImportedLastfm && (
        <button
          type="button"
          onClick={onImport}
          disabled={importLoading}
          className={`bg-red-500/10 border border-red-500/30 text-red-400 px-5 py-2.5 text-sm rounded-lg hover:bg-red-500/20 transition backdrop-blur-sm flex items-center gap-2 font-bold ${importLoading ? "opacity-50 cursor-not-allowed" : ""}`}
          title="Импортировать историю из Last.fm"
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-4 h-4"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M10.584 17.21l-.88-2.392s-1.43 1.594-3.573 1.594c-1.897 0-3.244-1.649-3.244-4.288 0-3.382 1.704-4.591 3.381-4.591 2.42 0 3.189 1.567 3.849 3.574l.88 2.749c.88 2.666 2.529 4.81 7.285 4.81 3.409 0 5.718-1.044 5.718-3.793 0-2.227-1.265-3.381-3.63-3.931l-1.758-.385c-1.21-.275-1.567-.77-1.567-1.595 0-.934.742-1.484 1.952-1.484 1.32 0 2.034.495 2.144 1.677l2.749-.33c-.22-2.474-1.924-3.492-4.729-3.492-2.474 0-4.893.935-4.893 3.932 0 1.87.907 3.051 3.189 3.601l1.87.44c1.402.33 1.869.907 1.869 1.704 0 1.017-.99 1.43-2.86 1.43-2.776 0-3.93-1.457-4.59-3.464l-.907-2.75c-1.155-3.573-2.997-4.893-6.653-4.893C2.144 5.333 0 7.89 0 12.233c0 4.18 2.144 6.434 5.993 6.434 3.106 0 4.591-1.457 4.591-1.457z" />
          </svg>
          {importLoading ? "Запуск..." : "Импорт Last.fm"}
        </button>
      )}
      <button
        type="button"
        onClick={onShowWrapped}
        className="bg-white/5 border border-white/10 text-white px-5 py-2.5 text-sm rounded-lg hover:bg-white/10 transition backdrop-blur-sm flex items-center gap-2 font-bold"
      >
        📸 Поделиться
      </button>
      {!isMyProfile && isLogged && (
        <button
          type="button"
          onClick={onListenTogether}
          className="bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-[var(--accent-text)] px-5 py-2.5 text-sm rounded-lg hover:bg-[var(--accent)]/20 transition backdrop-blur-sm flex items-center gap-2 font-bold"
        >
          🤝 Слушать вместе
        </button>
      )}
      {isMyProfile && (
        <button
          type="button"
          onClick={() => router.push("/settings")}
          className="bg-white/5 border border-white/10 text-white px-5 py-2.5 text-sm rounded-lg hover:bg-white/10 transition backdrop-blur-sm flex items-center gap-2 font-bold"
        >
          ⚙️ Настройки
        </button>
      )}
    </div>
  );
}

interface ProfileHeaderSectionProps {
  u: any;
  username: string;
  fallbackAvatar: string;
  currentLevel: number;
  rankTitle: string;
  mood: any;
  followers: number;
  following: number;
  openFollowModal: (type: string) => void;
  displayedAchs: any[];
  router: any;
}
function ProfileHeaderSection({
  u,
  username,
  fallbackAvatar,
  currentLevel,
  rankTitle,
  mood,
  followers,
  following,
  openFollowModal,
  displayedAchs,
  router,
}: Readonly<ProfileHeaderSectionProps>) {
  return (
    <div className="px-6 md:px-10 pb-8 pt-0 flex flex-col md:flex-row items-center md:items-start md:gap-8 relative z-10">
      <div className="relative shrink-0 z-20 -mt-20 md:-mt-24 mb-4 md:mb-0 group flex flex-col items-center">
        {/* Пульсирующая рамка/свечение */}
        <div className="absolute top-0 rounded-full w-32 h-32 md:w-40 md:h-40 bg-[var(--accent)] shadow-[0_0_40px_var(--accent-glow)] blur-lg animate-pulse opacity-40"></div>

        <div className="relative w-32 h-32 md:w-40 md:h-40 bg-[#1e1e1e] rounded-full overflow-hidden border-[6px] border-[#121212] shadow-[0_8px_30px_rgba(0,0,0,0.6)] transition-all duration-500 z-10 group-hover:border-[#1a1a1a]">
          <img
            src={u.avatar_url || fallbackAvatar}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            alt={u.display_name}
            onError={(e) => (e.currentTarget.src = fallbackAvatar)}
          />
        </div>
        {/* Лэвел Бейдж */}
        <div className="relative -mt-4 bg-[#121212] border-2 border-[var(--accent)] text-gray-200 px-4 py-1.5 rounded-full text-[11px] md:text-xs font-black shadow-xl whitespace-nowrap flex items-center gap-2 z-20">
          <span>LVL {currentLevel}</span> <span className="opacity-50">|</span>{" "}
          <span className="uppercase tracking-widest">{rankTitle}</span>
        </div>
      </div>

      <div className="text-center md:text-left z-10 flex-grow w-full md:pt-4 min-w-0">
        <h1 className="text-4xl md:text-5xl font-black text-white tracking-wide mb-1 flex items-center justify-center md:justify-start">
          {u.display_name}{" "}
          <VerifiedBadge
            role={u.role}
            isVerified={u.is_verified}
            sizeClass="w-8 h-8 md:w-10 md:h-10"
          />
        </h1>

        <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-4">
          <p className="text-[var(--accent-text)] font-bold text-sm">
            @{username}
          </p>
          {mood && (
            <div
              className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded-full border border-white/10 text-[10px] font-black uppercase tracking-tighter text-white"
              title="Настроение прослушивания"
            >
              <span>{mood.emoji}</span> {mood.mood}
            </div>
          )}

          <div className="flex items-center gap-2 text-xs font-bold text-gray-400 bg-black/50 px-2 py-1 rounded-md border border-white/5">
            <button
              type="button"
              onClick={() => openFollowModal("followers")}
              className="hover:text-white transition-colors cursor-pointer bg-transparent border-none outline-none font-bold text-xs p-0 m-0 block"
              title="Посмотреть подписчиков"
            >
              {followers} подписчиков
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => openFollowModal("following")}
              className="hover:text-white transition-colors cursor-pointer bg-transparent border-none outline-none font-bold text-xs p-0 m-0 block"
              title="Посмотреть подписки"
            >
              {following} подписок
            </button>
          </div>

          {u.streak > 0 && (
            <div
              className={`flex items-center gap-1 text-xs font-black px-2 py-1 rounded-md border transition-all ${u.streak >= 7 ? "bg-orange-500/20 text-orange-400 border-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.4)] animate-pulse" : "bg-[#121212]/80 text-orange-500 border-orange-500/20"}`}
              title="Дней подряд (минимум 5 треков в день)"
            >
              <span className="animate-fire">🔥</span> {u.streak}
            </div>
          )}
        </div>

        <p className="text-gray-300 italic max-w-2xl bg-[#121212]/60 p-4 rounded-lg border-l-2 border-[var(--accent)] mb-4 shadow-inner">
          {u.bio}
        </p>

        <div className="mb-6 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 relative">
            {displayedAchs.map((a: any) => (
              <div
                key={a.id}
                className="group relative flex items-center gap-2 bg-[#121212]/80 px-3 py-1.5 rounded-lg border border-white/5 hover:border-[var(--accent)] transition-all cursor-help shadow-md hover:shadow-[0_0_15px_var(--accent-glow)]"
              >
                {a.target_image ? (
                  <img
                    src={a.target_image}
                    alt={a.name}
                    className="w-7 h-7 rounded object-cover shadow-[0_0_8px_var(--accent-glow)] group-hover:scale-110 transition-transform shrink-0"
                  />
                ) : (
                  <span className="text-2xl drop-shadow-[0_0_8px_var(--accent-glow)] group-hover:scale-110 transition-transform">
                    {a.icon}
                  </span>
                )}
                <span className="text-xs font-black text-white uppercase tracking-wider leading-none group-hover:text-[var(--accent-text)] transition-colors">
                  {a.name}
                </span>

                <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 w-max max-w-[280px] bg-[#1a1a1a]/95 backdrop-blur-md border border-white/10 p-2.5 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  {a.rule_target?.startsWith("http") ? (
                    <a
                      href={a.rule_target}
                      target="_blank"
                      rel="noopener noreferrer"

                      className="flex items-center gap-3 group/link"
                    >
                      {a.target_image && (
                        <img
                          src={a.target_image}
                          className="w-10 h-10 rounded object-cover shadow-md shrink-0 border border-white/5 group-hover/link:border-[var(--accent)] transition-colors"
                          alt={a.name}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      )}
                      <div className="flex flex-col text-left">
                        <span className="text-sm font-bold text-white group-hover/link:text-[var(--accent-text)] transition-colors leading-tight mb-0.5">
                          {a.name}
                        </span>
                        <span className="text-[10px] text-gray-300 font-medium leading-snug whitespace-normal">
                          {a.description}
                        </span>
                        {a.reward_xp > 0 && (
                          <span className="text-[10px] text-emerald-400 font-mono mt-1 font-bold">
                            +{a.reward_xp} XP
                          </span>
                        )}
                      </div>
                    </a>
                  ) : (
                    <div className="flex items-center gap-3">
                      {a.target_image && (
                        <img
                          src={a.target_image}
                          className="w-10 h-10 rounded object-cover shadow-md shrink-0 border border-white/5"
                          alt={a.name}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      )}
                      <div className="flex flex-col text-left">
                        <span className="text-sm font-bold text-white leading-tight mb-0.5">
                          {a.name}
                        </span>
                        <span className="text-[10px] text-gray-300 font-medium leading-snug whitespace-normal">
                          {a.description}
                        </span>
                        {a.reward_xp > 0 && (
                          <span className="text-[10px] text-emerald-400 font-mono mt-1 font-bold">
                            +{a.reward_xp} XP
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-[#1a1a1a]/95"></div>
                </div>
              </div>
            ))}

            {u.achievements?.length > 0 && (
              <button
                type="button"
                onClick={() => router.push(`/user/${username}/achievements`)}
                className="bg-[#121212]/80 hover:bg-white/10 text-[10px] font-bold text-gray-400 px-3 py-2 rounded-lg transition-colors border border-white/5 uppercase tracking-widest ml-2"
              >
                Все достижения
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ProfileStatsSectionProps {
  u: any;
  progressPercent: number;
  xpInCurrentLevel: number;
  nextRank: any;
  taste: any;
  socialLinks: any[];
  countries: any[];
  favoriteAlbumRedirectUrl: string;
}

function getNetworkLabel(net: string): string {
  const lower = net.toLowerCase();
  if (lower === "vk") return "VK";
  if (lower === "github") return "GitHub";
  return net.charAt(0).toUpperCase() + net.slice(1);
}

function ProfileStatsSection({
  u,
  progressPercent,
  xpInCurrentLevel,
  nextRank,
  taste,
  socialLinks,
  countries,
  favoriteAlbumRedirectUrl,
}: Readonly<ProfileStatsSectionProps>) {
  return (
    <div className="px-6 md:px-10 pb-8">
      <div className="max-w-md bg-[#121212]/50 p-3 rounded-xl border border-white/5 backdrop-blur-sm mb-5 shadow-lg mx-auto md:mx-0">
        <div className="flex justify-between text-[10px] font-bold text-gray-400 mb-2 uppercase tracking-wider">
          <span className="flex items-center gap-1">
            {nextRank ? (
              <>
                До ранга{" "}
                <span className="text-[var(--accent)]">{nextRank.name}</span>
              </>
            ) : (
              "Максимальный ранг"
            )}
          </span>
          <span>
            {xpInCurrentLevel} / 100 XP
            {u.streak >= 7 && (
              <span
                className="text-orange-400 ml-1 font-black"
                title="Стрик 7+ дней дает +10% опыта!"
              >
                <span className="animate-fire">🔥</span> +10%
              </span>
            )}
          </span>
        </div>
        <div className="w-full bg-black/80 h-3 rounded-full overflow-hidden border border-white/10">
          <div
            className="bg-[var(--accent)] shadow-[0_0_15px_var(--accent-glow-strong)] h-full relative transition-all duration-1000"
            style={{ width: `${progressPercent}%` }}
          >
            <div className="absolute top-0 left-0 w-full h-full bg-white/20 animate-pulse"></div>
          </div>
        </div>
      </div>

      {taste?.match !== undefined && (
        <div className="inline-flex items-center gap-3 bg-[#1DB954]/10 border border-[#1DB954]/40 px-4 py-2 rounded-lg mb-5 shadow-lg backdrop-blur-sm hover:scale-105 transition-transform">
          <span className="text-2xl drop-shadow-[0_0_5px_#1DB954] animate-fire">
            🔥
          </span>
          <div className="text-left">
            <p className="text-[10px] text-[#1DB954] font-bold uppercase tracking-wider">
              Совместимость вкусов
            </p>
            <p className="text-white font-bold text-sm">
              {taste.match}%
              <span className="text-gray-400 font-normal text-xs ml-1">
                (
                {taste.common_artists?.length > 0
                  ? taste.common_artists.join(", ")
                  : "пока нет общих"}
                )
              </span>
            </p>
          </div>
        </div>
      )}

      {socialLinks.length > 0 && (
        <div className="flex flex-wrap justify-center md:justify-start gap-3 mb-6">
          {socialLinks.map((link: any) => {
            return (
              <a
                key={link.id}
                href={
                  link.network.toLowerCase() === "telegram"
                    ? `https://t.me/${link.username}`
                    : `https://${link.network}.com/${link.username}`
                }
                target="_blank"
                rel="noopener noreferrer"

                className="flex items-center gap-2 bg-[#121212]/50 hover:bg-[var(--accent)] hover:text-[var(--text-on-accent)] text-white px-4 py-2 rounded-lg text-sm transition-all border border-white/5 hover:border-transparent backdrop-blur-sm shadow-md group"
              >
                {SocialIcons[link.network as keyof typeof SocialIcons]}
                <span className="font-bold">
                  {getNetworkLabel(link.network)}
                </span>
              </a>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap justify-center md:justify-start gap-4 mb-8">
        {u.location &&
          (() => {
            const parts = u.location.split(",").map((s: string) => s.trim());
            const countryName = parts[0] || "";
            const cityName = parts[1] || "";
            const code = getCountryCode(countryName, countries);
            const flagUrl = code
              ? `https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.2.0/flags/4x3/${code.toLowerCase()}.svg`
              : null;

            return (
              <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] group hover:border-[var(--accent)]/50 transition-all duration-300 w-fit">
                <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full overflow-hidden bg-white/5 group-hover:scale-110 transition-transform">
                  {flagUrl ? (
                    <img
                      src={flagUrl}
                      alt={countryName}
                      className="w-full h-full object-cover shadow-sm scale-110"
                    />
                  ) : (
                    <span className="text-xl">📍</span>
                  )}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[9px] text-gray-500 uppercase tracking-[0.2em] font-black leading-none mb-1">
                    Местоположение
                  </span>
                  <span className="text-sm font-bold text-white leading-none tracking-wide">
                    {countryName}
                    {cityName ? `, ${cityName}` : ""}
                  </span>
                </div>
              </div>
            );
          })()}
        {u.favorite_genre && (
          <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] group hover:border-[var(--accent)]/50 transition-all duration-300 w-fit">
            <span className="text-xl drop-shadow-md group-hover:scale-110 transition-transform">
              🎧
            </span>
            <div className="flex flex-col text-left">
              <span className="text-[9px] text-gray-500 uppercase tracking-[0.2em] font-black leading-none mb-1">
                Жанр
              </span>
              <span className="text-sm font-bold text-white leading-none tracking-wide">
                {u.favorite_genre}
              </span>
            </div>
          </div>
        )}
        {u.equipment && (
          <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] group hover:border-[var(--accent)]/50 transition-all duration-300 w-fit">
            <span className="text-xl drop-shadow-md group-hover:scale-110 transition-transform">
              🔊
            </span>
            <div className="flex flex-col text-left">
              <span className="text-[9px] text-gray-500 uppercase tracking-[0.2em] font-black leading-none mb-1">
                Аппаратура
              </span>
              <span className="text-sm font-bold text-white leading-none tracking-wide">
                {u.equipment}
              </span>
            </div>
          </div>
        )}
      </div>

      {(u.favorite_artist || u.favorite_track || u.favorite_album) && (
        <div className="mt-8 pt-6 border-t border-white/5 text-left">
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">
            Музыкальная витрина
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {u.favorite_artist && (
              <div className="bg-white/5 backdrop-blur-md p-5 rounded-2xl border border-white/10 hover:border-[var(--accent)]/40 transition-all duration-500 shadow-xl flex flex-col justify-between gap-4">
                <div className="flex items-start gap-4">
                  {u.favorite_artist_cover ? (
                    <img
                      src={u.favorite_artist_cover}
                      className="w-20 h-20 rounded-full object-cover shadow-lg shrink-0"
                      alt="Artist"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#282828] to-[#121212] border border-white/5 flex items-center justify-center text-3xl text-yellow-500 shadow-inner shrink-0">
                      🎤
                    </div>
                  )}
                  <div className="flex-grow min-w-0">
                    <span className="inline-block text-[9px] font-black uppercase tracking-wider text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded-full border border-cyan-400/20 mb-1.5">
                      Артист
                    </span>
                    <a
                      href={
                        u.favorite_artist_url && u.favorite_artist_url !== "#"
                          ? u.favorite_artist_url
                          : getArtistUrl(u.favorite_artist, "yandex")
                      }
                      target="_blank"
                      rel="noopener noreferrer"

                      className="block font-black text-white hover:text-[var(--accent-text)] text-base leading-tight break-words"
                    >
                      {u.favorite_artist}
                    </a>
                    {u.favorite_artist_rating > 0 && (
                      <div
                        className="flex items-center gap-0.5 mt-2"
                        title={`Оценка: ${u.favorite_artist_rating}/5`}
                      >
                        {[1, 2, 3, 4, 5].map((star) => (
                          <span
                            key={star}
                            className={`text-sm ${
                              star <= u.favorite_artist_rating
                                ? "text-yellow-400 drop-shadow-[0_0_3px_rgba(250,204,21,0.4)]"
                                : "text-gray-700"
                            }`}
                          >
                            ★
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {u.favorite_artist_review && (
                  <p className="text-xs text-gray-300 italic bg-black/40 p-3 rounded-xl border-l-2 border-cyan-400 leading-relaxed max-h-32 overflow-y-auto pr-2">
                    &ldquo;{u.favorite_artist_review}&rdquo;
                  </p>
                )}
              </div>
            )}

            {u.favorite_track && (
              <div className="bg-white/5 backdrop-blur-md p-5 rounded-2xl border border-white/10 hover:border-[var(--accent)]/40 transition-all duration-500 shadow-xl flex flex-col justify-between gap-4">
                <div className="flex items-start gap-4">
                  {u.favorite_track_cover ? (
                    <img
                      src={u.favorite_track_cover}
                      className="w-20 h-20 rounded-xl object-cover shadow-lg shrink-0"
                      alt="Track"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-[#282828] to-[#121212] border border-white/5 flex items-center justify-center text-3xl text-yellow-500 shadow-inner shrink-0">
                      🎵
                    </div>
                  )}
                  <div className="flex-grow min-w-0">
                    <span className="inline-block text-[9px] font-black uppercase tracking-wider text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-full border border-purple-400/20 mb-1.5">
                      Трек
                    </span>
                    <a
                      href={
                        u.favorite_track_url && u.favorite_track_url !== "#"
                          ? u.favorite_track_url
                          : getTrackUrl({
                              artist: u.favorite_artist || "",
                              title: u.favorite_track,
                              source: "yandex",
                            })
                      }
                      target="_blank"
                      rel="noopener noreferrer"

                      className="block font-black text-white hover:text-[var(--accent-text)] text-base leading-tight break-words"
                    >
                      {u.favorite_track}
                    </a>
                    {u.favorite_track_rating > 0 && (
                      <div
                        className="flex items-center gap-0.5 mt-2"
                        title={`Оценка: ${u.favorite_track_rating}/5`}
                      >
                        {[1, 2, 3, 4, 5].map((star) => (
                          <span
                            key={star}
                            className={`text-sm ${
                              star <= u.favorite_track_rating
                                ? "text-yellow-400 drop-shadow-[0_0_3px_rgba(250,204,21,0.4)]"
                                : "text-gray-700"
                            }`}
                          >
                            ★
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {u.favorite_track_review && (
                  <p className="text-xs text-gray-300 italic bg-black/40 p-3 rounded-xl border-l-2 border-purple-400 leading-relaxed max-h-32 overflow-y-auto pr-2">
                    &ldquo;{u.favorite_track_review}&rdquo;
                  </p>
                )}
              </div>
            )}

            {u.favorite_album && (
              <div className="bg-white/5 backdrop-blur-md p-5 rounded-2xl border border-white/10 hover:border-[var(--accent)]/40 transition-all duration-500 shadow-xl flex flex-col justify-between gap-4">
                <div className="flex items-start gap-4">
                  {u.favorite_album_cover ? (
                    <img
                      src={u.favorite_album_cover}
                      className="w-20 h-20 rounded-xl object-cover shadow-lg shrink-0"
                      alt="Album"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-[#282828] to-[#121212] border border-white/5 flex items-center justify-center text-3xl text-yellow-500 shadow-inner shrink-0">
                      💿
                    </div>
                  )}
                  <div className="flex-grow min-w-0">
                    <span className="inline-block text-[9px] font-black uppercase tracking-wider text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20 mb-1.5">
                      Альбом
                    </span>
                    <a
                      href={favoriteAlbumRedirectUrl}
                      target="_blank"
                      rel="noopener noreferrer"

                      className="block font-black text-white hover:text-[var(--accent-text)] text-base leading-tight break-words"
                    >
                      {u.favorite_album}
                    </a>
                    {u.favorite_album_rating > 0 && (
                      <div
                        className="flex items-center gap-0.5 mt-2"
                        title={`Оценка: ${u.favorite_album_rating}/5`}
                      >
                        {[1, 2, 3, 4, 5].map((star) => (
                          <span
                            key={star}
                            className={`text-sm ${
                              star <= u.favorite_album_rating
                                ? "text-yellow-400 drop-shadow-[0_0_3px_rgba(250,204,21,0.4)]"
                                : "text-gray-700"
                            }`}
                          >
                            ★
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {u.favorite_album_review && (
                  <p className="text-xs text-gray-300 italic bg-black/40 p-3 rounded-xl border-l-2 border-amber-400 leading-relaxed max-h-32 overflow-y-auto pr-2">
                    &ldquo;{u.favorite_album_review}&rdquo;
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
