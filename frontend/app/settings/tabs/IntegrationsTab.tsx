import type { UserInfo } from "@/app/lib/types";
import { useCallback, useEffect, useState } from "react";
import { Cloud, Import, Puzzle, RefreshCw } from "lucide-react";
import { useFeature } from "@/app/lib/featureFlags";
import { LogoGlyph } from "@/components/brand";
import { btn, inputOnCard } from "@/components/ui";
import LastfmImportStatus from "../components/LastfmImportStatus";
import type { SettingsData, UpdateData, UpdatePreference } from "../types";
import { ToggleRow, settingsCard } from "../components/PreferenceControls";

interface IntegrationsTabProps {
  data: SettingsData;
  updateData: UpdateData;
  updatePreference: UpdatePreference;
  userProfile: UserInfo | null;
  handleDisconnect: (service: string) => void;
  saveYandexToken: () => void;
  startLastfmImport: () => void;
  importRefresh: number;
  generatedApiKey: string | null;
  handleGenerateApiKey: () => void;
  handleCopyKey: () => void;
  copied: boolean;
  API_URL: string;
}

const small = `${btn.secondary} ${btn.sm}`;
const smallPrimary = `${btn.primary} ${btn.sm}`;
const smallDanger = `${btn.danger} ${btn.sm}`;

interface IntegrationStatus {
  auto_sync: boolean;
  last_sync?: string | null;
  services: {
    id: string;
    name: string;
    linked: boolean;
    mode: "cloud" | "extension" | "import";
    user_enabled: boolean;
    admin_enabled: boolean;
  }[];
}

