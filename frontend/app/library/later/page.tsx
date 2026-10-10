"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { jsonRequest, qualityRequest } from "@/app/lib/qualityApi";
import { btn, PageHeader } from "@/components/ui";
interface Saved {
  id: number;
  note: string;
  heard: boolean;
  feedback: string | null;
  track: {
    id: number;
    title: string;
    artist: string;
    track_url: string | null;
  };
}
export default function ListenLaterPage() {
  const [items, setItems] = useState<Saved[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (before?: number) => {
    const data = await qualityRequest<{
      items: Saved[];
      next_cursor: number | null;
    }>("/api/me/listen-later" + (before ? "?before=" + before : ""));
    setItems(data.items);
    setCursor(data.next_cursor);
  }, []);
  useEffect(() => {
    void load().catch((cause: unknown) =>
      setMessage(cause instanceof Error ? cause.message : "Ошибка загрузки"),
    );
  }, [load]);
  const change = async (
    item: Saved,
    action: "note" | "remove" | "like" | "dislike",
  ) => {
    const note =
      action === "note" ? prompt("Заметка о треке", item.note) : null;
    if (action === "note" && note === null) return;
    setBusy(true);
    try {
      if (action === "note")
        await qualityRequest(
          `/api/me/listen-later/${item.track.id}`,
          jsonRequest("PUT", { note }),
        );
      else if (action === "remove")
        await qualityRequest(`/api/me/listen-later/${item.track.id}`, {
          method: "DELETE",
        });
      else
        await qualityRequest(
          `/api/me/recommendations/${item.track.id}/feedback`,
          jsonRequest("POST", { value: action }),
        );
      await load();
      setMessage("Сохранено.");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Не удалось сохранить",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto max-w-[900px] space-y-5 px-4 py-8">
      <PageHeader
        title="Послушать позже"
        subtitle="Личный список музыки и заметок"
      />
      <Link href="/library">← Библиотека</Link>
      <output aria-live="polite" className="block text-sm">
        {message}
      </output>
      {!items.length && (
        <p>Сохраните музыку из рекомендаций или карточки трека.</p>
      )}
      {items.map((item) => (
        <article
          key={item.id}
          className="space-y-3 rounded-xl border border-line bg-surface p-4"
        >
          <Link href={`/track/${item.track.id}`} className="font-semibold">
            {item.track.artist} — {item.track.title}
          </Link>
          <p className="text-sm text-fg-3">{item.note}</p>
          {item.heard && (
            <p className="text-sm">
              Уже прослушано после сохранения
              {item.feedback ? " · впечатление сохранено" : " · как вам трек?"}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {item.track.track_url &&
              /^https?:\/\//.test(item.track.track_url) && (
                <a
                  href={item.track.track_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={btn.secondary}
                >
                  Открыть в сервисе
                </a>
              )}
            <button
              disabled={busy}
              className={btn.secondary}
              onClick={() => {
                void change(item, "note");
              }}
            >
              Заметка
            </button>
            {item.heard && (
              <>
                <button
                  disabled={busy}
                  className={btn.secondary}
                  onClick={() => {
                    void change(item, "like");
                  }}
                >
                  Понравилось
                </button>
                <button
                  disabled={busy}
                  className={btn.secondary}
                  onClick={() => {
                    void change(item, "dislike");
                  }}
                >
                  Не понравилось
                </button>
              </>
            )}
            <button
              disabled={busy}
              className={btn.secondary}
              onClick={() => {
                void change(item, "remove");
              }}
            >
              Убрать из списка
            </button>
          </div>
        </article>
      ))}
      {cursor && (
        <button
          className={btn.secondary}
          onClick={() => {
            void load(cursor).catch((cause: unknown) =>
              setMessage(
                cause instanceof Error ? cause.message : "Ошибка загрузки",
              ),
            );
          }}
        >
          Следующие
        </button>
      )}
    </main>
  );
}
