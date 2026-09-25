"use client";

import {
  Users,
  ShieldAlert,
  Disc3,
  Trophy,
  Megaphone,
  Activity,
  RotateCcw,
  Server,
  RefreshCw,
} from "lucide-react";
import OverviewTab from "./tabs/OverviewTab";
import UsersTab from "./tabs/UsersTab";
import AntifraudTab from "./tabs/AntifraudTab";
import CatalogTab from "./tabs/CatalogTab";
import GamificationTab from "./tabs/GamificationTab";
import AnnouncementsTab from "./tabs/AnnouncementsTab";
import { useAdminPanel } from "./useAdminPanel";

export default function AdminPanel() {
  const admin = useAdminPanel();
  const {
    router,
    activeTab,
    setActiveTab,
    loading,
    error,
    users,
    suspiciousUsers,
    loadAllData,
    handleFlushCache,
  } = admin;

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

      {admin.activeTab === "overview" && <OverviewTab {...admin} />}
      {admin.activeTab === "users" && <UsersTab {...admin} />}
      {admin.activeTab === "antifraud" && <AntifraudTab {...admin} />}
      {admin.activeTab === "catalog" && <CatalogTab {...admin} />}
      {admin.activeTab === "gamification" && <GamificationTab {...admin} />}
      {admin.activeTab === "announcements" && <AnnouncementsTab {...admin} />}
    </div>
  );
}
