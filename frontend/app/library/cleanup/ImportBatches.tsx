"use client";
import { useCallback, useEffect, useState } from "react";
import { qualityRequest } from "@/app/lib/qualityApi";
import { btn } from "@/components/ui";
import { useT } from "@/app/lib/i18n/client";
import { tr } from "@/app/lib/i18n/active";
import { msg } from "@/app/lib/i18n/core";
import { plural } from "@/app/lib/plural";

const STATUS: Record<string, string> = {
  pending: msg("В очереди"),
  in_progress: msg("Выполняется"),
  completed: msg("Завершён"),
  failed: msg("Прерван"),
  undone: msg("Отменён"),
};
interface Batch {
  id: number;
  status: string;
  started_at: string;
  imported_tracks: number;
  undoable: boolean;
}
export default function ImportBatches({
  onChanged,
}: Readonly<{ onChanged: () => Promise<void> }>) {
  const t = useT();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setBatches(await qualityRequest<Batch[]>("/api/me/imports"));
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : tr("Не удалось загрузить импорты"),
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const undo = async (batch: Batch) => {
    if (
      !confirm(
        t(
          "Отменить импорт от {date}? Будут удалены только прослушивания этой партии.",
          { date: new Date(batch.started_at).toLocaleString(t.locale) },
        ),
      )
    )
      return;
    setBusy(true);
    try {
      const result = await qualityRequest<{ removed: number }>(
        `/api/me/imports/${batch.id}`,
        { method: "DELETE" },
      );
      setMessage(
        t("Импорт отменён. Удалено прослушиваний: {n}.", { n: result.removed }),
      );
      await load();
      await onChanged();
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : t("Не удалось отменить импорт"),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">{t("Партии импорта Last.fm")}</h2>
      <p className="text-xs text-fg-3">
        {t(
          "Отмена доступна для новых завершённых партий. Старые импорты без привязки к партии сохраняются.",
        )}
      </p>
      <output aria-live="polite" className="block text-sm">
        {message}
      </output>
      {!batches.length && (
        <p className="text-sm text-fg-3">{t("Импортов пока нет.")}</p>
      )}
      {batches.map((batch) => (
        <div
          key={batch.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4"
        >
          <span className="text-sm">
            {new Date(batch.started_at).toLocaleString(t.locale)} ·{" "}
            {batch.imported_tracks}{" "}
            {plural(
              batch.imported_tracks,
              "прослушивание",
              "прослушивания",
              "прослушиваний",
            )}{" "}
            · {STATUS[batch.status] ? t(STATUS[batch.status]) : batch.status}
          </span>
          {batch.undoable && (
            <button
              disabled={busy}
              className={`${btn.danger} ${btn.sm}`}
              onClick={() => {
                void undo(batch);
              }}
            >
              {t("Отменить эту партию")}
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
