"use client";

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
  { value: "yandex", label: "Яндекс Музыка" },
  { value: "spotify", label: "Spotify" },
  { value: "vk", label: "VK Музыка" },
  { value: "youtube", label: "YouTube Music" },
  { value: "apple", label: "Apple Music" },
  { value: "soundcloud", label: "SoundCloud" },
  { value: "desktop", label: "Десктопный клиент" },
];

export default function ListeningTab({
  data,
  updatePreference,
}: Readonly<{ data: SettingsData; updatePreference: UpdatePreference }>) {
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
        Date.now() + hours * 3600_000,
      ).toISOString(),
    });

  return (
    <div className="space-y-6">
      <SettingsIntro
        title="Прослушивания"
        description="Решите, какие события VEIN должен записывать. Эти фильтры применяются до добавления трека в историю и статистику."
      />

      <section className={`${settingsCard} p-5`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Clock3 className="h-4 w-4 text-accent" aria-hidden="true" />
              Приватная сессия
            </h3>
            <p className="mt-1 text-xs text-fg-2">
              Во время сессии новые прослушивания не сохраняются и не приносят
              XP.
            </p>
            {privateActive && privateUntil && (
              <p className="mt-2 font-mono text-xs text-accent">
                Активна до {privateUntil.toLocaleString("ru-RU")}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => startPrivate(1)}
              className={`${btn.secondary} ${btn.sm}`}
            >
              На час
            </button>
            <button
              type="button"
              onClick={() => startPrivate(8)}
              className={`${btn.secondary} ${btn.sm}`}
            >
              На 8 часов
            </button>
            {privateActive && (
              <button
                type="button"
                onClick={() => update({ private_session_until: null })}
                className={`${btn.danger} ${btn.sm}`}
              >
                Выключить
              </button>
            )}
          </div>
        </div>
      </section>

      <TagEditor
        title="Игнорируемые исполнители"
        description="Прослушивания этих исполнителей не попадут в историю, статистику и ленту. Используется точное совпадение имени."
        values={settings.ignored_artists}
        placeholder="Имя исполнителя"
        onChange={(ignored_artists) => update({ ignored_artists })}
      />
      <TagEditor
        title="Игнорируемые треки"
        description="Можно указать название или строку «Исполнитель — Трек»."
        values={settings.ignored_tracks}
        placeholder="Исполнитель — название трека"
        onChange={(ignored_tracks) => update({ ignored_tracks })}
      />

      <section className={`${settingsCard} p-5`}>
        <h3 className="text-sm font-medium">Отключённые источники</h3>
        <p className="mb-4 mt-1 text-xs text-fg-2">
          VEIN будет принимать соединение, но не станет записывать треки из
          выбранных источников.
        </p>
        <CheckboxGrid
          values={settings.ignored_sources}
          options={SOURCES}
          onChange={(ignored_sources) => update({ ignored_sources })}
        />
      </section>

      <section className={settingsCard}>
        <ToggleRow
          title="Игнорировать короткие треки"
          description="Полезно для джинглов, уведомлений и случайно определённых звуков."
          checked={settings.ignore_short_tracks}
          onChange={(ignore_short_tracks) => update({ ignore_short_tracks })}
        />
        {settings.ignore_short_tracks && (
          <label className="flex items-center justify-between gap-4 border-b border-line-soft px-5 py-4">
            <span>
              <span className="block text-sm font-medium">
                Максимальная длительность
              </span>
              <span className="text-xs text-fg-2">От 15 до 120 секунд</span>
            </span>
            <input
              type="number"
              min={15}
              max={120}
              value={settings.short_track_seconds}
              onChange={(event) =>
                update({ short_track_seconds: Number(event.target.value) })
              }
              className={`${inputOnCard} w-24 text-right font-mono`}
            />
          </label>
        )}
        <ToggleRow
          title="Дополнять метаданные автоматически"
          description="VEIN попробует найти длительность и жанр, если источник их не передал."
          checked={settings.auto_metadata}
          onChange={(auto_metadata) => update({ auto_metadata })}
        />
      </section>
    </div>
  );
}
