"use client";
import { useCallback, useEffect, useState } from "react";
import { Merge } from "lucide-react";
import { btn, EmptyState, Loading, PageHeader } from "@/components/ui";
import { jsonRequest, qualityRequest } from "@/app/lib/qualityApi";
import ImportBatches from "./ImportBatches";
import HistoryManager from "./HistoryManager";
interface Track {
  id: number;
  title: string;
  artist: string;
  album?: string | null;
  cover_url?: string | null;
  plays: number;
}
export default function CleanupPage() {
  const [duplicates, setDuplicates] = useState<Track[][]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const load = useCallback(async () => {
    const data = await qualityRequest<{ groups: Track[][] }>(
      "/api/me/scrobbles/duplicates",
    );
    setDuplicates(data.groups);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load().catch(() => {
      setLoading(false);
      setStatus("Не удалось загрузить дубли");
    });
  }, [load]);
  const merge = async (source: Track, target: Track) => {
    if (
      !confirm(
        `Объединить «${source.title}» с «${target.title}»? Это изменение нельзя отменить.`,
      )
    )
      return;
    try {
      await qualityRequest(
        "/api/me/scrobbles/merge",
        jsonRequest("POST", {
          source_track_id: source.id,
          target_track_id: target.id,
        }),
      );
      setStatus("Треки объединены.");
      await load();
    } catch (cause) {
      setStatus(
        cause instanceof Error ? cause.message : "Не удалось объединить",
      );
    }
  };
  if (loading) return <Loading label="Ищем дубли…" />;
  return (
    <main className="mx-auto max-w-[980px] space-y-8 px-4 py-8 sm:px-8">
      <PageHeader
        title="Порядок в истории"
        subtitle="Изменения затрагивают только вашу историю"
      />
      <output aria-live="polite">{status}</output>
      <ImportBatches onChanged={load} />
      <HistoryManager />
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Возможные дубли в каталоге</h2>
        {!duplicates.length && <EmptyState title="Дублей не найдено" />}
        {duplicates.map((group) => (
          <DuplicateGroup
            key={group.map((track) => track.id).join("-")}
            tracks={group}
            onMerge={merge}
          />
        ))}
      </section>
    </main>
  );
}

function DuplicateGroup({
  tracks,
  onMerge,
}: Readonly<{
  tracks: Track[];
  onMerge: (source: Track, target: Track) => void;
}>) {
  const [targetId, setTargetId] = useState(tracks[0].id);
  const target = tracks.find((track) => track.id === targetId) ?? tracks[0];
  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <p className="mb-3 text-xs text-fg-3">Какой вариант оставить основным?</p>
      <div className="flex flex-col gap-2">
        {tracks.map((track) => (
          <label
            key={track.id}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${targetId === track.id ? "border-accent bg-accent/5" : "border-line-soft"}`}
          >
            <input
              type="radio"
              name={`target-${tracks[0].id}`}
              checked={targetId === track.id}
              onChange={() => setTargetId(track.id)}
            />
            {track.cover_url ? (
              <img
                src={track.cover_url}
                alt=""
                className="h-10 w-10 rounded object-cover"
              />
            ) : (
              <span className="h-10 w-10 rounded bg-surface-2" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {track.title}
              </span>
              <span className="block truncate text-xs text-fg-3">
                {track.artist} · {track.plays} прослушиваний
              </span>
            </span>
            {targetId !== track.id && (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  onMerge(track, target);
                }}
                className={`${btn.secondary} ${btn.sm}`}
              >
                <Merge className="h-3.5 w-3.5" />
                Объединить
              </button>
            )}
          </label>
        ))}
      </div>
    </article>
  );
}
