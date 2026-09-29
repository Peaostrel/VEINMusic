import type { Visibility } from "@/app/lib/types";
import type { SettingsData, UpdateData, UpdatePreference } from "../types";
import {
  SelectRow,
  SettingsIntro,
  ToggleRow,
  settingsCard,
} from "../components/PreferenceControls";

const VISIBILITY = [
  { value: "all" as const, label: "Все" },
  { value: "followers" as const, label: "Подписчики" },
  { value: "private" as const, label: "Только я" },
];

export default function PrivacyTab({
  data,
  updateData,
  updatePreference,
}: Readonly<{
  data: SettingsData;
  updateData: UpdateData;
  updatePreference: UpdatePreference;
}>) {
  const privacy = data.preferences.privacy;
  const updateVisibility = (
    key: keyof Omit<typeof privacy, "show_listening_source">,
    value: Visibility,
  ) => updatePreference("privacy", { ...privacy, [key]: value });
  return (
    <div className="space-y-6">
      <SettingsIntro
        title="Приватность"
        description="Закройте профиль целиком или настройте доступ к каждой части отдельно. Сервер применяет эти ограничения и к API, а не только скрывает блоки на странице."
      />
      <section className={settingsCard}>
        <ToggleRow
          title="Приватный профиль"
          description="Весь профиль, история и статистика доступны только вам. Этот переключатель имеет приоритет над правилами ниже."
          checked={data.isPrivate}
          onChange={(isPrivate) => updateData("isPrivate", isPrivate)}
        />
        <SelectRow
          title="Совместное прослушивание"
          description="Кто может приглашать вас слушать музыку вместе."
          value={data.syncPrivacy || "all"}
          options={[
            { value: "all", label: "Все пользователи" },
            { value: "followers", label: "Только мои подписки" },
            { value: "none", label: "Никто" },
          ]}
          onChange={(value) => updateData("syncPrivacy", value)}
        />
      </section>

      <section className={settingsCard}>
        <SelectRow
          title="История прослушиваний"
          description="Последние треки и подробная история."
          value={privacy.history}
          options={VISIBILITY}
          onChange={(value) => updateVisibility("history", value)}
        />
        <SelectRow
          title="Статистика и календарь"
          description="Топы, графики, Wrapped и музыкальный календарь."
          value={privacy.statistics}
          options={VISIBILITY}
          onChange={(value) => updateVisibility("statistics", value)}
        />
        <SelectRow
          title="Текущий трек"
          description="Что вы слушаете прямо сейчас."
          value={privacy.current_track}
          options={VISIBILITY}
          onChange={(value) => updateVisibility("current_track", value)}
        />
        <SelectRow
          title="Витрина профиля"
          description="Любимые артист, трек и альбом."
          value={privacy.showcase}
          options={VISIBILITY}
          onChange={(value) => updateVisibility("showcase", value)}
        />
        <SelectRow
          title="Подписчики и подписки"
          description="Списки социальных связей профиля."
          value={privacy.followers}
          options={VISIBILITY}
          onChange={(value) => updateVisibility("followers", value)}
        />
        <SelectRow
          title="Страна и город"
          description="Местоположение в шапке профиля."
          value={privacy.location}
          options={VISIBILITY}
          onChange={(value) => updateVisibility("location", value)}
        />
        <SelectRow
          title="Социальные ссылки"
          description="Добавленные ссылки на соцсети, видеоплатформы и музыкальные сервисы."
          value={privacy.social_links}
          options={VISIBILITY}
          onChange={(value) => updateVisibility("social_links", value)}
        />
        <ToggleRow
          title="Показывать источник прослушивания"
          description="Например, Яндекс Музыка, Spotify или десктопный клиент."
          checked={privacy.show_listening_source}
          onChange={(show_listening_source) =>
            updatePreference("privacy", { ...privacy, show_listening_source })
          }
        />
      </section>
    </div>
  );
}
