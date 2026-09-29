"use client";

import { FlaskConical } from "lucide-react";
import type { SettingsData, UpdatePreference } from "../types";
import {
  SettingsIntro,
  ToggleRow,
  settingsCard,
} from "../components/PreferenceControls";

export default function ExperimentsTab({
  data,
  updatePreference,
}: Readonly<{ data: SettingsData; updatePreference: UpdatePreference }>) {
  const settings = data.preferences.experiments;
  const update = (patch: Partial<typeof settings>) =>
    updatePreference("experiments", { ...settings, ...patch });
  return (
    <div className="space-y-6">
      <SettingsIntro
        title="Экспериментальное"
        description="Функции могут меняться или временно отключаться. Ваши прослушивания и основные данные от этого не пострадают."
      />
      <div className="flex gap-3 rounded-xl border border-accent/30 bg-accent/5 p-4 text-xs leading-relaxed text-fg-2">
        <FlaskConical
          className="h-4 w-4 shrink-0 text-accent"
          aria-hidden="true"
        />
        Переключатели действуют только для вашего аккаунта. Администратор всё
        ещё может глобально отключить незавершённую функцию.
      </div>
      <section className={settingsCard}>
        <ToggleRow
          title="Умные рекомендации"
          description="Использовать музыкальных двойников и историю вкуса при подборе артистов."
          checked={settings.smart_recommendations}
          onChange={(smart_recommendations) =>
            update({ smart_recommendations })
          }
        />
        <ToggleRow
          title="Музыкальный паспорт"
          description="Разрешить VEIN строить расширенный портрет вашего музыкального вкуса."
          checked={settings.taste_passport}
          onChange={(taste_passport) => update({ taste_passport })}
        />
        <ToggleRow
          title="Новая компоновка профиля"
          description="Тестировать обновлённое расположение блоков публичного профиля."
          checked={settings.new_profile_layout}
          onChange={(new_profile_layout) => update({ new_profile_layout })}
        />
        <ToggleRow
          title="Диагностика интеграций"
          description="Показывать расширенные статусы синхронизации и технические причины ошибок."
          checked={settings.diagnostics}
          onChange={(diagnostics) => update({ diagnostics })}
        />
      </section>
    </div>
  );
}
