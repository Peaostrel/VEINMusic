"use client";

import { useT } from "@/app/lib/i18n/client";
import { msg } from "@/app/lib/i18n/core";
import { tr } from "@/app/lib/i18n/active";
import { useState } from "react";
import { PlugZap, RefreshCw, Unplug, UserRound } from "lucide-react";
import type {
  IntegrationPage,
  IntegrationRow,
  YandexLiveStatus,
} from "../types";
import {
  Notice,
  PanelTitle,
  Pager,
  adminRequest,
  buttonClass,
  formatDateTime,
  inputClass,
  labelClass,
  panelClass,
  query,
  useAdminResource,
  useNotice,
} from "../ui";

const LIMIT = 30;
const PROVIDER_NAMES = {
  yandex: msg("Яндекс Музыка"),
  spotify: "Spotify",
  soundcloud: "SoundCloud",
  lastfm: "Last.fm",
} as const;
type Provider = keyof typeof PROVIDER_NAMES;

function ago(ms: number | null, now: number) {
  if (!ms) return "—";
  const sec = Math.max(0, Math.round((now - ms) / 1000));
  if (sec < 60) return tr("{n} с назад", { n: sec });
  if (sec < 3600) return tr("{n} мин назад", { n: Math.round(sec / 60) });
  if (sec < 86400) return tr("{n} ч назад", { n: Math.round(sec / 3600) });
  return formatDateTime(new Date(ms).toISOString());
}

