import type { UserInfo } from "@/app/lib/types";
import { useFeature } from "@/app/lib/featureFlags";
import { LogoGlyph } from "@/components/brand";
import { btn, inputOnCard } from "@/components/ui";
import LastfmImportStatus from "../components/LastfmImportStatus";
import type { SettingsData, UpdateData } from "../types";

interface IntegrationsTabProps {
  data: SettingsData;
  updateData: UpdateData;
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
          description="Скробблинг напрямую через сервер, без расширения."
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
            <button
              type="button"
              onClick={() => {
                globalThis.location.href = `${API_URL}/auth/spotify/login`;
              }}
              className={userProfile?.spotify_linked ? small : smallPrimary}
            >
              {userProfile?.spotify_linked ? "Обновить" : "Подключить"}
            </button>
          </div>
        </Row>

        <Row
          logo="Я"
          name="Яндекс Музыка"
          status={synced(userProfile?.yandex_linked)}
          statusOk={Boolean(userProfile?.yandex_linked)}
          description={
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
          }
        >
          <input
            type="password"
            value={data.yandexToken}
            onChange={(e) => updateData("yandexToken", e.target.value)}
            placeholder="y0_AgAAA…"
            aria-label="OAuth-токен Яндекса"
            autoComplete="new-password"
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
          description="Импорт истории. Повторный импорт добавит только новые прослушивания."
          footer={<LastfmImportStatus refreshKey={importRefresh ?? 0} />}
        >
          <input
            value={data.lastfmUsername}
            onChange={(e) => updateData("lastfmUsername", e.target.value)}
            placeholder="Ник на Last.fm"
            aria-label="Ник на Last.fm"
            autoComplete="off"
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
              disabled={!importEnabled}
              title={importEnabled ? undefined : "Импорт временно отключён"}
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
