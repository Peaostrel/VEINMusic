"use client";

import { RefreshCw, RotateCcw, ShieldAlert } from "lucide-react";
import { Loading, PageHeader, btn } from "@/components/ui";
import Link from "next/link";
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
import ReportsTab from "./tabs/ReportsTab";
import ScrobblesTab from "./tabs/ScrobblesTab";
import IntegrationsTab from "./tabs/IntegrationsTab";
import LogsTab from "./tabs/LogsTab";
import SecurityTab from "./tabs/SecurityTab";
import UserCard from "./components/UserCard";
import { type AdminTab, useAdminPanel } from "./useAdminPanel";
import type { ReportPage } from "./types";
import { useAdminResource } from "./ui";
import { useT } from "@/app/lib/i18n/client";
import { msg } from "@/app/lib/i18n/core";

export default function AdminPanel() {
  const t = useT();
  const admin = useAdminPanel();
  const [openUser, setOpenUser] = useState<string | null>(null);
  // User whose scrobbles the "Прослушивания" tab opens with
  const [scrobblesUser, setScrobblesUser] = useState("");
  const openReports = useAdminResource<ReportPage>(
    "/api/admin/reports?status=open&limit=1",
  );
  const openReportCount = openReports.data?.open_count ?? 0;
  const {
    router,
    activeTab,
    setActiveTab,
    loading,
    error,
    errorStatus,
    users,
    suspiciousUsers,
    loadAllData,
    handleFlushCache,
  } = admin;

  if (loading) return <Loading label={t("Загружаем панель управления…")} />;

  if (error) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
        <ShieldAlert className="h-8 w-8 text-fg-3" aria-hidden="true" />
        <h1 className="text-2xl font-semibold">
          {errorStatus === 401 || errorStatus === 403
            ? t("Доступ ограничен")
            : t("Не удалось загрузить админку")}
        </h1>
        <p className="text-sm text-fg-2">{error}</p>
        {errorStatus === 403 &&
          (error.includes("двухфакторную") ||
            error ===
              t(
                "Для доступа администратора включите двухфакторную защиту в настройках безопасности",
              )) && (
            <Link
              href="/settings?tab=security"
              className={`${btn.primary} ${btn.md}`}
            >
              {t("Включить двухфакторную защиту")}
            </Link>
          )}
        {errorStatus === 401 && (
          <Link href="/auth" className={`${btn.primary} ${btn.md}`}>
            {t("Войти в аккаунт")}
          </Link>
        )}
        <button
          type="button"
          onClick={() => void loadAllData()}
          className={`${btn.secondary} ${btn.md}`}
        >
          {t("Повторить загрузку")}
        </button>
        <button
          type="button"
          onClick={() => router.push("/")}
          className={`${btn.secondary} ${btn.md} mt-4`}
        >
          {t("На главную")}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
      <PageHeader
        title={t("Админка")}
        subtitle={t("Пользователи, каталог, модерация и состояние системы")}
        actions={
          <>
            <button
              type="button"
              onClick={handleFlushCache}
              className={`${btn.secondary} ${btn.sm}`}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {t("Сбросить кэш")}
            </button>
            <button
              type="button"
              onClick={loadAllData}
              className={`${btn.secondary} ${btn.sm}`}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              {t("Обновить")}
            </button>
          </>
        }
      />

      <nav
        aria-label={t("Разделы админки")}
        className="hide-scrollbar flex gap-x-6 overflow-x-auto border-b border-line-soft md:flex-wrap md:overflow-visible"
      >
        {(
          [
            { id: "overview", label: msg("Обзор") },
            { id: "users", label: msg("Пользователи"), count: users.length },
            {
              id: "antifraud",
              label: msg("Антифрод"),
              count: suspiciousUsers.length || undefined,
              alert: suspiciousUsers.length > 0,
            },
            {
              id: "reports",
              label: msg("Жалобы"),
              count: openReportCount || undefined,
              alert: openReportCount > 0,
            },
            { id: "moderation", label: msg("Модерация") },
            { id: "scrobbles", label: msg("Прослушивания") },
            { id: "integrations", label: msg("Интеграции") },
            { id: "catalog", label: msg("Каталог") },
            { id: "gamification", label: msg("Геймификация") },
            { id: "announcements", label: msg("Оповещения и флаги") },
            { id: "security", label: msg("Безопасность") },
            { id: "system", label: msg("Система") },
            { id: "logs", label: msg("Логи") },
            { id: "audit", label: msg("Журнал") },
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
              {t(tab.label)}
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
      {admin.activeTab === "reports" && (
        <ReportsTab onOpenUser={setOpenUser} onChanged={openReports.reload} />
      )}
      {admin.activeTab === "scrobbles" && (
        <ScrobblesTab
          key={scrobblesUser}
          onOpenUser={setOpenUser}
          initialUsername={scrobblesUser}
        />
      )}
      {admin.activeTab === "integrations" && (
        <IntegrationsTab onOpenUser={setOpenUser} />
      )}
      {admin.activeTab === "logs" && <LogsTab />}
      {admin.activeTab === "security" && <SecurityTab />}

      {openUser && (
        <UserCard
          username={openUser}
          achievements={admin.achievements}
          onClose={() => setOpenUser(null)}
          onChanged={admin.loadAllData}
          onOpenScrobbles={(name) => {
            setOpenUser(null);
            setScrobblesUser(name);
            setActiveTab("scrobbles");
          }}
        />
      )}
    </div>
  );
}
