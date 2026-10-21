"use client";
import type { Visibility } from "@/app/lib/types";
import { useT } from "@/app/lib/i18n/client";
import { msg } from "@/app/lib/i18n/core";
import type { SettingsData, UpdateData, UpdatePreference } from "../types";
import {
  SelectRow,
  SettingsIntro,
  ToggleRow,
  settingsCard,
} from "../components/PreferenceControls";

const VISIBILITY = [
  { value: "all" as const, label: msg("Все") },
  { value: "followers" as const, label: msg("Подписчики") },
  { value: "private" as const, label: msg("Только я") },
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
  const t = useT();
  const privacy = data.preferences.privacy;
  const updateVisibility = (
    key: keyof Omit<
      typeof privacy,
      "show_listening_source" | "location_precision" | "search_indexing"
    >,
    value: Visibility,
  ) => updatePreference("privacy", { ...privacy, [key]: value });
  return (
    <div className="space-y-6">
      <SettingsIntro
        title={t("Приватность")}
        description={t(
          "Закройте профиль целиком или настройте доступ к каждой части отдельно. Сервер применяет эти ограничения и к API, а не только скрывает блоки на странице.",
        )}
      />
      <section className={settingsCard}>
        <ToggleRow
          title={t("Приватный профиль")}
          description={t(
            "Весь профиль, история и статистика доступны только вам. Этот переключатель имеет приоритет над правилами ниже.",
          )}
          checked={data.isPrivate}
          onChange={(isPrivate) => updateData("isPrivate", isPrivate)}
        />
      </section>

      <section className={settingsCard}>
        <SelectRow
          title={t("История прослушиваний")}
          description={t("Последние треки и подробная история.")}
          value={privacy.history}
          options={VISIBILITY}
          onChange={(value) => updateVisibility("history", value)}
        />
        <SelectRow
          title={t("Статистика и календарь")}
          description={t("Топы, графики, Wrapped и музыкальный календарь.")}
          value={privacy.statistics}
          options={VISIBILITY}
          onChange={(value) => updateVisibility("statistics", value)}
        />
        <SelectRow
          title={t("Текущий трек")}
          description={t("Что вы слушаете прямо сейчас.")}
          value={privacy.current_track}
          options={VISIBILITY}
          onChange={(value) => updateVisibility("current_track", value)}
        />
        <SelectRow
          title={t("Витрина профиля")}
          description={t("Любимые артист, трек и альбом.")}
          value={privacy.showcase}
          options={VISIBILITY}
          onChange={(value) => updateVisibility("showcase", value)}
        />
        <SelectRow
          title={t("Подписчики и подписки")}
          description={t("Списки социальных связей профиля.")}
          value={privacy.followers}
          options={VISIBILITY}
          onChange={(value) => updateVisibility("followers", value)}
        />
        <SelectRow
          title={t("Страна и город")}
          description={t("Местоположение в шапке профиля.")}
          value={privacy.location}
          options={VISIBILITY}
          onChange={(value) => updateVisibility("location", value)}
        />
        <SelectRow
          title={t("Точность местоположения")}
          description={t(
            "Можно оставить публичной только страну, не показывая город. Владелец профиля всегда видит полное значение.",
          )}
          value={privacy.location_precision}
          options={[
            { value: "city", label: t("Страна и город") },
            { value: "country", label: t("Только страна") },
          ]}
          onChange={(location_precision) =>
            updatePreference("privacy", { ...privacy, location_precision })
          }
        />
        <SelectRow
          title={t("Социальные ссылки")}
          description={t(
            "Добавленные ссылки на соцсети, видеоплатформы и музыкальные сервисы.",
          )}
          value={privacy.social_links}
          options={VISIBILITY}
          onChange={(value) => updateVisibility("social_links", value)}
        />
        <ToggleRow
          title={t("Показывать источник прослушивания")}
          description={t(
            "Например, Яндекс Музыка, Spotify или десктопный клиент.",
          )}
          checked={privacy.show_listening_source}
          onChange={(show_listening_source) =>
            updatePreference("privacy", { ...privacy, show_listening_source })
          }
        />
        <ToggleRow
          title={t("Показывать профиль в поисковиках")}
          description={t(
            "Яндекс и Google смогут найти страницу профиля. Если выключить, профиль останется доступен по ссылке, но поисковикам будет запрещено его показывать.",
          )}
          checked={privacy.search_indexing}
          onChange={(search_indexing) =>
            updatePreference("privacy", { ...privacy, search_indexing })
          }
        />
      </section>
    </div>
  );
}
