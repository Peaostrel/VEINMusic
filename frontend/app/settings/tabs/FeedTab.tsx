"use client";
import { useT } from "@/app/lib/i18n/client";
import { msg } from "@/app/lib/i18n/core";

import type { SettingsData, UpdatePreference } from "../types";
import {
  CheckboxGrid,
  SelectRow,
  SettingsIntro,
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

export default function FeedTab({
  data,
  updatePreference,
}: Readonly<{ data: SettingsData; updatePreference: UpdatePreference }>) {
  const t = useT();
  const settings = data.preferences.feed;
  const update = (patch: Partial<typeof settings>) =>
    updatePreference("feed", { ...settings, ...patch });
  return (
    <div className="space-y-6">
      <SettingsIntro
        title={t("Лента и общение")}
        description={t(
          "Управляйте тем, что появляется в общей ленте и как другие пользователи могут взаимодействовать с вашими прослушиваниями.",
        )}
      />
      <section className={settingsCard}>
        <ToggleRow
          title={t("Публиковать прослушивания")}
          description={t(
            "Если выключить, новые треки останутся в вашем профиле, но исчезнут из общей ленты и ленты друзей.",
          )}
          checked={settings.share_scrobbles}
          onChange={(share_scrobbles) => update({ share_scrobbles })}
        />
        <ToggleRow
          title={t("Публиковать достижения")}
          description={t(
            "Разрешить VEIN добавлять полученные достижения в социальную ленту.",
          )}
          checked={settings.share_achievements}
          onChange={(share_achievements) => update({ share_achievements })}
        />
        <ToggleRow
          title={t("Разрешить реакции")}
          description={t(
            "Другие пользователи смогут ставить реакции вашим прослушиваниям.",
          )}
          checked={settings.allow_likes}
          onChange={(allow_likes) => update({ allow_likes })}
        />
        <ToggleRow
          title={t("Разрешить комментарии")}
          description={t(
            "Другие пользователи смогут обсуждать ваши прослушивания.",
          )}
          checked={settings.allow_comments}
          onChange={(allow_comments) => update({ allow_comments })}
        />
        <SelectRow
          title={t("Лента по умолчанию")}
          description={t("Какую вкладку открывать на главной после входа.")}
          value={settings.default_scope}
          options={[
            { value: "all", label: t("Все пользователи") },
            { value: "following", label: t("Только подписки") },
          ]}
          onChange={(default_scope) => update({ default_scope })}
        />
      </section>
      <section className={`${settingsCard} p-5`}>
        <h3 className="text-sm font-medium">
          {t("Скрыть источники из моей ленты")}
        </h3>
        <p className="mb-4 mt-1 text-xs text-fg-2">
          {t(
            "Фильтр влияет только на то, что видите вы, и не удаляет прослушивания.",
          )}
        </p>
        <CheckboxGrid
          values={settings.hidden_sources}
          options={SOURCES}
          onChange={(hidden_sources) => update({ hidden_sources })}
        />
      </section>
    </div>
  );
}
