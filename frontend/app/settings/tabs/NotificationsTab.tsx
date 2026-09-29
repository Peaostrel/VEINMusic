"use client";

import type { NotificationChannels } from "@/app/lib/types";
import { inputOnCard } from "@/components/ui";
import type { SettingsData, UpdatePreference } from "../types";
import {
  SettingsIntro,
  ToggleRow,
  settingsCard,
} from "../components/PreferenceControls";

const EVENTS: {
  key: keyof NotificationChannels;
  label: string;
  description: string;
}[] = [
  {
    key: "likes",
    label: "Реакции",
    description: "Кто-то оценил прослушивание",
  },
  {
    key: "comments",
    label: "Комментарии",
    description: "Новый комментарий к треку",
  },
  { key: "follows", label: "Подписки", description: "Новый подписчик" },
  {
    key: "achievements",
    label: "Достижения",
    description: "Получена новая награда",
  },
  {
    key: "room_invites",
    label: "Комнаты",
    description: "Приглашения слушать вместе",
  },
  {
    key: "weekly_digest",
    label: "Недельные итоги",
    description: "Готов новый дайджест",
  },
  {
    key: "new_releases",
    label: "Новые релизы",
    description: "Релизы любимых артистов",
  },
  { key: "system", label: "Системные", description: "Важные сообщения VEIN" },
];

export default function NotificationsTab({
  data,
  updatePreference,
}: Readonly<{ data: SettingsData; updatePreference: UpdatePreference }>) {
  const settings = data.preferences.notifications;
  const update = (patch: Partial<typeof settings>) =>
    updatePreference("notifications", { ...settings, ...patch });
  const updateChannel = (
    channel: "in_app" | "push",
    key: keyof NotificationChannels,
    value: boolean,
  ) => update({ [channel]: { ...settings[channel], [key]: value } });

  return (
    <div className="space-y-6">
      <SettingsIntro
        title="Уведомления"
        description="Для каждого события отдельно выберите уведомление на сайте и Web Push. Системные сообщения можно отключить, кроме критически важных предупреждений безопасности."
      />
      <section className={`${settingsCard} overflow-x-auto`}>
        <div className="grid min-w-[560px] grid-cols-[minmax(0,1fr)_90px_90px] border-b border-line-soft px-5 py-3 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-3">
          <span>Событие</span>
          <span className="text-center">На сайте</span>
          <span className="text-center">Push</span>
        </div>
        {EVENTS.map((event) => (
          <div
            key={event.key}
            className="grid min-w-[560px] grid-cols-[minmax(0,1fr)_90px_90px] items-center border-b border-line-soft px-5 py-3 last:border-0"
          >
            <span>
              <span className="block text-sm font-medium">{event.label}</span>
              <span className="block text-xs text-fg-2">
                {event.description}
              </span>
            </span>
            {(["in_app", "push"] as const).map((channel) => (
              <label key={channel} className="flex justify-center">
                <input
                  type="checkbox"
                  checked={settings[channel][event.key]}
                  onChange={(e) =>
                    updateChannel(channel, event.key, e.target.checked)
                  }
                  aria-label={`${event.label}: ${channel === "in_app" ? "на сайте" : "Push"}`}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
              </label>
            ))}
          </div>
        ))}
      </section>

      <section className={settingsCard}>
        <ToggleRow
          title="Режим «Не беспокоить»"
          description="Web Push не отправляются в выбранное время. Уведомления на сайте сохраняются."
          checked={settings.quiet_hours_enabled}
          onChange={(quiet_hours_enabled) => update({ quiet_hours_enabled })}
        />
        {settings.quiet_hours_enabled && (
          <div className="flex flex-wrap items-center gap-4 px-5 py-4">
            <label className="flex items-center gap-2 text-sm text-fg-2">
              С
              <input
                type="time"
                value={settings.quiet_from}
                onChange={(e) => update({ quiet_from: e.target.value })}
                className={`${inputOnCard} w-32`}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-fg-2">
              до
              <input
                type="time"
                value={settings.quiet_to}
                onChange={(e) => update({ quiet_to: e.target.value })}
                className={`${inputOnCard} w-32`}
              />
            </label>
          </div>
        )}
      </section>
    </div>
  );
}
