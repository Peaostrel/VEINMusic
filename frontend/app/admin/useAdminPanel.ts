"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/app/lib/api";
import type {
  User,
  SuspiciousUser,
  Achievement,
  AvatarFrame,
  SystemAnnouncement,
  FeatureFlag,
  Track,
  SystemHealth,
  SystemAnalytics,
} from "./types";

/** All state, data loading and actions of the admin panel. */
export function useAdminPanel() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    | "overview"
    | "users"
    | "antifraud"
    | "catalog"
    | "gamification"
    | "announcements"
  >("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Base Data
  const [users, setUsers] = useState<User[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [totalScrobbles, setTotalScrobbles] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);

  // New Admin Module Data
  const [suspiciousUsers, setSuspiciousUsers] = useState<SuspiciousUser[]>([]);
  const [frames, setFrames] = useState<AvatarFrame[]>([]);
  const [announcements, setAnnouncements] = useState<SystemAnnouncement[]>([]);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [analytics, setAnalytics] = useState<SystemAnalytics | null>(null);
  const [xpMultiplier, setXpMultiplier] = useState(1.0);

  // Search & Filter States
  const [userSearch, setUserSearch] = useState("");
  const [trackSearch, setTrackSearch] = useState("");

  // Catalog Merge Form State
  const [sourceTrackId, setSourceTrackId] = useState("");
  const [targetTrackId, setTargetTrackId] = useState("");
  const [sourceArtist, setSourceArtist] = useState("");
  const [targetArtist, setTargetArtist] = useState("");

  // Frame Modal / Create Form
  const [newFrame, setNewFrame] = useState({
    name: "",
    code: "",
    css_style: "",
    rarity: "common",
    required_level: 1,
  });

  // Announcement Form
  const [newAnn, setNewAnn] = useState({
    title: "",
    message: "",
    type: "info",
  });

  // Feature Flag Form
  const [newFlag, setNewFlag] = useState({
    key: "",
    description: "",
    is_enabled: true,
  });

  const API_BASE = API_URL;

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [
        statsRes,
        healthRes,
        analyticsRes,
        suspiciousRes,
        framesRes,
        annRes,
        flagsRes,
        multRes,
      ] = await Promise.all([
        fetch(`${API_BASE}/api/admin/stats`, { credentials: "include" }),
        fetch(`${API_BASE}/api/admin/system/health`, {
          credentials: "include",
        }),
        fetch(`${API_BASE}/api/admin/system/analytics`, {
          credentials: "include",
        }),
        fetch(`${API_BASE}/api/admin/antifraud/suspicious`, {
          credentials: "include",
        }),
        fetch(`${API_BASE}/api/admin/frames`, { credentials: "include" }),
        fetch(`${API_BASE}/api/admin/announcements`, {
          credentials: "include",
        }),
        fetch(`${API_BASE}/api/admin/feature-flags`, {
          credentials: "include",
        }),
        fetch(`${API_BASE}/api/admin/economy/multiplier`, {
          credentials: "include",
        }),
      ]);

      if (!statsRes.ok) {
        throw new Error("Доступ в панель администратора запрещен");
      }

      const statsData = await statsRes.json();
      setUsers(statsData.users || []);
      setTracks(statsData.tracks || []);
      setAchievements(statsData.achievements || []);
      setTotalScrobbles(statsData.total_scrobbles || 0);
      setTotalUsers(statsData.total_users || 0);

      if (healthRes.ok) setHealth(await healthRes.json());
      if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
      if (suspiciousRes.ok) {
        const d = await suspiciousRes.json();
        setSuspiciousUsers(d.suspicious_users || []);
      }
      if (framesRes.ok) {
        const d = await framesRes.json();
        setFrames(d.frames || []);
      }
      if (annRes.ok) {
        const d = await annRes.json();
        setAnnouncements(d.announcements || []);
      }
      if (flagsRes.ok) {
        const d = await flagsRes.json();
        setFeatureFlags(d.feature_flags || []);
      }
      if (multRes.ok) {
        const d = await multRes.json();
        setXpMultiplier(d.multiplier || 1.0);
      }

      setLoading(false);
    } catch (e: any) {
      setError(e.message || "Ошибка загрузки панели администратора");
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- USER MODERATION ACTIONS ---
  const handleToggleBan = async (username: string, currentBanned: boolean) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${username}/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ is_banned: !currentBanned }),
      });
      if (res.ok) {
        loadAllData();
      } else {
        alert(await res.text());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleVerify = async (
    username: string,
    currentVerified: boolean,
  ) => {
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/users/${username}/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ is_verified: !currentVerified }),
        },
      );
      if (res.ok) {
        loadAllData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleChangeRole = async (username: string, currentRole: string) => {
    const newRole = prompt(
      `Изменить роль для @${username} (admin, moderator, user):`,
      currentRole,
    );
    if (!newRole || !["admin", "moderator", "user"].includes(newRole)) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${username}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        loadAllData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetProfile = async (username: string) => {
    if (
      !confirm(`Очистить аватар, обложку и описание пользователя @${username}?`)
    )
      return;
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/users/${username}/reset-profile`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (res.ok) {
        alert("Профиль очищен");
        loadAllData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteUser = async (username: string) => {
    if (
      !confirm(
        `Навсегда удалить аккаунт @${username}? Это действие необратимо!`,
      )
    )
      return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${username}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        loadAllData();
      } else {
        alert(await res.text());
      }
    } catch (e) {
      console.error(e);
    }
  };

  // --- ANTIFRAUD ACTIONS ---
  const handleResetSuspiciousXp = async (username: string) => {
    if (
      !confirm(
        `Сбросить нечестный XP и обнулить стрик пользователя @${username}?`,
      )
    )
      return;
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/antifraud/${username}/reset-xp`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (res.ok) {
        alert("Опыт пользователя сброшен, аккаунт помечен");
        loadAllData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUnflagAntifraud = async (username: string) => {
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/antifraud/${username}/unflag`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (res.ok) {
        loadAllData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // --- CATALOG MERGE ACTIONS ---
  const handleMergeTracks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceTrackId || !targetTrackId) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/catalog/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          source_track_id: Number.parseInt(sourceTrackId, 10),
          target_track_id: Number.parseInt(targetTrackId, 10),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || "Треки успешно объединены!");
        setSourceTrackId("");
        setTargetTrackId("");
        loadAllData();
      } else {
        alert(data.detail || "Ошибка объединения треков");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleMergeArtists = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceArtist || !targetArtist) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/catalog/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          source_artist: sourceArtist,
          target_artist: targetArtist,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || "Исполнители успешно объединены!");
        setSourceArtist("");
        setTargetArtist("");
        loadAllData();
      } else {
        alert(data.detail || "Ошибка объединения артистов");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- GAMIFICATION / FRAMES & MULTIPLIER ---
  const handleSetMultiplier = async (val: number) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/economy/multiplier`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ multiplier: val }),
      });
      if (res.ok) {
        setXpMultiplier(val);
        alert(`Множитель опыта установлен на x${val}`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateFrame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFrame.name || !newFrame.code) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/frames`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newFrame),
      });
      if (res.ok) {
        setNewFrame({
          name: "",
          code: "",
          css_style: "",
          rarity: "common",
          required_level: 1,
        });
        loadAllData();
      } else {
        alert(await res.text());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteFrame = async (id: number) => {
    if (!confirm("Удалить эту рамку?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/frames/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        loadAllData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // --- ANNOUNCEMENTS ACTIONS ---
  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAnn.title || !newAnn.message) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...newAnn, is_active: true }),
      });
      if (res.ok) {
        setNewAnn({ title: "", message: "", type: "info" });
        loadAllData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleAnnouncement = async (
    id: number,
    currentActive: boolean,
  ) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/announcements/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ is_active: !currentActive }),
      });
      if (res.ok) {
        loadAllData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteAnnouncement = async (id: number) => {
    if (!confirm("Удалить оповещение?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/announcements/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        loadAllData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // --- FEATURE FLAGS ACTIONS ---
  const handleToggleFlag = async (key: string, currentEnabled: boolean) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/feature-flags/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ is_enabled: !currentEnabled }),
      });
      if (res.ok) {
        loadAllData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFlag.key) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/feature-flags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newFlag),
      });
      if (res.ok) {
        setNewFlag({ key: "", description: "", is_enabled: true });
        loadAllData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleFlushCache = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/cache/flush`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        alert("Системный кэш успешно очищен!");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
      Boolean(u.display_name?.toLowerCase().includes(userSearch.toLowerCase())),
  );

  const filteredTracks = tracks.filter(
    (t) =>
      t.title.toLowerCase().includes(trackSearch.toLowerCase()) ||
      t.artist.toLowerCase().includes(trackSearch.toLowerCase()),
  );

  return {
    router,
    activeTab,
    setActiveTab,
    loading,
    setLoading,
    error,
    setError,
    users,
    setUsers,
    tracks,
    setTracks,
    achievements,
    setAchievements,
    totalScrobbles,
    setTotalScrobbles,
    totalUsers,
    setTotalUsers,
    suspiciousUsers,
    setSuspiciousUsers,
    frames,
    setFrames,
    announcements,
    setAnnouncements,
    featureFlags,
    setFeatureFlags,
    health,
    setHealth,
    analytics,
    setAnalytics,
    xpMultiplier,
    setXpMultiplier,
    userSearch,
    setUserSearch,
    trackSearch,
    setTrackSearch,
    sourceTrackId,
    setSourceTrackId,
    targetTrackId,
    setTargetTrackId,
    sourceArtist,
    setSourceArtist,
    targetArtist,
    setTargetArtist,
    newFrame,
    setNewFrame,
    newAnn,
    setNewAnn,
    newFlag,
    setNewFlag,
    API_BASE,
    loadAllData,
    handleToggleBan,
    handleToggleVerify,
    handleChangeRole,
    handleResetProfile,
    handleDeleteUser,
    handleResetSuspiciousXp,
    handleUnflagAntifraud,
    handleMergeTracks,
    handleMergeArtists,
    handleSetMultiplier,
    handleCreateFrame,
    handleDeleteFrame,
    handleCreateAnnouncement,
    handleToggleAnnouncement,
    handleDeleteAnnouncement,
    handleToggleFlag,
    handleCreateFlag,
    handleFlushCache,
    filteredUsers,
    filteredTracks,
  };
}

export type AdminPanelState = ReturnType<typeof useAdminPanel>;
