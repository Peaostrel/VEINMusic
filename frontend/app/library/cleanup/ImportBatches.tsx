"use client";
import { useCallback, useEffect, useState } from "react";
import { qualityRequest } from "@/app/lib/qualityApi";
import { btn } from "@/components/ui";
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
  const [batches, setBatches] = useState<Batch[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setBatches(await qualityRequest<Batch[]>("/api/me/imports"));
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Не удалось загрузить импорты",
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const undo = async (batch: Batch) => {
    if (
      !confirm(
        `Отменить импорт от ${new Date(batch.started_at).toLocaleString("ru-RU")}? Будут удалены только прослушивания этой партии.`,
      )
    )
      return;
    setBusy(true);
    try {
      const result = await qualityRequest<{ removed: number }>(
        `/api/me/imports/${batch.id}`,
        { method: "DELETE" },
      );
      setMessage(`Импорт отменён. Удалено прослушиваний: ${result.removed}.`);
      await load();
      await onChanged();
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Не удалось отменить импорт",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Партии импорта Last.fm</h2>
      <p className="text-xs text-fg-3">
        Отмена доступна для новых завершённых партий. Старые импорты без
        привязки к партии сохраняются.
      </p>
      <output aria-live="polite" className="block text-sm">
        {message}
      </output>
      {!batches.length && (
        <p className="text-sm text-fg-3">Импортов пока нет.</p>
      )}
      {batches.map((batch) => (
        <div
          key={batch.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4"
        >
          <span className="text-sm">
            {new Date(batch.started_at).toLocaleString("ru-RU")} ·{" "}
            {batch.imported_tracks} прослушиваний ·{" "}
            {(
              {
                pending: "В очереди",
                in_progress: "Выполняется",
                completed: "Завершён",
                failed: "Прерван",
                undone: "Отменён",
              } as Record<string, string>
            )[batch.status] || batch.status}
          </span>
          {batch.undoable && (
            <button
              disabled={busy}
              className={`${btn.danger} ${btn.sm}`}
              onClick={() => {
                void undo(batch);
              }}
            >
              Отменить эту партию
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
