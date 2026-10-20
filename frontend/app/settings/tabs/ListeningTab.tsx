"use client";
import { useT } from "@/app/lib/i18n/client";
import { msg } from "@/app/lib/i18n/core";

import { Clock3 } from "lucide-react";
import { btn, inputOnCard } from "@/components/ui";
import type { SettingsData, UpdatePreference } from "../types";
import {
  CheckboxGrid,
  SettingsIntro,
  TagEditor,
  ToggleRow,
  settingsCard,
} from "../components/PreferenceControls";

const SOURCES = [
  { value: "yandex", label: msg("Яндекс Музыка") },
  { value: "spotify", label: "Spotify" },
  { value: "vk", label: msg("VK Музыка") },
  { value: "youtube", label: "YouTube Music" },
  { value: "apple", label: "Apple Music" },
  { value: "zvuk", label: msg("Звук") },
  { value: "soundcloud", label: "SoundCloud" },
  { value: "plat", label: "Plat Music" },
  { value: "desktop", label: msg("Десктопный клиент") },
];

export default function ListeningTab({
  data,
  updatePreference,
}: Readonly<{ data: SettingsData; updatePreference: UpdatePreference }>) {
  const t = useT();
  const settings = data.preferences.listening;
  const update = (patch: Partial<typeof settings>) =>
    updatePreference("listening", { ...settings, ...patch });
  const privateUntil = settings.private_session_until
    ? new Date(settings.private_session_until)
    : null;
  const privateActive = Boolean(privateUntil && privateUntil > new Date());
  const startPrivate = (hours: number) =>
    update({
      private_session_until: new Date(
        Date.now() + hours * 3_600_000,
      ).toISOString(),
    });

  return (
    <div className="space-y-6">
      <SettingsIntro
        title={t("Прослушивания")}
        description={t(
          "Решите, какие события VEIN должен записывать. Эти фильтры применяются до добавления трека в историю и статистику.",
        )}
      />

      <section className={`${settingsCard} p-5`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Clock3 className="h-4 w-4 text-accent" aria-hidden="true" />
              {t("Приватная сессия")}
            </h3>
            <p className="mt-1 text-xs text-fg-2">
              {t(
                "Во время сессии новые прослушивания не сохраняются и не приносят XP.",
              )}
            </p>
            {privateActive && privateUntil && (
              <p className="mt-2 font-mono text-xs text-accent">
                {t("Активна до {time}", {
                  time: privateUntil.toLocaleString(t.locale),
                })}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => startPrivate(1)}
              className={`${btn.secondary} ${btn.sm}`}
            >
              {t("На час")}
            </button>
            <button
              type="button"
              onClick={() => startPrivate(8)}
              className={`${btn.secondary} ${btn.sm}`}
            >
              {t("На 8 часов")}
            </button>
            {privateActive && (
              <button
                type="button"
                onClick={() => update({ private_session_until: null })}
                className={`${btn.danger} ${btn.sm}`}
              >
                {t("Выключить")}
              </button>
            )}
          </div>
        </div>
      </section>

      <TagEditor
        title={t("Игнорируемые исполнители")}
        description={t(
          "Прослушивания этих исполнителей не попадут в историю, статистику и ленту. Используется точное совпадение имени.",
        )}
        values={settings.ignored_artists}
        placeholder={t("Имя исполнителя")}
        onChange={(ignored_artists) => update({ ignored_artists })}
      />
      <TagEditor
        title={t("Игнорируемые треки")}
        description={t(
          "Можно указать название или строку «Исполнитель — Трек».",
        )}
        values={settings.ignored_tracks}
        placeholder={t("Исполнитель — название трека")}
        onChange={(ignored_tracks) => update({ ignored_tracks })}
      />

      <section className={`${settingsCard} p-5`}>
        <h3 className="text-sm font-medium">{t("Отключённые источники")}</h3>
        <p className="mb-4 mt-1 text-xs text-fg-2">
          {t(
            "VEIN будет принимать соединение, но не станет записывать треки из выбранных источников.",
          )}
        </p>
        <CheckboxGrid
          values={settings.ignored_sources}
          options={SOURCES}
          onChange={(ignored_sources) => update({ ignored_sources })}
        />
      </section>

      <section className={settingsCard}>
        <ToggleRow
          title={t("Игнорировать короткие треки")}
          description={t(
            "Полезно для джинглов, уведомлений и случайно определённых звуков.",
          )}
          checked={settings.ignore_short_tracks}
          onChange={(ignore_short_tracks) => update({ ignore_short_tracks })}
        />
        {settings.ignore_short_tracks && (
          <div className="flex items-center justify-between gap-4 border-b border-line-soft px-5 py-4">
            <span>
              <label
                htmlFor="short-track-seconds"
                className="block text-sm font-medium"
              >
                {t("Максимальная длительность")}
              </label>
              <span id="short-track-seconds-hint" className="text-xs text-fg-2">
                {t("От 15 до 120 секунд")}
              </span>
            </span>
            <input
              autoComplete="off"
              id="short-track-seconds"
              aria-describedby="short-track-seconds-hint"
              type="number"
              min={15}
              max={120}
              value={settings.short_track_seconds}
              onChange={(event) =>
                update({ short_track_seconds: Number(event.target.value) })
              }
              className={`${inputOnCard} w-24 text-right font-mono`}
            />
          </div>
        )}
        <ToggleRow
          title={t("Дополнять метаданные автоматически")}
          description={t(
            "VEIN попробует найти длительность и жанр, если источник их не передал.",
          )}
          checked={settings.auto_metadata}
          onChange={(auto_metadata) => update({ auto_metadata })}
        />
      </section>
    </div>
  );
}
