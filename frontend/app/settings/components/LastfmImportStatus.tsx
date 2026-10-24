"use client";

import { useEffect, useRef, useState } from "react";
import { apiJson } from "@/app/lib/api";
import { useT } from "@/app/lib/i18n/client";
import { plural } from "@/app/lib/plural";
import type { LastfmImportJob } from "@/app/lib/types";

const POLL_MS = 3000;

/**
 * Shows the state of the latest Last.fm import and polls while it runs.
 * `refreshKey` changes when a new import is started, restarting the polling.
 * `onLocked` reports whether the history is already imported (one-time import).
 */
export default function LastfmImportStatus({
  refreshKey,
  onLocked,
}: Readonly<{ refreshKey: number; onLocked?: (locked: boolean) => void }>) {
  const t = useT();
  const [job, setJob] = useState<LastfmImportJob | null>(null);
  // Kept in a ref: a new callback must not restart the polling
  const onLockedRef = useRef(onLocked);
  useEffect(() => {
    onLockedRef.current = onLocked;
  });

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
        onLockedRef.current?.(Boolean(next.locked));
        if (next.status === "pending" || next.status === "in_progress") {
          timer = setTimeout(load, POLL_MS);
        }
      } catch {
        // not signed in or backend unavailable: just hide the status
      }
    };
    void load();
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
          <div className="flex justify-between text-fg-2">
            <span>{t("Импорт истории…")}</span>
            <span>
              {job.total_pages
                ? t("стр. {current}/{total}", {
                    current: job.current_page ?? 0,
                    total: job.total_pages,
                  })
                : t("подготовка")}
            </span>
          </div>
          <div className="h-1.5 w-full bg-line rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${Math.max(progress, 3)}%` }}
            />
          </div>
          <p className="text-fg-2">
            {t("Добавлено треков: {n}", { n: job.imported_tracks ?? 0 })}
          </p>
        </>
      )}
      {job.status === "completed" && (
        <p className="text-ok">
          {t("Импорт завершён: добавлено {n} {tracks}.", {
            n: job.imported_tracks ?? 0,
            tracks: plural(job.imported_tracks ?? 0, "трек", "трека", "треков"),
          })}
          {job.locked && (
            <> {t("История перенесена, повторный импорт недоступен.")}</>
          )}
        </p>
      )}
      {job.status === "undone" && !job.locked && (
        <p className="text-fg-2">
          {t("Импорт отменён, историю можно перенести заново.")}
        </p>
      )}
      {job.status === "failed" && (
        <p className="text-danger">
          {job.error
            ? t("Импорт прервался: {error}.", { error: t(job.error) })
            : t("Импорт прервался.")}{" "}
          {t("Нажмите «Импорт», чтобы продолжить с того же места.")}
        </p>
      )}
    </div>
  );
}
