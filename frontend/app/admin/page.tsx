"use client";

import { RefreshCw, RotateCcw, ShieldAlert } from "lucide-react";
import { Loading, PageHeader, btn } from "@/components/ui";
import { useState } from "react";
import OverviewTab from "./tabs/OverviewTab";
import UsersTab from "./tabs/UsersTab";
import AntifraudTab from "./tabs/AntifraudTab";
import CatalogTab from "./tabs/CatalogTab";
import GamificationTab from "./tabs/GamificationTab";
import AnnouncementsTab from "./tabs/AnnouncementsTab";
import ModerationTab from "./tabs/ModerationTab";
import SystemTab from "./tabs/SystemTab";
import AuditTab from "./tabs/AuditTab";
import UserCard from "./components/UserCard";
import { type AdminTab, useAdminPanel } from "./useAdminPanel";

export default function AdminPanel() {
  const admin = useAdminPanel();
  const [openUser, setOpenUser] = useState<string | null>(null);
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

  if (loading) return <Loading label="Загружаем панель управления…" />;

  if (error) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
        <ShieldAlert className="h-8 w-8 text-fg-3" aria-hidden="true" />
        <h1 className="text-2xl font-semibold">Доступ ограничен</h1>
        <p className="text-sm text-fg-2">{error}</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className={`${btn.secondary} ${btn.md} mt-4`}
        >
          На главную
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
      <PageHeader
        title="Админка"
        subtitle="Пользователи, каталог, модерация и состояние системы"
        actions={
          <>
            <button
              type="button"
              onClick={handleFlushCache}
              className={`${btn.secondary} ${btn.sm}`}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Сбросить кэш
            </button>
            <button
              type="button"
              onClick={loadAllData}
              className={`${btn.secondary} ${btn.sm}`}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Обновить
            </button>
          </>
        }
      />

      <nav
        aria-label="Разделы админки"
        className="hide-scrollbar flex gap-6 overflow-x-auto border-b border-line-soft"
      >
        {(
          [
            { id: "overview", label: "Обзор" },
            { id: "users", label: "Пользователи", count: users.length },
            {
              id: "antifraud",
              label: "Антифрод",
              count: suspiciousUsers.length || undefined,
              alert: suspiciousUsers.length > 0,
            },
            { id: "moderation", label: "Модерация" },
            { id: "catalog", label: "Каталог" },
            { id: "gamification", label: "Геймификация" },
            { id: "announcements", label: "Оповещения и флаги" },
            { id: "system", label: "Система" },
            { id: "audit", label: "Журнал" },
          ] satisfies {
            id: AdminTab;
            label: string;
            count?: number;
            alert?: boolean;
          }[]
        ).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              aria-pressed={isActive}
              className={`-mb-px flex h-10 shrink-0 items-center gap-1.5 border-b-2 text-sm transition-colors ${
                isActive
                  ? "border-accent font-medium text-fg"
                  : "border-transparent text-fg-2 hover:text-fg"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`rounded px-1.5 font-mono text-[11px] ${
                    "alert" in tab && tab.alert
                      ? "bg-accent text-on-accent"
                      : "text-fg-3"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {admin.activeTab === "overview" && <OverviewTab {...admin} />}
      {admin.activeTab === "users" && (
        <UsersTab {...admin} onOpenUser={setOpenUser} />
      )}
      {admin.activeTab === "moderation" && (
        <ModerationTab onOpenUser={setOpenUser} />
      )}
      {admin.activeTab === "antifraud" && <AntifraudTab {...admin} />}
      {admin.activeTab === "catalog" && <CatalogTab {...admin} />}
      {admin.activeTab === "gamification" && <GamificationTab {...admin} />}
      {admin.activeTab === "announcements" && <AnnouncementsTab {...admin} />}
      {admin.activeTab === "system" && <SystemTab />}
      {admin.activeTab === "audit" && <AuditTab />}

      {openUser && (
        <UserCard
          username={openUser}
          achievements={admin.achievements}
          onClose={() => setOpenUser(null)}
          onChanged={admin.loadAllData}
        />
      )}
    </div>
  );
}
