"use client";
import { useT } from "@/app/lib/i18n/client";

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
  const t = useT();
  const settings = data.preferences.wrapped;
  const update = (patch: Partial<typeof settings>) =>
    updatePreference("wrapped", { ...settings, ...patch });
  return (
    <div className="space-y-6">
      <SettingsIntro
        title={t("Настройки Wrapped")}
        description={t(
          "Выберите стандартный период, содержание и внешний вид карточек с музыкальными итогами.",
        )}
      />
      <section className={settingsCard}>
        <SelectRow
          title={t("Период по умолчанию")}
          description={t("Он будет открываться первым на странице статистики.")}
          value={settings.default_period}
          options={[
            { value: "7d", label: t("Неделя") },
            { value: "30d", label: t("Месяц") },
            { value: "90d", label: t("90 дней") },
            { value: "year", label: t("Текущий год") },
            { value: "all", label: t("Всё время") },
          ]}
          onChange={(default_period) => update({ default_period })}
        />
        <SelectRow
          title={t("Подпись карточки")}
          description={t("Использовать ник или отображаемое имя.")}
          value={settings.identity}
          options={[
            { value: "username", label: "@username" },
            { value: "display_name", label: t("Отображаемое имя") },
          ]}
          onChange={(identity) => update({ identity })}
        />
        <SelectRow
          title={t("Стиль карточки")}
          description={t("Оформление вертикальной карточки для публикации.")}
          value={settings.card_style}
          options={[
            { value: "classic", label: t("Классический") },
            { value: "minimal", label: t("Минималистичный") },
            { value: "vivid", label: t("Яркий") },
          ]}
          onChange={(card_style) => update({ card_style })}
        />
      </section>
      <section className={settingsCard}>
        <ToggleRow
          title={t("Минуты музыки")}
          description={t("Показывать суммарное время прослушивания.")}
          checked={settings.show_minutes}
          onChange={(show_minutes) => update({ show_minutes })}
        />
        <ToggleRow
          title={t("Количество артистов")}
          description={t("Показывать разнообразие исполнителей.")}
          checked={settings.show_artists}
          onChange={(show_artists) => update({ show_artists })}
        />
        <ToggleRow
          title={t("Количество треков")}
          description={t("Показывать число уникальных треков.")}
          checked={settings.show_tracks}
          onChange={(show_tracks) => update({ show_tracks })}
        />
        <ToggleRow
          title={t("Новые артисты")}
          description={t(
            "Показывать исполнителей, впервые появившихся в истории.",
          )}
          checked={settings.show_new_artists}
          onChange={(show_new_artists) => update({ show_new_artists })}
        />
      </section>
      <section className={settingsCard}>
        <ToggleRow
          title={t("Недельные итоги")}
          description={t("Автоматически готовить карточку в конце недели.")}
          checked={settings.auto_weekly}
          onChange={(auto_weekly) => update({ auto_weekly })}
        />
        <ToggleRow
          title={t("Месячные итоги")}
          description={t("Автоматически готовить карточку в конце месяца.")}
          checked={settings.auto_monthly}
          onChange={(auto_monthly) => update({ auto_monthly })}
        />
      </section>
    </div>
  );
}
