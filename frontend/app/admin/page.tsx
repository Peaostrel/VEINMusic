"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  ShieldAlert,
  Disc3,
  Trophy,
  Megaphone,
  Activity,
  Trash2,
  Edit,
  CheckCircle,
  Ban,
  RotateCcw,
  Sparkles,
  Search,
  Server,
  Zap,
  Flame,
  Radio,
  RefreshCw,
} from "lucide-react";

// --- ИНТЕРФЕЙСЫ ---
interface User {
  id: number;
  username: string;
  display_name: string;
  avatar_url?: string;
  bio?: string;
  is_verified?: boolean;
  is_dev?: boolean;
  role?: string;
  is_banned?: boolean;
  is_flagged_antifraud?: boolean;
  antifraud_reason?: string;
  scrobbles: number;
  total_xp: number;
}

interface SuspiciousUser {
  user_id: number;
  username: string;
  display_name?: string;
  avatar_url?: string;
  risk_score: number;
  is_banned: boolean;
  is_flagged: boolean;
  antifraud_reason?: string;
  reasons: string[];
  total_scrobbles: number;
  total_xp: number;
}

interface Achievement {
  id: number;
  name: string;
  description: string;
  icon: string;
  rule_type: string;
  rule_value: number;
  rule_target: string | null;
  rule_meta: string | null;
  target_image: string | null;
  reward_xp: number;
}

interface AvatarFrame {
  id: number;
  name: string;
  code: string;
  css_style?: string;
  image_url?: string;
  rarity: string;
  required_level: number;
  is_active: boolean;
}

interface SystemAnnouncement {
  id: number;
  title: string;
  message: string;
  type: string;
  is_active: boolean;
  created_at?: string;
}

interface FeatureFlag {
  id: number;
  key: string;
  description?: string;
  is_enabled: boolean;
}

interface Track {
  id: number;
  title: string;
  artist: string;
  cover_url?: string;
  track_url?: string;
}

interface SystemHealth {
  status: string;
  timestamp: string;
  database: {
    users: number;
    scrobbles: number;
    tracks: number;
    pool_status: string;
  };
  websockets: {
    active_rooms: number;
    connected_clients: number;
  };
  cloud_scrobblers: {
    yandex_users: number;
    spotify_users: number;
  };
}

interface SystemAnalytics {
  dau: number;
  mau: number;
  scrobbles_24h: number;
  source_distribution: Record<string, number>;
}

const getUserRoleBadge = (role?: string) => {
  if (role === "admin") {
    return "bg-red-950/60 border border-red-500/40 text-red-400";
  }
  if (role === "moderator") {
    return "bg-purple-950/60 border border-purple-500/40 text-purple-400";
  }
  return "bg-white/5 text-gray-400";
};

