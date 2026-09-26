"use client";

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
  cloud_poll: "Опрос Spotify / Яндекс (каждые 30 с)",
  cleanup_uploads: "Очистка загрузок (ежедневно)",
};

const JOB_STATUS: Record<string, string> = {
  pending: "в очереди",
  in_progress: "идёт",
  completed: "готово",
  failed: "ошибка",
};

function Stat({
  label,
  value,
  warn,
}: Readonly<{ label: string; value: React.ReactNode; warn?: boolean }>) {
  return (
    <div className="bg-black/30 border border-white/5 rounded-xl p-3">
      <div className="text-[10px] font-mono text-gray-400 uppercase">
        {label}
      </div>
      <div
        className={`text-sm font-bold mt-1 ${warn ? "text-amber-400" : "text-white"}`}
      >
        {value}
      </div>
    </div>
  );
}

function StatusPanel() {
  const { data, error, loading, reload } = useAdminResource<SystemStatus>(
    "/api/admin/system/status",
  );
  // The worker makes a dump every 24 h: older than that means it stalled
  const backupStale = (data?.backups.latest?.age_hours ?? 0) > 26;
  return (
    <section className={panelClass} aria-labelledby="status-heading">
      <div className="flex items-center justify-between">
        <PanelTitle
          icon={<Cpu className="w-4 h-4 text-red-500" aria-hidden="true" />}
        >
          <span id="status-heading">Состояние системы</span>
        </PanelTitle>
        <button
          type="button"
          onClick={reload}
          disabled={loading}
          className={buttonClass.secondary}
        >
          <RefreshCw className="w-3.5 h-3.5 inline mr-1" aria-hidden="true" />
          Обновить
        </button>
      </div>
      {error && <p className="text-red-400 text-xs font-bold">{error}</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat
              label="Redis / воркер"
              value={data.worker.redis ? "доступен" : "недоступен"}
              warn={!data.worker.redis}
            />
            <Stat
              label="Задач в очереди"
              value={data.worker.queued_jobs ?? "—"}
              warn={(data.worker.queued_jobs ?? 0) > 100}
            />
            <Stat
              label="База данных"
              value={
                data.database.bytes
                  ? `${data.database.dialect}, ${formatBytes(data.database.bytes)}`
                  : data.database.dialect
              }
            />
            <Stat
              label="Загрузки"
              value={
                data.uploads.available
                  ? `${data.uploads.files} файлов, ${formatBytes(data.uploads.bytes)}`
                  : "нет каталога"
              }
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-1">
              <div className="text-[10px] font-mono text-gray-400 uppercase">
                Последние запуски cron
              </div>
              {Object.entries(data.worker.cron).map(([job, at]) => (
                <div key={job} className="flex justify-between gap-3 text-xs">
                  <span className="text-gray-300">
                    {CRON_LABELS[job] ?? job}
                  </span>
                  <span
                    className={`font-mono ${at ? "text-white" : "text-amber-400"}`}
                  >
                    {at ? formatDateTime(at) : "не запускался"}
                  </span>
                </div>
              ))}
            </div>
            <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-1 text-xs">
              <div className="text-[10px] font-mono text-gray-400 uppercase flex items-center gap-1">
                <HardDrive className="w-3 h-3" aria-hidden="true" /> Бэкапы БД
              </div>
              {!data.backups.available && (
                <p className="text-amber-400">
                  Каталог бэкапов не подключён к API (BACKUP_DIR).
                </p>
              )}
              {data.backups.available && !data.backups.latest && (
                <p className="text-amber-400">Бэкапов пока нет.</p>
              )}
              {data.backups.latest && (
                <>
                  <p
                    className={backupStale ? "text-amber-400" : "text-gray-300"}
                  >
                    Последний:{" "}
                    <span className="font-mono">
                      {data.backups.latest.name}
                    </span>
                    , {formatDateTime(data.backups.latest.created_at)},{" "}
                    {formatBytes(data.backups.latest.bytes)}
                  </p>
                  <p className="text-gray-400">
                    Всего копий: {data.backups.count},{" "}
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
        `Импорт #${job.id} поставлен в очередь`,
      )
    )
      reload();
  };
  return (
    <section className={panelClass} aria-labelledby="imports-heading">
      <PanelTitle
        icon={<Download className="w-4 h-4 text-red-500" aria-hidden="true" />}
      >
        <span id="imports-heading">Импорт из Last.fm</span>
      </PanelTitle>
      <Notice text={notice} />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-gray-300">
          <thead className="text-gray-400 font-mono uppercase text-[11px]">
            <tr>
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">Last.fm</th>
              <th className="py-2 pr-3">Статус</th>
              <th className="py-2 pr-3">Прогресс</th>
              <th className="py-2 pr-3">Ошибка</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(data?.jobs ?? []).map((j) => (
              <tr key={j.id}>
                <td className="py-2 pr-3 font-mono">{j.id}</td>
                <td className="py-2 pr-3">{j.lastfm_username}</td>
                <td
                  className={`py-2 pr-3 font-bold ${j.status === "failed" ? "text-red-400" : "text-gray-200"}`}
                >
                  {JOB_STATUS[j.status] ?? j.status}
                </td>
                <td className="py-2 pr-3 font-mono">
                  {j.imported_tracks}/{j.total_tracks || "?"}
                </td>
                <td
                  className="py-2 pr-3 text-red-300 max-w-xs truncate"
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
                      Повторить
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {data?.jobs.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-gray-400">
                  Импортов не было
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
  const { data, reload } = useAdminResource<{ rooms: TogetherRoom[] }>(
    "/api/admin/together/rooms",
  );
  return (
    <section className={panelClass} aria-labelledby="rooms-heading">
      <div className="flex items-center justify-between">
        <PanelTitle
          icon={<Radio className="w-4 h-4 text-red-500" aria-hidden="true" />}
        >
          <span id="rooms-heading">Комнаты «Слушать вместе»</span>
        </PanelTitle>
        <button
          type="button"
          onClick={reload}
          className={buttonClass.secondary}
        >
          Обновить
        </button>
      </div>
      {data?.rooms.length === 0 && (
        <p className="text-xs text-gray-400">Активных комнат нет</p>
      )}
      <ul className="space-y-2">
        {(data?.rooms ?? []).map((r) => (
          <li
            key={r.room_id}
            className="bg-black/30 border border-white/5 rounded-xl p-3 text-xs"
          >
            <div className="flex justify-between gap-3">
              <span className="font-bold text-white">{r.name}</span>
              <span className="font-mono text-gray-400">{r.room_id}</span>
            </div>
            <div className="text-gray-400 mt-1">
              DJ @{r.host_username} · слушателей: {r.listeners_count}
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
      <StatusPanel />
      <ImportJobsPanel />
      <RoomsPanel />
    </div>
  );
}