function IntegrationHealth({ API_URL }: Readonly<{ API_URL: string }>) {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API_URL}/api/integrations/status`, { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then(setStatus)
      .finally(() => setLoading(false));
  }, [API_URL]);
  useEffect(load, [load]);
  const syncNow = async () => {
    setSyncing(true);
    setMessage("");
    try {
      const response = await fetch(`${API_URL}/api/integrations/sync`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: "all" }),
      });
      const result = await response.json().catch(() => ({}));
      setMessage(
        response.ok
          ? "Синхронизация завершена."
          : result.detail || "Не удалось запустить синхронизацию.",
      );
      load();
    } finally {
      setSyncing(false);
    }
  };
  const icon = (mode: string) => {
    if (mode === "cloud") return <Cloud className="h-3.5 w-3.5" />;
    if (mode === "import") return <Import className="h-3.5 w-3.5" />;
    return <Puzzle className="h-3.5 w-3.5" />;
  };
  return (
    <section className={`${settingsCard} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium">Состояние синхронизации</h3>
          <p className="mt-1 text-xs text-fg-3">
            {status?.last_sync
              ? `Последняя активность ${new Date(status.last_sync).toLocaleString("ru-RU")}`
              : "VEIN пока не получил данные от облачных подключений."}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className={small}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Проверить
          </button>
          <button
            type="button"
            onClick={syncNow}
            disabled={syncing || !status?.auto_sync}
            className={smallPrimary}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
            />
            Синхронизировать
          </button>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(status?.services ?? []).map((service) => {
          let label = service.linked ? "подключено" : "не подключено";
          let color = service.linked ? "text-ok" : "text-fg-3";
          if (!service.admin_enabled) {
            label = "отключено администратором";
            color = "text-danger";
          } else if (!status?.auto_sync || !service.user_enabled) {
            label = "приостановлено вами";
            color = "text-fg-3";
          }
          return (
            <div
              key={service.id}
              className="rounded-lg border border-line-soft bg-bg p-3"
            >
              <span className="flex items-center gap-2 text-xs font-medium">
                {icon(service.mode)}
                {service.name}
              </span>
              <span className={`mt-1 block font-mono text-[10px] ${color}`}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
      {message && (
        <p role="status" className="mt-3 text-xs text-fg-2">
          {message}
        </p>
      )}
    </section>
  );
}

function Row({
  logo,
  name,
  status,
  statusOk,
  description,
  children,
  footer,
}: Readonly<{
  logo: React.ReactNode;
  name: string;
  status: string;
  statusOk: boolean;
  description: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}>) {
  return (
    <li className="flex flex-col gap-4 border-b border-line-soft px-5 py-5 last:border-0">
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-xs font-semibold text-fg-2">
            {logo}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium">{name}</span>
            <span
              className={`font-mono text-xs ${statusOk ? "text-ok" : "text-fg-3"}`}
            >
              {status}
            </span>
            <span className="mt-1 text-[13px] text-fg-2">{description}</span>
          </span>
        </div>
        <div className="flex flex-col gap-2 md:w-[260px]">{children}</div>
      </div>
      {footer}
    </li>
  );
}

export default function IntegrationsTab({
  data,
  updateData,
  updatePreference,
  userProfile,
  handleDisconnect,
  saveYandexToken,
  startLastfmImport,
  importRefresh,
  generatedApiKey,
  handleGenerateApiKey,
  handleCopyKey,
  copied,
  API_URL,
}: Readonly<IntegrationsTabProps>) {
  const importEnabled = useFeature("lastfm_import");
  const spotifyEnabled = useFeature("integration_spotify");
  const yandexEnabled = useFeature("integration_yandex");
  const youtubeMusicEnabled = useFeature("integration_youtube_music");
  const soundcloudEnabled = useFeature("integration_soundcloud");
  const lastfmEnabled = useFeature("integration_lastfm");
  const preferences = data.preferences.integrations;
  const updateIntegration = (patch: Partial<typeof preferences>) =>
    updatePreference("integrations", { ...preferences, ...patch });
  const synced = (linked?: boolean) => {
    if (!linked) return "не подключено";
    if (!userProfile?.last_sync) return "подключено";
    const when = new Date(userProfile.last_sync).toLocaleString("ru-RU");
    return `подключено · синхр. ${when}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Подключённые сервисы</h2>
        <p className="text-[13px] text-fg-2">
          Откуда VEIN берёт ваши прослушивания.
        </p>
      </div>

      <IntegrationHealth API_URL={API_URL} />

      <section className={settingsCard}>
        <ToggleRow
          title="Автоматическая синхронизация"
          description="Разрешить фоновым подключениям получать новые прослушивания."
          checked={preferences.auto_sync}
          onChange={(auto_sync) => updateIntegration({ auto_sync })}
        />
        <ToggleRow
          title="Spotify"
          description="Временно приостановить запись из Spotify, не удаляя подключение."
          checked={preferences.spotify_enabled}
          onChange={(spotify_enabled) => updateIntegration({ spotify_enabled })}
        />
        <ToggleRow
          title="Яндекс Музыка"
          description="Временно приостановить запись из Яндекс Музыки, сохранив токен."
          checked={preferences.yandex_enabled}
          onChange={(yandex_enabled) => updateIntegration({ yandex_enabled })}
        />
        <ToggleRow
          title="YouTube Music"
          description="Временно приостановить запись YouTube Music через расширение VEIN."
          checked={preferences.youtube_music_enabled}
          onChange={(youtube_music_enabled) =>
            updateIntegration({ youtube_music_enabled })
          }
        />
        <ToggleRow
          title="SoundCloud"
          description="Временно приостановить облачный скробблинг SoundCloud, сохранив подключение."
          checked={preferences.soundcloud_enabled}
          onChange={(soundcloud_enabled) =>
            updateIntegration({ soundcloud_enabled })
          }
        />
        <ToggleRow
          title="Last.fm"
          description="Приостановить автоматическую работу с Last.fm без удаления аккаунта."
          checked={preferences.lastfm_enabled}
          onChange={(lastfm_enabled) => updateIntegration({ lastfm_enabled })}
        />
      </section>

      {data.preferences.experiments.diagnostics && (
        <section className={`${settingsCard} p-5`}>
          <h3 className="text-sm font-medium">Диагностика интеграций</h3>
          <p className="mb-4 mt-1 text-xs text-fg-2">
            Текущее состояние подключений без токенов и других секретных данных.
          </p>
          <dl className="grid gap-3 font-mono text-xs sm:grid-cols-2">
            <div>
              <dt className="text-fg-3">Spotify</dt>
              <dd>{userProfile?.spotify_linked ? "linked" : "not linked"}</dd>
            </div>
            <div>
              <dt className="text-fg-3">Яндекс</dt>
              <dd>{userProfile?.yandex_linked ? "linked" : "not linked"}</dd>
            </div>
            <div>
              <dt className="text-fg-3">SoundCloud</dt>
              <dd>
                {userProfile?.soundcloud_linked ? "linked" : "not linked"}
              </dd>
            </div>
            <div>
              <dt className="text-fg-3">Last.fm</dt>
              <dd>{data.lastfmUsername || "not linked"}</dd>
            </div>
            <div>
              <dt className="text-fg-3">Последняя синхронизация</dt>
              <dd>
                {userProfile?.last_sync
                  ? new Date(userProfile.last_sync).toLocaleString("ru-RU")
                  : "нет данных"}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {/* Hidden fields keep browsers from autofilling the token inputs */}
      <input
        type="text"
        tabIndex={-1}
        aria-hidden="true"
        style={{ display: "none" }}
      />
      <input
        type="password"
        tabIndex={-1}
        aria-hidden="true"
        style={{ display: "none" }}
      />

      <ul className="rounded-xl border border-line bg-surface">
        <Row
          logo="S"
          name="Spotify"
          status={synced(userProfile?.spotify_linked)}
          statusOk={Boolean(userProfile?.spotify_linked)}
          description={
            spotifyEnabled
              ? "Скробблинг напрямую через сервер, без расширения."
              : "Временно приостановлено администратором."
          }
        >
          <div className="flex gap-2 md:justify-end">
            {userProfile?.spotify_linked && (
              <button
                type="button"
                onClick={() => handleDisconnect("spotify")}
                className={smallDanger}
              >
                Отключить
              </button>
            )}
            {spotifyEnabled ? (
              <a
                href={`${API_URL}/auth/spotify/login`}
                className={userProfile?.spotify_linked ? small : smallPrimary}
              >
                {userProfile?.spotify_linked ? "Обновить" : "Подключить"}
              </a>
            ) : (
              <button
                type="button"
                disabled
                title="Spotify временно отключён"
                className={userProfile?.spotify_linked ? small : smallPrimary}
              >
                {userProfile?.spotify_linked ? "Обновить" : "Подключить"}
              </button>
            )}
          </div>
        </Row>

        <Row
          logo="SC"
          name="SoundCloud"
          status={synced(userProfile?.soundcloud_linked)}
          statusOk={Boolean(userProfile?.soundcloud_linked)}
          description={
            soundcloudEnabled
              ? "Скробблинг напрямую через сервер, без расширения. После подключения включите следующий трек — старая история не импортируется."
              : "Временно приостановлено администратором."
          }
        >
          <div className="flex gap-2 md:justify-end">
            {userProfile?.soundcloud_linked && (
              <button
                type="button"
                onClick={() => handleDisconnect("soundcloud")}
                className={smallDanger}
              >
                Отключить
              </button>
            )}
            {soundcloudEnabled ? (
              <a
                href={`${API_URL}/auth/soundcloud/login`}
                className={
                  userProfile?.soundcloud_linked ? small : smallPrimary
                }
              >
                {userProfile?.soundcloud_linked ? "Обновить" : "Подключить"}
              </a>
            ) : (
              <button
                type="button"
                disabled
                title="SoundCloud временно отключён"
                className={
                  userProfile?.soundcloud_linked ? small : smallPrimary
                }
              >
                {userProfile?.soundcloud_linked ? "Обновить" : "Подключить"}
              </button>
            )}
          </div>
        </Row>

        <Row
          logo="YT"
          name="YouTube Music"
          status={
            youtubeMusicEnabled ? "через расширение VEIN" : "приостановлено"
          }
          statusOk={youtubeMusicEnabled}
          description={
            youtubeMusicEnabled
              ? "Откройте YouTube Music в браузере с подключённым расширением VEIN — текущий трек, пауза и прогресс определяются автоматически."
              : "Временно приостановлено администратором."
          }
        >
          <a
            href={
              youtubeMusicEnabled ? "https://music.youtube.com/" : undefined
            }
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!youtubeMusicEnabled}
            tabIndex={youtubeMusicEnabled ? undefined : -1}
            title={
              youtubeMusicEnabled
                ? undefined
                : "YouTube Music временно отключён"
            }
            className={`${smallPrimary} ${youtubeMusicEnabled ? "" : "cursor-not-allowed opacity-50"}`}
          >
            Открыть YouTube Music
          </a>
        </Row>

        <Row
          logo="Я"
          name="Яндекс Музыка"
          status={synced(userProfile?.yandex_linked)}
          statusOk={Boolean(userProfile?.yandex_linked)}
          description={
            yandexEnabled ? (
              <>
                Нужен OAuth-токен.{" "}
                <a
                  href="https://oauth.yandex.ru/authorize?response_type=token&client_id=23cabbbdc6cd418abb4b39c32c41195d"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  Получить токен
                </a>
              </>
            ) : (
              "Временно приостановлено администратором."
            )
          }
        >
          <input
            type="password"
            value={data.yandexToken}
            onChange={(e) => updateData("yandexToken", e.target.value)}
            placeholder="y0_AgAAA…"
            aria-label="OAuth-токен Яндекса"
            autoComplete="new-password"
            disabled={!yandexEnabled}
            readOnly
            onFocus={(e) => e.target.removeAttribute("readonly")}
            className={`${inputOnCard} h-9`}
          />
          <div className="flex gap-2">
            {userProfile?.yandex_linked && (
              <button
                type="button"
                onClick={() => handleDisconnect("yandex")}
                className={`${smallDanger} flex-1`}
              >
                Удалить
              </button>
            )}
            <button
              type="button"
              onClick={saveYandexToken}
              disabled={!yandexEnabled}
              title={
                yandexEnabled ? undefined : "Яндекс Музыка временно отключена"
              }
              className={`${smallPrimary} flex-1`}
            >
              Сохранить
            </button>
          </div>
        </Row>

        <Row
          logo="fm"
          name="Last.fm"
          status={
            data.lastfmUsername
              ? `аккаунт ${data.lastfmUsername}`
              : "не подключено"
          }
          statusOk={Boolean(data.lastfmUsername)}
          description={
            lastfmEnabled
              ? "Импорт истории. Повторный импорт добавит только новые прослушивания."
              : "Временно приостановлено администратором."
          }
          footer={<LastfmImportStatus refreshKey={importRefresh ?? 0} />}
        >
          <input
            value={data.lastfmUsername}
            onChange={(e) => updateData("lastfmUsername", e.target.value)}
            placeholder="Ник на Last.fm"
            aria-label="Ник на Last.fm"
            autoComplete="off"
            disabled={!lastfmEnabled}
            readOnly
            onFocus={(e) => e.target.removeAttribute("readonly")}
            className={`${inputOnCard} h-9`}
          />
          <div className="flex gap-2">
            {data.lastfmUsername && (
              <button
                type="button"
                onClick={() => handleDisconnect("lastfm")}
                className={`${small} flex-1`}
              >
                Очистить
              </button>
            )}
            <button
              type="button"
              onClick={startLastfmImport}
              disabled={
                !importEnabled || !lastfmEnabled || !preferences.lastfm_enabled
              }
              title={
                importEnabled && lastfmEnabled && preferences.lastfm_enabled
                  ? undefined
                  : preferences.lastfm_enabled
                    ? "Импорт временно отключён"
                    : "Last.fm приостановлен в настройках аккаунта"
              }
              className={`${smallPrimary} flex-1`}
            >
              Импорт
            </button>
          </div>
        </Row>

        {userProfile?.has_api_key && (
          <Row
            logo={<LogoGlyph size={18} />}
            name="Расширение VEIN"
            status="ключ выпущен"
            statusOk
            description="Ключ для браузерного расширения и своих скриптов."
            footer={
              generatedApiKey && (
                <p className="text-xs text-accent">
                  Ключ показывается один раз — скопируйте его сейчас. После
                  перезагрузки страницы он скроется.
                </p>
              )
            }
          >
            <div className="flex items-center gap-2">
              <code className="h-9 min-w-0 flex-1 truncate rounded-lg border border-line bg-bg px-3 font-mono text-xs leading-9 text-fg-2">
                {generatedApiKey ?? "••••••••••••••••••••••••"}
              </code>
              {generatedApiKey && (
                <button type="button" onClick={handleCopyKey} className={small}>
                  {copied ? "Готово" : "Копировать"}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleGenerateApiKey}
              className={small}
            >
              {generatedApiKey ? "Выпустить другой" : "Выпустить новый ключ"}
            </button>
          </Row>
        )}
      </ul>
    </div>
  );
}