function LiveState({
  live,
  linked,
  now,
}: Readonly<{
  live: YandexLiveStatus | null;
  linked: boolean;
  now: number;
}>) {
  const t = useT();
  if (!linked) return null;
  if (!live) {
    return (
      <span className="text-fg-3">
        {t("нет живого соединения (опрос раз в 30 с)")}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className={live.connected ? "text-ok" : "text-danger"}>
        ●{" "}
        {live.connected
          ? t("на связи {ago}", { ago: ago(live.since_ms, now) })
          : t("нет связи")}
      </span>
      <span className="text-fg-2">
        {t("событие: {ago}", { ago: ago(live.last_event_ms, now) })}
        {live.track_id &&
          ` · ${t("трек {id}", { id: live.track_id })} ${live.playing ? t("играет") : t("на паузе")}`}
        {live.web && ` · ${t("сайт")}`}
      </span>
      {live.connections > 1 && (
        <span className="text-fg-3">
          {t("подключений: {n}", { n: live.connections })}
        </span>
      )}
      {live.last_error && (
        <span className="break-all text-danger" title={live.last_error}>
          {t("ошибка {ago}:", { ago: ago(live.last_error_ms, now) })}{" "}
          {live.last_error.slice(0, 120)}
        </span>
      )}
    </span>
  );
}

function Row({
  r,
  now,
  onOpenUser,
  act,
}: Readonly<{
  r: IntegrationRow;
  now: number;
  onOpenUser: (username: string) => void;
  act: (
    request: () => Promise<unknown>,
    success: string,
    confirmText?: string,
  ) => void;
}>) {
  const t = useT();
  const base = `/api/admin/integrations/${encodeURIComponent(r.username)}`;
  const unlink = (provider: Provider) =>
    act(
      () => adminRequest(`${base}/${provider}`, { method: "DELETE" }),
      t("{provider} отключён", { provider: t(PROVIDER_NAMES[provider]) }),
      t(
        "Отключить {provider} у @{username}? Пользователь сможет подключить заново в настройках.",
        { provider: t(PROVIDER_NAMES[provider]), username: r.username },
      ),
    );
  const linked = (
    [
      ["yandex", r.yandex],
      ["spotify", r.spotify],
      ["soundcloud", r.soundcloud],
      ["lastfm", Boolean(r.lastfm_username)],
    ] as [Provider, boolean][]
  ).filter(([, on]) => on);

  return (
    <li className="space-y-2 rounded-xl border border-line-soft bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-2">
        <button
          type="button"
          onClick={() => onOpenUser(r.username)}
          className="inline-flex items-center gap-1 text-sm font-medium text-fg hover:text-accent"
        >
          <UserRound className="h-3.5 w-3.5" aria-hidden="true" />@{r.username}
        </button>
        {r.is_banned && (
          <span className="text-[10px] font-medium text-danger">
            {t("БАН")}
          </span>
        )}
        <span>
          {t("последний трек: {date}", {
            date: formatDateTime(r.last_scrobble),
          })}
        </span>
        <span>{t("опрос: {date}", { date: formatDateTime(r.last_sync) })}</span>
      </div>
      <ul className="space-y-1.5 text-xs">
        {linked.map(([provider]) => (
          <li
            key={provider}
            className="flex flex-col gap-2 rounded-lg bg-bg px-3 py-2 sm:flex-row sm:items-center"
          >
            <span className="w-28 shrink-0 font-medium text-fg">
              {t(PROVIDER_NAMES[provider])}
            </span>
            <span className="min-w-0 flex-1">
              {provider === "yandex" && (
                <LiveState live={r.yandex_live} linked={r.yandex} now={now} />
              )}
              {provider === "lastfm" && (
                <span className="font-mono text-fg-2">{r.lastfm_username}</span>
              )}
              {(provider === "spotify" || provider === "soundcloud") && (
                <span className="text-fg-2">{t("опрос раз в 30 с")}</span>
              )}
            </span>
            <span className="flex shrink-0 gap-2">
              {provider === "yandex" && (
                <button
                  type="button"
                  className={buttonClass.secondary}
                  onClick={() =>
                    act(
                      () =>
                        adminRequest(`${base}/yandex/reconnect`, {
                          method: "POST",
                        }),
                      t("Воркер переподключится в течение 15 секунд"),
                    )
                  }
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("Переподключить")}
                </button>
              )}
              <button
                type="button"
                className={buttonClass.danger}
                onClick={() => unlink(provider)}
              >
                <Unplug className="h-3.5 w-3.5" aria-hidden="true" />
                {t("Отключить")}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}

/** Linked services per user and the state of the Yandex live connections. */
export default function IntegrationsTab({
  onOpenUser,
}: Readonly<{ onOpenUser: (username: string) => void }>) {
  const t = useT();
  const [q, setQ] = useState("");
  const [provider, setProvider] = useState("");
  const [offset, setOffset] = useState(0);
  const { data, error, loading, reload } = useAdminResource<IntegrationPage>(
    `/api/admin/integrations${query({ q, provider, limit: LIMIT, offset })}`,
  );
  const { notice, run } = useNotice();

  const act = async (
    request: () => Promise<unknown>,
    success: string,
    confirmText?: string,
  ) => {
    if (confirmText && !confirm(confirmText)) return;
    if (await run(request, success)) reload();
  };

  const heartbeatAge = data?.worker_heartbeat_ms
    ? (data.now_ms - data.worker_heartbeat_ms) / 1000
    : null;

  return (
    <div className="space-y-4">
      <div className={panelClass}>
        <div>
          <PanelTitle icon={<PlugZap aria-hidden="true" />}>
            {t("Управление провайдерами")}
          </PanelTitle>
          <p className="mt-1 text-xs text-fg-2">
            {t(
              "Пауза останавливает фоновые опросы и новые подключения, но сохраняет токены пользователей.",
            )}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(Object.entries(PROVIDER_NAMES) as [Provider, string][]).map(
            ([id, name]) => {
              const state = data?.providers[id];
              const enabled = state?.enabled ?? true;
              return (
                <div
                  key={id}
                  className="flex flex-col gap-3 rounded-lg border border-line-soft bg-bg p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-fg">
                      {t(name)}
                    </span>
                    <span
                      className={`font-mono text-[10px] ${enabled ? "text-ok" : "text-danger"}`}
                    >
                      {enabled ? t("РАБОТАЕТ") : t("ПАУЗА")}
                    </span>
                  </div>
                  <span className="text-xs text-fg-2">
                    {t("Подключено: {n}", { n: state?.linked ?? "—" })}
                  </span>
                  <button
                    type="button"
                    className={
                      enabled ? buttonClass.danger : buttonClass.primary
                    }
                    disabled={!state}
                    onClick={() =>
                      act(
                        () =>
                          adminRequest(
                            `/api/admin/integrations/providers/${id}`,
                            { method: "PUT", json: { enabled: !enabled } },
                          ),
                        enabled
                          ? t("{name} приостановлен", { name: t(name) })
                          : t("{name} снова работает", { name: t(name) }),
                        enabled
                          ? t(
                              "Поставить {name} на паузу для всех пользователей? Токены сохранятся.",
                              { name: t(name) },
                            )
                          : undefined,
                      )
                    }
                  >
                    {enabled ? t("Поставить на паузу") : t("Возобновить")}
                  </button>
                </div>
              );
            },
          )}
        </div>
      </div>

      <div className={panelClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PanelTitle icon={<PlugZap aria-hidden="true" />}>
            {t("Подключённые сервисы")}
            {data && (
              <span className="font-mono text-xs font-normal text-fg-3">
                {data.total}
              </span>
            )}
          </PanelTitle>
          <button
            type="button"
            onClick={reload}
            className={buttonClass.secondary}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {t("Обновить")}
          </button>
        </div>
        {data && (
          <p className="text-xs text-fg-2">
            {!data.redis &&
              t("Redis недоступен: состояние соединений не видно.") + " "}
            {data.redis &&
              (heartbeatAge !== null && heartbeatAge < 60
                ? t("Воркер держит соединения с Яндексом, отчёт {n} с назад.", {
                    n: Math.round(heartbeatAge),
                  })
                : t(
                    "Воркер не присылал отчёт о соединениях с Яндексом больше минуты: он выключен, YANDEX_LIVE=0 или соединения держит другой процесс.",
                  ))}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label>
            <span className={labelClass}>{t("Пользователь")}</span>
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value.trim());
                setOffset(0);
              }}
              placeholder={t("ник")}
              className={inputClass}
            />
          </label>
          <label>
            <span className={labelClass}>{t("Сервис")}</span>
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setOffset(0);
              }}
              className={inputClass}
            >
              <option value="">{t("Все")}</option>
              {Object.entries(PROVIDER_NAMES).map(([id, name]) => (
                <option key={id} value={id}>
                  {t(name)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Notice text={notice || (error ? `❌ ${error}` : "")} />
      </div>

      <ul className="space-y-2">
        {(data?.items ?? []).map((r) => (
          <Row
            key={r.username}
            r={r}
            now={data?.now_ms ?? 0}
            onOpenUser={onOpenUser}
            act={act}
          />
        ))}
        {!loading && data?.items.length === 0 && (
          <li className="py-6 text-center text-xs text-fg-2">
            {t("Никто не подключил сервисы")}
          </li>
        )}
      </ul>
      <Pager
        total={data?.total ?? 0}
        limit={LIMIT}
        offset={offset}
        onChange={setOffset}
      />
    </div>
  );
}
