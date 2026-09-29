"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff } from "lucide-react";
import type { ProfileSection } from "@/app/lib/types";
import type { SettingsData, UpdatePreference } from "../types";
import {
  SettingsIntro,
  ToggleRow,
  settingsCard,
} from "../components/PreferenceControls";

const LABELS: Record<ProfileSection, { title: string; description: string }> = {
  showcase: { title: "Витрина", description: "Любимый артист, трек и альбом" },
  recommendations: {
    title: "Рекомендации",
    description: "Артисты, которые могут понравиться",
  },
  history: { title: "История", description: "Последние прослушивания" },
  wrapped: { title: "Итоги месяца", description: "Краткий Wrapped в профиле" },
  top_tracks: {
    title: "Топ треков",
    description: "Чаще всего прослушиваемые треки",
  },
  top_artists: { title: "Топ артистов", description: "Любимые исполнители" },
};

export default function ProfileLayoutTab({
  data,
  updatePreference,
}: Readonly<{ data: SettingsData; updatePreference: UpdatePreference }>) {
  const settings = data.preferences.profile;
  const update = (patch: Partial<typeof settings>) =>
    updatePreference("profile", { ...settings, ...patch });
  const movableSections = settings.section_order.filter(
    (section) => section !== "showcase",
  );
  const move = (section: ProfileSection, direction: -1 | 1) => {
    if (section === "showcase") return;
    const index = movableSections.indexOf(section);
    const target = index + direction;
    if (target < 0 || target >= movableSections.length) return;
    const next = [...movableSections];
    [next[index], next[target]] = [next[target], next[index]];
    update({ section_order: ["showcase", ...next] });
  };
  const toggle = (section: ProfileSection) =>
    update({
      hidden_sections: settings.hidden_sections.includes(section)
        ? settings.hidden_sections.filter((item) => item !== section)
        : [...settings.hidden_sections, section],
    });

  return (
    <div className="space-y-6">
      <SettingsIntro
        title="Конструктор профиля"
        description="Скройте ненужные блоки и задайте их приоритет внутри основной и боковой колонок. Витрина закреплена сразу под шапкой профиля."
      />
      <ol className={settingsCard}>
        {settings.section_order.map((section, index) => {
          const hidden = settings.hidden_sections.includes(section);
          const fixed = section === "showcase";
          const movableIndex = fixed ? -1 : movableSections.indexOf(section);
          return (
            <li
              key={section}
              className="flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-0"
            >
              <span className="w-6 text-center font-mono text-xs text-fg-3">
                {index + 1}
              </span>
              <span className={`min-w-0 flex-1 ${hidden ? "opacity-45" : ""}`}>
                <span className="block text-sm font-medium">
                  {LABELS[section].title}
                </span>
                <span className="block text-xs text-fg-2">
                  {LABELS[section].description}
                  {fixed ? " · закреплено" : ""}
                </span>
              </span>
              <button
                type="button"
                onClick={() => move(section, -1)}
                disabled={fixed || movableIndex === 0}
                aria-label={`Поднять ${LABELS[section].title}`}
                className="rounded-md p-2 text-fg-2 hover:bg-surface-2 hover:text-fg disabled:opacity-25"
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => move(section, 1)}
                disabled={fixed || movableIndex === movableSections.length - 1}
                aria-label={`Опустить ${LABELS[section].title}`}
                className="rounded-md p-2 text-fg-2 hover:bg-surface-2 hover:text-fg disabled:opacity-25"
              >
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => toggle(section)}
                aria-label={`${hidden ? "Показать" : "Скрыть"} ${LABELS[section].title}`}
                className="rounded-md p-2 text-fg-2 hover:bg-surface-2 hover:text-fg"
              >
                {hidden ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </li>
          );
        })}
      </ol>
      <section className={settingsCard}>
        <ToggleRow
          title="Показывать статус онлайн"
          description="Разрешить другим видеть, что профиль сейчас активен."
          checked={settings.show_online_status}
          onChange={(show_online_status) => update({ show_online_status })}
        />
      </section>
    </div>
  );
}
