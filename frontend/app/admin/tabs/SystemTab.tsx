"use client";

import { useT } from "@/app/lib/i18n/client";
import { msg } from "@/app/lib/i18n/core";
import EmailManager from "../components/EmailManager";
import { Cpu, Download, HardDrive, Radio, RefreshCw } from "lucide-react";
import type { LastfmJob, SystemStatus, TogetherRoom } from "../types";
import {
  Notice,
  PanelTitle,
  adminRequest,
  buttonClass,
  formatBytes,
  formatDateTime,
  panelClass,
  useAdminResource,
  useNotice,
} from "../ui";

const CRON_LABELS: Record<string, string> = {
  cloud_poll: msg("Опрос Spotify / Яндекс (каждые 30 с)"),
  cleanup_uploads: msg("Очистка загрузок (ежедневно)"),
};

const JOB_STATUS: Record<string, string> = {
  pending: msg("в очереди"),
  in_progress: msg("идёт"),
  completed: msg("готово"),
  failed: msg("ошибка"),
};

function Stat({
  label,
  value,
  warn,
}: Readonly<{ label: string; value: React.ReactNode; warn?: boolean }>) {
  return (
    <div className="bg-bg border border-line-soft rounded-xl p-3">
      <div className="text-[10px] font-mono text-fg-2">{label}</div>
      <div
        className={`text-sm font-medium mt-1 ${warn ? "text-accent" : "text-fg"}`}
      >
        {value}
      </div>
    </div>
  );
}

