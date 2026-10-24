"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ChartColumn,
  Download,
  Flag,
  Percent,
  Share2,
  SlidersHorizontal,
} from "lucide-react";
import type { useRouter } from "next/navigation";
import { btn } from "@/components/ui";
import ReportDialog from "@/components/ReportDialog";
import { useT } from "@/app/lib/i18n/client";

export interface ProfileActionsProps {
  isLogged: boolean;
  isMyProfile: boolean;
  isFollowing: boolean;
  hasImportedLastfm: boolean;
  username: string;
  importLoading: boolean;
  onFollow: () => void;
  onImport: () => void;
  onShowWrapped: () => void;
  onShowCompatibility: () => void;
  router?: ReturnType<typeof useRouter>;
}

const secondary = `${btn.secondary} ${btn.sm}`;

export function ProfileActions({
  isLogged,
  isMyProfile,
  isFollowing,
  hasImportedLastfm,
  username,
  importLoading,
  onFollow,
  onImport,
  onShowWrapped,
  onShowCompatibility,
}: Readonly<ProfileActionsProps>) {
  const t = useT();
  const [reporting, setReporting] = useState(false);
  const importLabel = importLoading ? t("Запуск…") : t("Импорт Last.fm");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isLogged && !isMyProfile && (
        <button
          type="button"
          onClick={onFollow}
          aria-pressed={isFollowing}
          className={`${isFollowing ? btn.secondary : btn.primary} h-9 px-4`}
        >
          {isFollowing ? t("Отписаться") : t("Подписаться")}
        </button>
      )}
      {!isMyProfile && isLogged && (
        <button
          type="button"
          onClick={onShowCompatibility}
          className={secondary}
        >
          <Percent className="h-3.5 w-3.5" aria-hidden="true" />
          {t("Совместимость")}
        </button>
      )}
      <Link href={`/user/${username}/stats`} className={secondary}>
        <ChartColumn className="h-3.5 w-3.5" aria-hidden="true" />
        {t("Статистика")}
      </Link>
      {/* Last.fm history is imported once */}
      {isMyProfile && !hasImportedLastfm && (
        <button
          type="button"
          onClick={onImport}
          disabled={importLoading}
          className={secondary}
          title={t("Импортировать историю из Last.fm")}
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          {importLabel}
        </button>
      )}
      {isMyProfile && (
        <Link href="/settings" className={secondary}>
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          {t("Настройки")}
        </Link>
      )}
      <button
        type="button"
        onClick={onShowWrapped}
        aria-label={t("Поделиться профилем")}
        title={t("Поделиться")}
        className={`${btn.secondary} h-8 w-8`}
      >
        <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {isLogged && !isMyProfile && (
        <button
          type="button"
          onClick={() => setReporting(true)}
          aria-label={t("Пожаловаться на профиль")}
          title={t("Пожаловаться")}
          className={`${btn.secondary} h-8 w-8 hover:text-danger`}
        >
          <Flag className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
      {reporting && (
        <ReportDialog
          target={{ type: "user", username }}
          onClose={() => setReporting(false)}
        />
      )}
    </div>
  );
}
