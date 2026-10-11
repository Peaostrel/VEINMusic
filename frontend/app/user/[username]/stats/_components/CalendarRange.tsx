"use client";

import { useEffect, useState } from "react";
import { apiJson } from "@/app/lib/api";
import { btn, input } from "@/components/ui";

interface Range {
  scrobbles: number;
  minutes: number;
  artists: { artist: string; plays: number }[];
  history: {
    id: number;
    played_at: string;
    source: string;
    track: { title: string; artist: string };
  }[];
  next: number | null;
}

export default function CalendarRange({
  username,
  date,
}: Readonly<{ username: string; date: string }>) {
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const [data, setData] = useState<Range | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const path = `/api/stats/calendar/${encodeURIComponent(username)}/range?date_from=${from}&date_to=${to}`;
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    setData(null);
    if (!from || !to) {
      setBusy(false);
      return () => controller.abort();
    }
    void apiJson<Range>(path, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Не удалось загрузить историю",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [path, from, to]);
  const more = async () => {
    if (!data?.next) return;
    setBusy(true);
    try {
      const result = await apiJson<Range>(`${path}&before=${data.next}`);
      setData({ ...result, history: [...data.history, ...result.history] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка загрузки");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="space-y-4 rounded-lg border border-line p-4"
      aria-labelledby="calendar-range-title"
    >
      <h3 id="calendar-range-title" className="font-semibold">
        История выбранного периода
      </h3>
      <p className="text-xs text-fg-3">
        Выберите один день или период до 366 дней. Даты учитывают часовой пояс
        владельца профиля.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span>Начало периода</span>
          <input
            type="date"
            min="2000-01-01"
            value={from}
            className={input}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="text-sm">
          <span>Конец периода</span>
          <input
            type="date"
            min={from}
            value={to}
            className={input}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
      </div>
      <output aria-live="polite" className="block text-sm">
        {error || (busy ? "Загружаем историю…" : "")}
      </output>
      {data && (
        <>
          <p className="text-sm">
            {data.scrobbles} прослушиваний · {data.minutes} минут
          </p>
          <h4 className="text-sm font-medium">Топ исполнителей</h4>
          <ul className="flex flex-wrap gap-3 text-sm text-fg-2">
            {data.artists.map((artist) => (
              <li key={artist.artist}>
                {artist.artist} · {artist.plays}
              </li>
            ))}
          </ul>
          <ol className="space-y-2">
            {data.history.map((row) => (
              <li
                key={row.id}
                className="break-words rounded-lg bg-bg p-3 text-sm"
              >
                {row.track.artist} — {row.track.title}
                <span className="block text-xs text-fg-3">
                  {new Date(row.played_at).toLocaleString("ru-RU")} ·{" "}
                  {row.source}
                </span>
              </li>
            ))}
          </ol>
          {!data.history.length && (
            <p className="text-sm text-fg-3">
              В выбранном периоде нет засчитанных прослушиваний.
            </p>
          )}
          {data.next && (
            <button
              className={`${btn.secondary} ${btn.md}`}
              disabled={busy}
              onClick={() => {
                void more();
              }}
            >
              Показать ещё
            </button>
          )}
        </>
      )}
    </section>
  );
}
