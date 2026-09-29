"use client";

import type { SettingsData, UpdatePreference } from "../types";
import {
  SelectRow,
  SettingsIntro,
  ToggleRow,
  settingsCard,
} from "../components/PreferenceControls";

export default function WrappedSettingsTab({
  data,
  updatePreference,
}: Readonly<{ data: SettingsData; updatePreference: UpdatePreference }>) {
  const settings = data.preferences.wrapped;
  const update = (patch: Partial<typeof settings>) =>
    updatePreference("wrapped", { ...settings, ...patch });
  return (
    <div className="space-y-6">
      <SettingsIntro
        title="Настройки Wrapped"
        description="Выберите стандартный период, содержание и внешний вид карточек с музыкальными итогами."
      />
      <section className={settingsCard}>
        <SelectRow
          title="Период по умолчанию"
          description="Он будет открываться первым на странице статистики."
          value={settings.default_period}
          options={[
            { value: "7d", label: "Неделя" },
            { value: "30d", label: "Месяц" },
            { value: "90d", label: "90 дней" },
            { value: "year", label: "Текущий год" },
            { value: "all", label: "Всё время" },
          ]}
          onChange={(default_period) => update({ default_period })}
        />
        <SelectRow
          title="Подпись карточки"
          description="Использовать ник или отображаемое имя."
          value={settings.identity}
          options={[
            { value: "username", label: "@username" },
            { value: "display_name", label: "Отображаемое имя" },
          ]}
          onChange={(identity) => update({ identity })}
        />
        <SelectRow
          title="Стиль карточки"
          description="Оформление вертикальной карточки для публикации."
          value={settings.card_style}
          options={[
            { value: "classic", label: "Классический" },
            { value: "minimal", label: "Минималистичный" },
            { value: "vivid", label: "Яркий" },
          ]}
          onChange={(card_style) => update({ card_style })}
        />
      </section>
      <section className={settingsCard}>
        <ToggleRow
          title="Минуты музыки"
          description="Показывать суммарное время прослушивания."
          checked={settings.show_minutes}
          onChange={(show_minutes) => update({ show_minutes })}
        />
        <ToggleRow
          title="Количество артистов"
          description="Показывать разнообразие исполнителей."
          checked={settings.show_artists}
          onChange={(show_artists) => update({ show_artists })}
        />
        <ToggleRow
          title="Количество треков"
          description="Показывать число уникальных треков."
          checked={settings.show_tracks}
          onChange={(show_tracks) => update({ show_tracks })}
        />
        <ToggleRow
          title="Новые артисты"
          description="Показывать исполнителей, впервые появившихся в истории."
          checked={settings.show_new_artists}
          onChange={(show_new_artists) => update({ show_new_artists })}
        />
      </section>
      <section className={settingsCard}>
        <ToggleRow
          title="Недельные итоги"
          description="Автоматически готовить карточку в конце недели."
          checked={settings.auto_weekly}
          onChange={(auto_weekly) => update({ auto_weekly })}
        />
        <ToggleRow
          title="Месячные итоги"
          description="Автоматически готовить карточку в конце месяца."
          checked={settings.auto_monthly}
          onChange={(auto_monthly) => update({ auto_monthly })}
        />
      </section>
    </div>
  );
}