function StatusPanel() {
  const t = useT();
  const { data, error, loading, reload } = useAdminResource<SystemStatus>(
    "/api/admin/system/status",
  );
  // The worker makes a dump every 24 h: older than that means it stalled
  const backupStale = (data?.backups.latest?.age_hours ?? 0) > 26;
  return (
    <section className={panelClass} aria-labelledby="status-heading">
      <div className="flex items-center justify-between">
        <PanelTitle
          icon={<Cpu className="w-4 h-4 text-danger" aria-hidden="true" />}
        >
          <span id="status-heading">{t("Состояние системы")}</span>
        </PanelTitle>
        <button
          type="button"
          onClick={reload}
          disabled={loading}
          className={buttonClass.secondary}
        >
          <RefreshCw className="w-3.5 h-3.5 inline mr-1" aria-hidden="true" />
          {t("Обновить")}
        </button>
      </div>
      {error && <p className="text-danger text-xs font-medium">{error}</p>}
      {data && (
        <>
          {data.operations && (
            <div className="space-y-2 rounded-xl border border-line p-3 text-sm">
              <p>
                {t("Диск: {n}%", {
                  n: data.operations.disk_used_percent ?? "—",
                })}
              </p>
              <p>
                {t("Внешний бэкап:")}{" "}
                {data.operations.offsite.configured
                  ? t("последнее подтверждение {n} ч назад", {
                      n: data.operations.offsite.age_hours ?? "—",
                    })
                  : t("не подключён")}
              </p>
              <p className="text-xs text-fg-3">
                {t(data.operations.offsite.note)}
              </p>
              {data.operations.alerts.map((alert) => (
                <p key={alert.code} className="text-danger">
                  {t(alert.message)}
                </p>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat
              label={t("Redis / воркер")}
              value={data.worker.redis ? t("доступен") : t("недоступен")}
              warn={!data.worker.redis}
            />
            <Stat
              label={t("Задач в очереди")}
              value={data.worker.queued_jobs ?? "—"}
              warn={(data.worker.queued_jobs ?? 0) > 100}
            />
            <Stat
              label={t("База данных")}
              value={
                data.database.bytes
                  ? `${data.database.dialect}, ${formatBytes(data.database.bytes)}`
                  : data.database.dialect
              }
            />
            <Stat
              label={t("Загрузки")}
              value={
                data.uploads.available
                  ? t("{n} файлов, {size}", {
                      n: data.uploads.files,
                      size: formatBytes(data.uploads.bytes),
                    })
                  : t("нет каталога")
              }
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-bg border border-line-soft rounded-xl p-3 space-y-1">
              <div className="text-[10px] font-mono text-fg-2">
                {t("Последние запуски cron")}
              </div>
              {Object.entries(data.worker.cron).map(([job, at]) => (
                <div key={job} className="flex justify-between gap-3 text-xs">
                  <span className="text-fg-2">
                    {CRON_LABELS[job] ? t(CRON_LABELS[job]) : job}
                  </span>
                  <span
                    className={`font-mono ${at ? "text-fg" : "text-accent"}`}
                  >
                    {at ? formatDateTime(at) : t("не запускался")}
                  </span>
                </div>
              ))}
            </div>
            <div className="bg-bg border border-line-soft rounded-xl p-3 space-y-1 text-xs">
              <div className="text-[10px] font-mono text-fg-2 flex items-center gap-1">
                <HardDrive className="w-3 h-3" aria-hidden="true" />{" "}
                {t("Бэкапы БД")}
              </div>
              {!data.backups.available && (
                <p className="text-accent">
                  {t("Каталог бэкапов не подключён к API (BACKUP_DIR).")}
                </p>
              )}
              {data.backups.available && !data.backups.latest && (
                <p className="text-accent">{t("Бэкапов пока нет.")}</p>
              )}
              {data.backups.latest && (
                <>
                  <p className={backupStale ? "text-accent" : "text-fg-2"}>
                    {t("Последний:")}{" "}
                    <span className="font-mono">
                      {data.backups.latest.name}
                    </span>
                    , {formatDateTime(data.backups.latest.created_at)},{" "}
                    {formatBytes(data.backups.latest.bytes)}
                  </p>
                  <p className="text-fg-2">
                    {t("Всего копий: {n},", { n: data.backups.count })}{" "}
                    {formatBytes(data.backups.bytes)}
                  </p>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function ImportJobsPanel() {
  const t = useT();
  const { data, reload } = useAdminResource<{ jobs: LastfmJob[] }>(
    "/api/admin/jobs/lastfm",
  );
  const { notice, run } = useNotice();
  const retry = async (job: LastfmJob) => {
    if (
      await run(
        () =>
          adminRequest(`/api/admin/jobs/lastfm/${job.id}/retry`, {
            method: "POST",
          }),
        t("Импорт #{id} поставлен в очередь", { id: job.id }),
      )
    )
      reload();
  };
  return (
    <section className={panelClass} aria-labelledby="imports-heading">
      <PanelTitle
        icon={<Download className="w-4 h-4 text-danger" aria-hidden="true" />}
      >
        <span id="imports-heading">{t("Импорт из Last.fm")}</span>
      </PanelTitle>
      <Notice text={notice} />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-fg-2">
          <thead className="text-fg-2 font-mono text-[11px]">
            <tr>
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">Last.fm</th>
              <th className="py-2 pr-3">{t("Статус")}</th>
              <th className="py-2 pr-3">{t("Прогресс")}</th>
              <th className="py-2 pr-3">{t("Ошибка")}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(data?.jobs ?? []).map((j) => (
              <tr key={j.id}>
                <td className="py-2 pr-3 font-mono">{j.id}</td>
                <td className="py-2 pr-3">{j.lastfm_username}</td>
                <td
                  className={`py-2 pr-3 font-medium ${j.status === "failed" ? "text-danger" : "text-fg"}`}
                >
                  {JOB_STATUS[j.status] ? t(JOB_STATUS[j.status]) : j.status}
                </td>
                <td className="py-2 pr-3 font-mono">
                  {j.imported_tracks}/{j.total_tracks || "?"}
                </td>
                <td
                  className="py-2 pr-3 text-danger max-w-xs truncate"
                  title={j.error_log ?? undefined}
                >
                  {j.error_log ?? ""}
                </td>
                <td className="py-2 text-right">
                  {j.status !== "completed" && (
                    <button
                      type="button"
                      onClick={() => retry(j)}
                      className={buttonClass.secondary}
                    >
                      {t("Повторить")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {data?.jobs.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-fg-2">
                  {t("Импортов не было")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RoomsPanel() {
  const t = useT();
  const { data, reload } = useAdminResource<{ rooms: TogetherRoom[] }>(
    "/api/admin/together/rooms",
  );
  return (
    <section className={panelClass} aria-labelledby="rooms-heading">
      <div className="flex items-center justify-between">
        <PanelTitle
          icon={<Radio className="w-4 h-4 text-danger" aria-hidden="true" />}
        >
          <span id="rooms-heading">{t("Комнаты «Слушать вместе»")}</span>
        </PanelTitle>
        <button
          type="button"
          onClick={reload}
          className={buttonClass.secondary}
        >
          {t("Обновить")}
        </button>
      </div>
      {data?.rooms.length === 0 && (
        <p className="text-xs text-fg-2">{t("Активных комнат нет")}</p>
      )}
      <ul className="space-y-2">
        {(data?.rooms ?? []).map((r) => (
          <li
            key={r.room_id}
            className="bg-bg border border-line-soft rounded-xl p-3 text-xs"
          >
            <div className="flex justify-between gap-3">
              <span className="font-medium text-fg">{r.name}</span>
              <span className="font-mono text-fg-2">{r.room_id}</span>
            </div>
            <div className="text-fg-2 mt-1">
              {t("DJ @{host} · слушателей: {n}", {
                host: r.host_username,
                n: r.listeners_count,
              })}
              {r.current_track?.title &&
                ` · ${r.current_track.artist ?? ""} — ${r.current_track.title}`}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function SystemTab() {
  return (
    <div className="space-y-6">
      <EmailManager />
      <StatusPanel />
      <ImportJobsPanel />
      <RoomsPanel />
    </div>
  );
}
