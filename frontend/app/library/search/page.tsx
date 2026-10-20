"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiJson } from "@/app/lib/api";
import { btn, input, PageHeader } from "@/components/ui";
import { useT } from "@/app/lib/i18n/client";
import { tr } from "@/app/lib/i18n/active";
import { plural } from "@/app/lib/plural";

interface Track {
  id: number;
  artist: string;
  title: string;
  album: string | null;
  plays: number;
}
interface Result {
  tracks: Track[];
  artists: { artist: string; plays: number }[];
  albums: { artist: string; album: string; plays: number }[];
  saved: { track: Track; note: string }[];
  history: {
    id: number;
    played_at: string;
    source: string;
    excluded: boolean;
    track: Track;
  }[];
  sources: string[];
  next: number | null;
}

export default function LibrarySearch() {
  const t = useT();
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setQ(
      new URLSearchParams(window.location.search).get("q")?.slice(0, 100) ?? "",
    );
  }, []);
  const params = new URLSearchParams({
    q,
    source,
    ...(from ? { date_from: from } : {}),
    ...(to ? { date_to: to } : {}),
  }).toString();
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setBusy(true);
      setError("");
      void apiJson<Result>(`/api/me/library/search?${params}`, {
        signal: controller.signal,
      })
        .then((result) => {
          if (!controller.signal.aborted) setData(result);
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) {
            setData(null);
            setError(
              cause instanceof Error ? cause.message : tr("Ошибка поиска"),
            );
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [params]);
  const more = async () => {
    if (!data?.next) return;
    setBusy(true);
    try {
      const result = await apiJson<Result>(
        `/api/me/library/search?${params}&before=${data.next}`,
      );
      setData({ ...result, history: [...data.history, ...result.history] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Ошибка поиска"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto max-w-[1000px] space-y-6 px-4 py-8 sm:px-8">
      <PageHeader
        title={t("Поиск в моей музыке")}
        subtitle={t("Личная история, исполнители, альбомы и музыка на потом")}
      />
      <Link href="/library" className="text-sm text-accent">
        {t("← Библиотека")}
      </Link>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="sm:col-span-2">
          <span>{t("Трек, артист или альбом")}</span>
          <input
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            maxLength={100}
            className={input}
          />
        </label>
        <label>
          <span>{t("Источник")}</span>
          <select
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className={input}
          >
            <option value="">{t("Все источники")}</option>
            {data?.sources.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span>{t("С даты")}</span>
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className={input}
            />
          </label>
          <label>
            <span>{t("По дату")}</span>
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className={input}
            />
          </label>
        </div>
      </form>
      <p role="status" aria-live="polite">
        {error || (busy ? t("Ищем…") : "")}
      </p>
      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <section>
              <h2 className="mb-3 font-semibold">{t("Исполнители")}</h2>
              <ul>
                {data.artists.map((row) => (
                  <li key={row.artist}>
                    <button
                      type="button"
                      className="min-h-11 text-left text-accent"
                      onClick={() => setQ(row.artist)}
                    >
                      {row.artist} · {row.plays}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="mb-3 font-semibold">{t("Альбомы")}</h2>
              <ul>
                {data.albums.map((row) => (
                  <li key={`${row.artist}/${row.album}`}>
                    <button
                      type="button"
                      className="min-h-11 text-left text-accent"
                      onClick={() => setQ(row.album)}
                    >
                      {row.album} — {row.artist} · {row.plays}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <section>
            <h2 className="mb-3 font-semibold">{t("Треки")}</h2>
            <ul className="space-y-2">
              {data.tracks.map((track) => (
                <li
                  key={track.id}
                  className="break-words rounded-lg border border-line p-3"
                >
                  {track.artist} — {track.title}
                  <span className="block text-xs text-fg-3">
                    {track.album} · {track.plays}{" "}
                    {plural(
                      track.plays,
                      "прослушивание",
                      "прослушивания",
                      "прослушиваний",
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="mb-3 font-semibold">{t("Послушать позже")}</h2>
            <ul className="space-y-2">
              {data.saved.map(({ track, note }) => (
                <li key={track.id} className="break-words">
                  {track.artist} — {track.title}
                  <p className="text-xs text-fg-3">{note}</p>
                </li>
              ))}
            </ul>
            <Link href="/library/later" className="text-sm text-accent">
              {t("Открыть список →")}
            </Link>
          </section>
          <section>
            <h2 className="mb-3 font-semibold">{t("История")}</h2>
            <ul className="space-y-2">
              {data.history.map((row) => (
                <li
                  key={row.id}
                  className="break-words rounded-lg border border-line p-3"
                >
                  {row.track.artist} — {row.track.title}
                  <span className="block text-xs text-fg-3">
                    {new Date(row.played_at).toLocaleString(t.locale)} ·{" "}
                    {row.source}
                    {row.excluded ? ` · ${t("исключено из статистики")}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {!data.history.length && (
              <p className="text-sm text-fg-3">
                {t("Нет прослушиваний по этим условиям.")}
              </p>
            )}
            {data.next && (
              <button
                type="button"
                disabled={busy}
                className={`${btn.secondary} ${btn.md} mt-4`}
                onClick={() => {
                  void more();
                }}
              >
                {t("Ещё прослушивания")}
              </button>
            )}
          </section>
        </>
      )}
    </main>
  );
}