export default function AdminPanel() {
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

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="animate-spin border-4 border-red-500 border-t-transparent rounded-full w-12 h-12"></div>
        <p className="text-gray-400 font-mono text-sm tracking-wider">
          Загрузка панели управления VEIN...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto my-20 p-6 bg-red-950/40 border border-red-500/40 rounded-2xl text-center">
        <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-white mb-2">Доступ ограничен</h2>
        <p className="text-red-300 text-sm mb-6">{error}</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-sm transition"
        >
          На главную
        </button>
      </div>
    );
  }

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

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-2">
              <Server className="w-8 h-8 text-red-500" />
              VEIN Admin Nexus
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono font-bold">
              v2.0 Pro
            </span>
          </div>
          <p className="text-gray-400 text-sm mt-1">
            Командный центр управления платформой, каталогом, безопасностью и
            экономикой
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleFlushCache}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-gray-300 flex items-center gap-2 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            Сброс кэша
          </button>
          <button
            type="button"
            onClick={loadAllData}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-red-600/20 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Обновить данные
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-[#121214] border border-white/5 rounded-2xl">
        {[
          { id: "overview", label: "Обзор и Здоровье", icon: Activity },
          { id: "users", label: `Пользователи (${users.length})`, icon: Users },
          {
            id: "antifraud",
            label:
              "Антифрод" +
              (suspiciousUsers.length > 0
                ? ` (${suspiciousUsers.length})`
                : ""),
            icon: ShieldAlert,
          },
          { id: "catalog", label: "Каталог и Дедупликация", icon: Disc3 },
          { id: "gamification", label: "Геймификация и Рамки", icon: Trophy },
          { id: "announcements", label: "Оповещения и Флаги", icon: Megaphone },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer ${
                isActive
                  ? "bg-red-600 text-white shadow-lg shadow-red-600/20"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ─── TAB 1: OVERVIEW & SYSTEM HEALTH ─────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Quick Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#141418] border border-white/5 p-5 rounded-2xl">
              <div className="flex items-center justify-between text-gray-400 text-xs font-mono mb-2">
                <span>ПОЛЬЗОВАТЕЛИ</span>
                <Users className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-3xl font-black text-white">{totalUsers}</div>
              <div className="text-[11px] text-gray-500 mt-1">
                DAU: {analytics?.dau || 0} • MAU: {analytics?.mau || 0}
              </div>
            </div>

            <div className="bg-[#141418] border border-white/5 p-5 rounded-2xl">
              <div className="flex items-center justify-between text-gray-400 text-xs font-mono mb-2">
                <span>СКРОББЛЫ (ВСЕГО)</span>
                <Disc3 className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-3xl font-black text-white">
                {totalScrobbles.toLocaleString()}
              </div>
              <div className="text-[11px] text-emerald-400 mt-1 font-mono">
                +{analytics?.scrobbles_24h || 0} за 24 часа
              </div>
            </div>

            <div className="bg-[#141418] border border-white/5 p-5 rounded-2xl">
              <div className="flex items-center justify-between text-gray-400 text-xs font-mono mb-2">
                <span>ТРЕКОВ В БАЗЕ</span>
                <Zap className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-3xl font-black text-white">
                {tracks.length}
              </div>
              <div className="text-[11px] text-gray-500 mt-1">
                Каталог нормализован
              </div>
            </div>

            <div className="bg-[#141418] border border-white/5 p-5 rounded-2xl">
              <div className="flex items-center justify-between text-gray-400 text-xs font-mono mb-2">
                <span>WEBSOCKET КЛИЕНТЫ</span>
                <Radio className="w-4 h-4 text-red-500 animate-pulse" />
              </div>
              <div className="text-3xl font-black text-white">
                {health?.websockets.connected_clients || 0}
              </div>
              <div className="text-[11px] text-gray-500 mt-1">
                В {health?.websockets.active_rooms || 0} комнатах
              </div>
            </div>
          </div>

          {/* System Services Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#141418] border border-white/5 p-6 rounded-2xl space-y-4">
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Server className="w-4 h-4 text-red-500" />
                Инфраструктура и База данных
              </h3>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center p-3 bg-black/30 rounded-xl border border-white/5">
                  <span className="text-gray-400">
                    PostgreSQL Connection Pool
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 font-mono font-bold rounded">
                    ACTIVE (OK)
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-black/30 rounded-xl border border-white/5">
                  <span className="text-gray-400">
                    Синхронизация Яндекс.Музыки
                  </span>
                  <span className="font-mono text-white font-bold">
                    {health?.cloud_scrobblers.yandex_users || 0} аккаунтов
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-black/30 rounded-xl border border-white/5">
                  <span className="text-gray-400">Синхронизация Spotify</span>
                  <span className="font-mono text-white font-bold">
                    {health?.cloud_scrobblers.spotify_users || 0} аккаунтов
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-[#141418] border border-white/5 p-6 rounded-2xl space-y-4">
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-500" />
                Глобальный множитель опыта (XP)
              </h3>
              <p className="text-gray-400 text-xs">
                Увеличьте опыт за скробблы для всех пользователей платформы
                (например, в честь выходных или ивентов).
              </p>

              <div className="flex items-center gap-3">
                {[1.0, 1.5, 2.0, 3.0].map((val) => (
                  <button
                    type="button"
                    key={val}
                    onClick={() => handleSetMultiplier(val)}
                    className={`flex-1 py-2.5 rounded-xl font-mono font-bold text-xs transition cursor-pointer ${
                      xpMultiplier === val
                        ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20"
                        : "bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10"
                    }`}
                  >
                    x{val.toFixed(1)} XP
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: USERS MODERATION ─────────────────────────────────────────── */}
      {activeTab === "users" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Поиск по нику или имени..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-[#141418] border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
              />
            </div>
            <span className="text-xs text-gray-500 font-mono">
              Найдено: {filteredUsers.length}
            </span>
          </div>

          <div className="bg-[#141418] border border-white/5 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-300">
                <thead className="bg-[#0f0f12] text-gray-400 font-mono uppercase text-[11px] border-b border-white/5">
                  <tr>
                    <th className="py-3.5 px-4">Пользователь</th>
                    <th className="py-3.5 px-4">Роль</th>
                    <th className="py-3.5 px-4">Скробблы / XP</th>
                    <th className="py-3.5 px-4">Статус</th>
                    <th className="py-3.5 px-4 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-white/[0.02] transition">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={
                              u.avatar_url ||
                              "https://assets.vein.guru/avatars/default.png"
                            }
                            alt={u.username}
                            className="w-9 h-9 rounded-xl object-cover border border-white/10"
                            onError={(e) => {
                              (e.target as HTMLElement).setAttribute(
                                "src",
                                "https://assets.vein.guru/avatars/default.png",
                              );
                            }}
                          />
                          <div>
                            <div className="font-bold text-white flex items-center gap-1.5">
                              @{u.username}
                              {u.is_verified && (
                                <CheckCircle className="w-3.5 h-3.5 text-blue-400 inline" />
                              )}
                            </div>
                            <div className="text-[11px] text-gray-500">
                              {u.display_name || "Без имени"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${getUserRoleBadge(u.role)}`}
                        >
                          {u.role || "user"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        <div>{u.scrobbles} треков</div>
                        <div className="text-emerald-400 font-bold">
                          {u.total_xp} XP
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {u.is_banned && (
                          <span className="px-2 py-0.5 rounded bg-red-950/80 border border-red-500/50 text-red-400 text-[10px] font-bold">
                            ЗАБЛОКИРОВАН
                          </span>
                        )}
                        {!u.is_banned && u.is_flagged_antifraud && (
                          <span className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-500/50 text-amber-400 text-[10px] font-bold">
                            ФЛАГ АНТИФРОД
                          </span>
                        )}
                        {!u.is_banned && !u.is_flagged_antifraud && (
                          <span className="text-emerald-400 font-mono text-[11px]">
                            Активен
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              handleToggleVerify(u.username, !!u.is_verified)
                            }
                            className="p-2 hover:bg-white/10 rounded-lg text-blue-400 transition"
                            title={
                              u.is_verified
                                ? "Снять галочку"
                                : "Выдать верификацию"
                            }
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleChangeRole(u.username, u.role || "user")
                            }
                            className="p-2 hover:bg-white/10 rounded-lg text-purple-400 transition"
                            title="Изменить роль"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResetProfile(u.username)}
                            className="p-2 hover:bg-white/10 rounded-lg text-amber-400 transition"
                            title="Очистить профиль (аватар/био)"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleToggleBan(u.username, !!u.is_banned)
                            }
                            className={`p-2 hover:bg-white/10 rounded-lg transition ${
                              u.is_banned
                                ? "text-emerald-400"
                                : "text-orange-400"
                            }`}
                            title={
                              u.is_banned ? "Разблокировать" : "Заблокировать"
                            }
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u.username)}
                            className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition"
                            title="Удалить пользователя навсегда"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 3: ANTIFRAUD SCANNER ────────────────────────────────────────── */}
      {activeTab === "antifraud" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between p-5 bg-[#141418] border border-red-500/20 rounded-2xl">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-6 h-6 text-red-500" />
              <div>
                <h3 className="font-bold text-white text-sm">
                  Система автоматического обнаружения накрутки
                </h3>
                <p className="text-gray-400 text-xs">
                  Алгоритм анализирует скорость скробблинга (&gt;70 треков/час)
                  и короткие треки (&lt;20с).
                </p>
              </div>
            </div>
            <span className="px-3 py-1 bg-red-500/20 text-red-300 font-mono text-xs font-bold rounded-lg">
              {suspiciousUsers.length} флагов
            </span>
          </div>

          {suspiciousUsers.length === 0 ? (
            <div className="text-center py-16 bg-[#141418] border border-white/5 rounded-2xl">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3 opacity-60" />
              <p className="text-sm text-gray-400">
                Подозрительных аккаунтов не обнаружено. Система чиста!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {suspiciousUsers.map((su) => (
                <div
                  key={su.user_id}
                  className="bg-[#141418] border border-red-500/30 p-5 rounded-2xl space-y-4 shadow-lg shadow-red-950/20"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img
                        src={
                          su.avatar_url ||
                          "https://assets.vein.guru/avatars/default.png"
                        }
                        alt={su.username}
                        className="w-10 h-10 rounded-xl object-cover border border-white/10"
                      />
                      <div>
                        <div className="font-bold text-white">
                          @{su.username}
                        </div>
                        <div className="text-xs text-gray-500 font-mono">
                          {su.total_scrobbles} скробблов • {su.total_xp} XP
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="px-2.5 py-1 bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-mono font-bold rounded-lg">
                        Риск: {su.risk_score}%
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-xs text-red-300 space-y-1">
                    <div className="font-bold text-gray-400 text-[10px] uppercase tracking-wider font-mono">
                      Причины срабатывания:
                    </div>
                    {su.reasons.length > 0 ? (
                      su.reasons.map((r) => <div key={r}>• {r}</div>)
                    ) : (
                      <div>
                        •{" "}
                        {su.antifraud_reason ||
                          "Флаг установлен администратором"}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                    <button
                      type="button"
                      onClick={() => handleResetSuspiciousXp(su.username)}
                      className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Сбросить XP и стрик
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleBan(su.username, su.is_banned)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                        su.is_banned
                          ? "bg-white/10 text-white hover:bg-white/20"
                          : "bg-red-950/60 border border-red-500/40 text-red-400 hover:bg-red-950"
                      }`}
                    >
                      {su.is_banned ? "Разбан" : "Бан"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUnflagAntifraud(su.username)}
                      className="px-3 py-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl text-xs font-bold transition cursor-pointer"
                      title="Снять подозрение"
                    >
                      Снять флаг
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 4: MUSIC CATALOG & MERGE ────────────────────────────────────── */}
      {activeTab === "catalog" && (
        <div className="space-y-8">
          {/* Merge Duplicates Tool */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <form
              onSubmit={handleMergeTracks}
              className="bg-[#141418] border border-white/5 p-6 rounded-2xl space-y-4"
            >
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Disc3 className="w-4 h-4 text-red-500" />
                Слияние треков-дубликатов (Track Alias)
              </h3>
              <p className="text-xs text-gray-400">
                Переносит все скробблы с исходного ID на канонический ID и
                создает алиас для будущих скробблов.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="block text-[10px] font-mono text-gray-400 uppercase">
                    Исходный ID (Дубликат)
                  </span>
                  <input
                    type="number"
                    placeholder="Напр. 1045"
                    value={sourceTrackId}
                    onChange={(e) => setSourceTrackId(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
                  />
                </div>
                <div>
                  <span className="block text-[10px] font-mono text-gray-400 uppercase">
                    Канонический ID (Основной)
                  </span>
                  <input
                    type="number"
                    placeholder="Напр. 42"
                    value={targetTrackId}
                    onChange={(e) => setTargetTrackId(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Объединить треки и создать алиас
              </button>
            </form>

            <form
              onSubmit={handleMergeArtists}
              className="bg-[#141418] border border-white/5 p-6 rounded-2xl space-y-4"
            >
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" />
                Слияние имен исполнителей
              </h3>
              <p className="text-xs text-gray-400">
                Обновляет все треки и скробблы, заменяя опечатки или
                альтернативные написания имени артиста.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="block text-[10px] font-mono text-gray-400 uppercase">
                    Старое имя (с опечаткой)
                  </span>
                  <input
                    type="text"
                    placeholder="Напр. The Weekndd"
                    value={sourceArtist}
                    onChange={(e) => setSourceArtist(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
                  />
                </div>
                <div>
                  <span className="block text-[10px] font-mono text-gray-400 uppercase">
                    Правильное имя
                  </span>
                  <input
                    type="text"
                    placeholder="Напр. The Weeknd"
                    value={targetArtist}
                    onChange={(e) => setTargetArtist(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Нормализовать имя исполнителя
              </button>
            </form>
          </div>

          {/* Tracks Browser */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Поиск по названию или исполнителю..."
                  value={trackSearch}
                  onChange={(e) => setTrackSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#141418] border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                />
              </div>
              <span className="text-xs text-gray-500 font-mono">
                Треков: {filteredTracks.length}
              </span>
            </div>

            <div className="bg-[#141418] border border-white/5 rounded-2xl overflow-hidden max-h-[500px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-left text-xs text-gray-300">
                <thead className="bg-[#0f0f12] text-gray-400 font-mono uppercase text-[11px] sticky top-0 z-10 border-b border-white/5">
                  <tr>
                    <th className="py-3 px-4">ID</th>
                    <th className="py-3 px-4">Трек</th>
                    <th className="py-3 px-4">Исполнитель</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredTracks.slice(0, 150).map((t) => (
                    <tr key={t.id} className="hover:bg-white/[0.02] transition">
                      <td className="py-2.5 px-4 font-mono text-gray-500">
                        #{t.id}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-white">
                        {t.title}
                      </td>
                      <td className="py-2.5 px-4 text-gray-400">{t.artist}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 5: GAMIFICATION & AVATAR FRAMES ─────────────────────────────── */}
      {activeTab === "gamification" && (
        <div className="space-y-8">
          {/* Avatar Frames Management */}
          <div className="space-y-4">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Коллекционные рамки аватара
            </h3>

            <form
              onSubmit={handleCreateFrame}
              className="bg-[#141418] border border-white/5 p-5 rounded-2xl grid grid-cols-1 sm:grid-cols-5 gap-3 items-end"
            >
              <div>
                <span className="block text-[10px] font-mono text-gray-400 uppercase">
                  Название
                </span>
                <input
                  type="text"
                  placeholder="Neon Fire"
                  value={newFrame.name}
                  onChange={(e) =>
                    setNewFrame({ ...newFrame, name: e.target.value })
                  }
                  className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
                  required
                />
              </div>

              <div>
                <span className="block text-[10px] font-mono text-gray-400 uppercase">
                  Код (slug)
                </span>
                <input
                  type="text"
                  placeholder="neon_fire"
                  value={newFrame.code}
                  onChange={(e) =>
                    setNewFrame({ ...newFrame, code: e.target.value })
                  }
                  className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
                  required
                />
              </div>

              <div>
                <span className="block text-[10px] font-mono text-gray-400 uppercase">
                  Редкость
                </span>
                <select
                  value={newFrame.rarity}
                  onChange={(e) =>
                    setNewFrame({ ...newFrame, rarity: e.target.value })
                  }
                  className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
                >
                  <option value="common">Common</option>
                  <option value="rare">Rare</option>
                  <option value="epic">Epic</option>
                  <option value="legendary">Legendary</option>
                </select>
              </div>

              <div>
                <span className="block text-[10px] font-mono text-gray-400 uppercase">
                  Мин. уровень
                </span>
                <input
                  type="number"
                  min="1"
                  value={newFrame.required_level}
                  onChange={(e) =>
                    setNewFrame({
                      ...newFrame,
                      required_level: Number.parseInt(e.target.value, 10) || 1,
                    })
                  }
                  className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
                />
              </div>

              <button
                type="submit"
                className="py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-xs transition cursor-pointer"
              >
                + Добавить рамку
              </button>
            </form>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {frames.map((frame) => (
                <div
                  key={frame.id}
                  className="bg-[#141418] border border-white/5 p-4 rounded-2xl space-y-3 relative group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">
                      {frame.name}
                    </span>
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 uppercase">
                      {frame.rarity}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 font-mono">
                    <div>
                      Код:{" "}
                      <span className="text-white font-bold">{frame.code}</span>
                    </div>
                    <div>Требует: Lvl {frame.required_level}+</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteFrame(frame.id)}
                    className="w-full py-1.5 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-lg text-xs transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Удалить
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Achievements Summary */}
          <div className="space-y-4 pt-6 border-t border-white/5">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Trophy className="w-4 h-4 text-purple-400" />
              Активные достижения платформы ({achievements.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {achievements.map((ach) => (
                <div
                  key={ach.id}
                  className="bg-[#141418] border border-white/5 p-3.5 rounded-xl flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center text-xl shrink-0">
                    {ach.icon || "🏆"}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-white text-xs truncate">
                      {ach.name}
                    </div>
                    <div className="text-[11px] text-gray-400 truncate">
                      {ach.description}
                    </div>
                    <div className="text-[10px] text-emerald-400 font-mono font-bold mt-0.5">
                      +{ach.reward_xp} XP
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 6: ANNOUNCEMENTS & FEATURE FLAGS ────────────────────────────── */}
      {activeTab === "announcements" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Announcements Manager */}
          <div className="space-y-4">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-blue-400" />
              Глобальные системные оповещения
            </h3>

            <form
              onSubmit={handleCreateAnnouncement}
              className="bg-[#141418] border border-white/5 p-5 rounded-2xl space-y-3"
            >
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <span className="block text-[10px] font-mono text-gray-400 uppercase">
                    Заголовок
                  </span>
                  <input
                    type="text"
                    placeholder="Технические работы"
                    value={newAnn.title}
                    onChange={(e) =>
                      setNewAnn({ ...newAnn, title: e.target.value })
                    }
                    className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
                    required
                  />
                </div>
                <div>
                  <span className="block text-[10px] font-mono text-gray-400 uppercase">
                    Тип
                  </span>
                  <select
                    value={newAnn.type}
                    onChange={(e) =>
                      setNewAnn({ ...newAnn, type: e.target.value })
                    }
                    className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
                  >
                    <option value="info">Info (Синий)</option>
                    <option value="warning">Warning (Желтый)</option>
                    <option value="alert">Alert (Красный)</option>
                  </select>
                </div>
              </div>

              <div>
                <span className="block text-[10px] font-mono text-gray-400 uppercase">
                  Текст сообщения
                </span>
                <textarea
                  placeholder="15 августа с 04:00 до 05:00 планируется обновление..."
                  value={newAnn.message}
                  onChange={(e) =>
                    setNewAnn({ ...newAnn, message: e.target.value })
                  }
                  rows={2}
                  className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white resize-none"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Опубликовать оповещение
              </button>
            </form>

            <div className="space-y-3">
              {announcements.map((ann) => (
                <div
                  key={ann.id}
                  className="bg-[#141418] border border-white/5 p-4 rounded-2xl flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-xs">
                        {ann.title}
                      </span>
                      <span className="px-2 py-0.2 rounded font-mono text-[9px] uppercase bg-white/5 text-gray-400">
                        {ann.type}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{ann.message}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleAnnouncement(ann.id, ann.is_active)
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        ann.is_active
                          ? "bg-emerald-950/60 border border-emerald-500/40 text-emerald-400"
                          : "bg-white/5 text-gray-500"
                      }`}
                    >
                      {ann.is_active ? "Активно" : "Скрыто"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAnnouncement(ann.id)}
                      className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg transition cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Feature Flags Manager */}
          <div className="space-y-4">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Динамические Feature Flags
            </h3>

            <form
              onSubmit={handleCreateFlag}
              className="bg-[#141418] border border-white/5 p-5 rounded-2xl space-y-3"
            >
              <div>
                <span className="block text-[10px] font-mono text-gray-400 uppercase">
                  Ключ флага (slug)
                </span>
                <input
                  type="text"
                  placeholder="enable_listen_together"
                  value={newFlag.key}
                  onChange={(e) =>
                    setNewFlag({ ...newFlag, key: e.target.value })
                  }
                  className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white font-mono"
                  required
                />
              </div>
              <div>
                <span className="block text-[10px] font-mono text-gray-400 uppercase">
                  Описание
                </span>
                <input
                  type="text"
                  placeholder="Включает режим синхронного прослушивания"
                  value={newFlag.description}
                  onChange={(e) =>
                    setNewFlag({ ...newFlag, description: e.target.value })
                  }
                  className="w-full mt-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-xs transition cursor-pointer"
              >
                + Добавить фича-флаг
              </button>
            </form>

            <div className="space-y-3">
              {featureFlags.map((flag) => (
                <div
                  key={flag.id}
                  className="bg-[#141418] border border-white/5 p-4 rounded-2xl flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="font-mono font-bold text-white text-xs">
                      {flag.key}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {flag.description || "Без описания"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleFlag(flag.key, flag.is_enabled)}
                    className={`px-3.5 py-1.5 rounded-xl font-mono text-xs font-bold transition cursor-pointer ${
                      flag.is_enabled
                        ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20"
                        : "bg-white/10 text-gray-400 hover:bg-white/20"
                    }`}
                  >
                    {flag.is_enabled ? "ВКЛЮЧЕНО" : "ОТКЛ"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
