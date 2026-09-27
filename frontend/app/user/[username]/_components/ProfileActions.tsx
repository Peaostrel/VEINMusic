"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ChartColumn,
  Download,
  Flag,
  Headphones,
  Percent,
  Share2,
  SlidersHorizontal,
} from "lucide-react";
import type { useRouter } from "next/navigation";
import { btn } from "@/components/ui";
import ReportDialog from "@/components/ReportDialog";

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
  onListenTogether: () => void;
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
  onListenTogether,
  onShowCompatibility,
}: Readonly<ProfileActionsProps>) {
  const [reporting, setReporting] = useState(false);
  let importLabel = "Импорт Last.fm";
  if (importLoading) importLabel = "Запуск…";
  else if (hasImportedLastfm) importLabel = "Синхронизировать Last.fm";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isLogged && !isMyProfile && (
        <button
          type="button"
          onClick={onFollow}
          aria-pressed={isFollowing}
          className={`${isFollowing ? btn.secondary : btn.primary} h-9 px-4`}
        >
          {isFollowing ? "Отписаться" : "Подписаться"}
        </button>
      )}
      {!isMyProfile && isLogged && (
        <>
          <button
            type="button"
            onClick={onShowCompatibility}
            className={secondary}
          >
            <Percent className="h-3.5 w-3.5" aria-hidden="true" />
            Совместимость
          </button>
          <button
            type="button"
            onClick={onListenTogether}
            className={secondary}
          >
            <Headphones className="h-3.5 w-3.5" aria-hidden="true" />
            Слушать вместе
          </button>
        </>
      )}
      <Link href={`/user/${username}/stats`} className={secondary}>
        <ChartColumn className="h-3.5 w-3.5" aria-hidden="true" />
        Статистика
      </Link>
      {isMyProfile && (
        <button
          type="button"
          onClick={onImport}
          disabled={importLoading}
          className={secondary}
          title="Импортировать историю из Last.fm"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          {importLabel}
        </button>
      )}
      {isMyProfile && (
        <Link href="/settings" className={secondary}>
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          Настройки
        </Link>
      )}
      <button
        type="button"
        onClick={onShowWrapped}
        aria-label="Поделиться профилем"
        title="Поделиться"
        className={`${btn.secondary} h-8 w-8`}
      >
        <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {isLogged && !isMyProfile && (
        <button
          type="button"
          onClick={() => setReporting(true)}
          aria-label="Пожаловаться на профиль"
          title="Пожаловаться"
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
