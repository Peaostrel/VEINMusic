"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/app/lib/api";
import type { LastfmImportJob } from "@/app/lib/types";

const POLL_MS = 3000;

/**
 * Shows the state of the latest Last.fm import and polls while it runs.
 * `refreshKey` changes when a new import is started, restarting the polling.
 */
export default function LastfmImportStatus({
  refreshKey,
}: Readonly<{ refreshKey: number }>) {
  const [job, setJob] = useState<LastfmImportJob | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      try {
        const next = await apiJson<LastfmImportJob>(
          "/api/import/lastfm/status",
        );
        if (cancelled) return;
        setJob(next);
        if (next.status === "pending" || next.status === "in_progress") {
          timer = setTimeout(load, POLL_MS);
        }
      } catch {
        // not signed in or backend unavailable: just hide the status
      }
    };
    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [refreshKey]);

  if (!job || job.status === "none") return null;

  const running = job.status === "pending" || job.status === "in_progress";
  const progress = job.progress ?? 0;

  return (
    <div className="mt-2 text-xs space-y-1.5" aria-live="polite">
      {running && (
        <>
          <div className="flex justify-between text-gray-300">
            <span>
              Импорт {job.incremental ? "новых прослушиваний" : "истории"}…
            </span>
            <span>
              {job.total_pages
                ? `стр. ${job.current_page}/${job.total_pages}`
                : "подготовка"}
            </span>
          </div>
          <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#D51007] transition-all"
              style={{ width: `${Math.max(progress, 3)}%` }}
            />
          </div>
          <p className="text-gray-500">
            Добавлено треков: {job.imported_tracks ?? 0}
          </p>
        </>
      )}
      {job.status === "completed" && (
        <p className="text-green-400">
          ✅ Последний импорт завершён: добавлено {job.imported_tracks ?? 0}{" "}
          треков. Повторный импорт добавит только новые прослушивания.
        </p>
      )}
      {job.status === "failed" && (
        <p className="text-red-400">
          ❌ Импорт прервался
          {job.error ? `: ${job.error}` : ""}. Нажмите «Импорт», чтобы
          продолжить с того же места.
        </p>
      )}
    </div>
  );
}
