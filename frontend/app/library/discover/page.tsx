"use client";

import Link from "next/link";
import SaveForLater from "@/components/SaveForLater";
import { useCallback, useEffect, useState } from "react";
import { jsonRequest, qualityRequest } from "@/app/lib/qualityApi";
import { btn, EmptyState, input, Loading, PageHeader } from "@/components/ui";

interface Track {
  id: number;
  title: string;
  artist: string;
  reason: string;
}
interface Evolution {
  new: Artist[];
  returning: Artist[];
  faded: Artist[];
  genres: { genre: string; plays: number; previous_plays: number }[];
}
interface Artist {
  artist: string;
  plays: number;
  previous_plays: number;
}
interface Story {
  story: string;
  plays: number;
  minutes: number;
  new_artists_count: number;
  top_artist: string | null;
  discovery: string | null;
}
interface Mix {
  common_artists: string[];
  tracks: Track[];
}

function downloadStory(story: Story) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Браузер не поддерживает создание карточки");
  ctx.fillStyle = "#11121a";
  ctx.fillRect(0, 0, 1080, 1080);
  ctx.fillStyle = "#bda3ff";
  ctx.font = "bold 40px sans-serif";
  ctx.fillText("VEIN · МОЯ МУЗЫКАЛЬНАЯ НЕДЕЛЯ", 70, 110);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 110px sans-serif";
  ctx.fillText(`${story.minutes} мин`, 70, 290);
  ctx.font = "32px sans-serif";
  ctx.fillText(
    `${story.plays} прослушиваний · ${story.new_artists_count} новых исполнителей`,
    70,
    370,
  );
  ctx.font = "38px sans-serif";
  const words = story.story.split(" ");
  let line = "";
  let y = 500;
  for (const word of words) {
    if (ctx.measureText(`${line} ${word}`).width > 940) {
      ctx.fillText(line, 70, y, 940);
      line = word;
      y += 55;
      if (y > 940) break;
    } else line = line ? `${line} ${word}` : word;
  }
  if (y <= 940) ctx.fillText(line, 70, y, 940);
  const link = document.createElement("a");
  link.download = "vein-week.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

export default function DiscoverPage() {
  const [novelty, setNovelty] = useState(50);
  const [recommendationHistory, setRecommendationHistory] = useState<Track[]>(
    [],
  );
  const [tracks, setTracks] = useState<Track[]>([]);
  const [evolution, setEvolution] = useState<Evolution | null>(null);
  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [username, setUsername] = useState("");
  const [mix, setMix] = useState<Mix | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastFeedback, setLastFeedback] = useState<number | null>(null);
  const loadRecommendations = useCallback(
    async (avoidRecent = false) => {
      const result = await qualityRequest<{ recommendations: Track[] }>(
        `/api/recommendations/me?novelty=${novelty}&avoid_recent=${avoidRecent}`,
      );
      setTracks(result.recommendations);
      if (result.recommendations.length)
        await qualityRequest(
          "/api/me/recommendations/impressions",
          jsonRequest("POST", {
            ids: result.recommendations.map((track) => track.id),
          }),
        );
    },
    [novelty],
  );
  useEffect(() => {
    let active = true;
    Promise.all([
      qualityRequest<{ recommendations: Track[] }>("/api/recommendations/me"),
      qualityRequest<Evolution>("/api/me/taste-evolution"),
      qualityRequest<Story>("/api/me/weekly-story"),
    ])
      .then(([recs, tastes, recap]) => {
        if (active) {
          setTracks(recs.recommendations);
          if (recs.recommendations.length)
            void qualityRequest(
              "/api/me/recommendations/impressions",
              jsonRequest("POST", {
                ids: recs.recommendations.map((track) => track.id),
              }),
            ).catch(() => undefined);
          setEvolution(tastes);
          setStory(recap);
        }
      })
      .catch((cause) => {
        if (active)
          setMessage(
            cause instanceof Error
              ? cause.message
              : "Не удалось загрузить данные",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const feedback = async (id: number, value: string) => {
    setBusy(true);
    try {
      await qualityRequest(
        `/api/me/recommendations/${id}/feedback`,
        jsonRequest("POST", { value }),
      );
      setLastFeedback(value === "reset" ? null : id);
      await loadRecommendations();
      setMessage(
        value === "reset" ? "Выбор отменён." : "Учли ваш выбор в подборке.",
      );
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Не удалось сохранить выбор",
      );
    } finally {
      setBusy(false);
    }
  };
  const makeMix = async () => {
    setBusy(true);
    setMix(null);
    try {
      setMix(
        await qualityRequest<Mix>(
          `/api/me/shared-mix/${encodeURIComponent(username.trim().replace(/^@/, ""))}`,
        ),
      );
      setMessage("");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Не удалось создать подборку",
      );
    } finally {
      setBusy(false);
    }
  };
  if (loading) return <Loading label="Собираем музыкальные открытия…" />;
  return (
    <main className="mx-auto max-w-[980px] space-y-9 px-4 py-8 sm:px-8">
      <PageHeader
        title="Открытия и ваш вкус"
        subtitle="Рекомендации, изменения вкуса и музыка для двоих"
      />
      <Link href="/library" className="text-sm text-fg-2">
        ← Библиотека
      </Link>
      <output aria-live="polite" className="block text-sm">
        {message}
      </output>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Что послушать дальше</h2>
        <Link href="/library/later" className="text-sm text-accent">
          Мой список «Послушать позже» →
        </Link>
        <label className="block text-sm">
          Разнообразие: {novelty}%
          <input
            aria-label="Разнообразие рекомендаций"
            type="range"
            min="0"
            max="100"
            step="10"
            value={novelty}
            onChange={(event) => setNovelty(Number(event.target.value))}
            className="block w-full"
          />
          <span className="text-xs text-fg-3">
            0 — ближе к любимым исполнителям; 100 — больше новых. Не больше двух
            треков одного артиста.
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            className={btn.secondary}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void loadRecommendations()
                .catch((cause: unknown) =>
                  setMessage(
                    cause instanceof Error ? cause.message : "Ошибка подборки",
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            Применить разнообразие
          </button>
          <button
            className={btn.secondary}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void loadRecommendations(true)
                .catch((cause: unknown) =>
                  setMessage(
                    cause instanceof Error ? cause.message : "Ошибка подборки",
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            Новая подборка
          </button>
          <button
            className={btn.secondary}
            onClick={() => {
              void qualityRequest<{ items: { track: Track }[] }>(
                "/api/me/recommendations/history",
              )
                .then((data) =>
                  setRecommendationHistory(
                    data.items.map((item) => item.track),
                  ),
                )
                .catch((cause: unknown) =>
                  setMessage(
                    cause instanceof Error ? cause.message : "Ошибка истории",
                  ),
                );
            }}
          >
            История рекомендаций
          </button>
        </div>
        {!!recommendationHistory.length && (
          <ul className="text-sm">
            {recommendationHistory.map((track) => (
              <li key={track.id}>
                {track.artist} — {track.title}
              </li>
            ))}
          </ul>
        )}
        {lastFeedback !== null && (
          <button
            type="button"
            disabled={busy}
            className={`${btn.secondary} ${btn.sm}`}
            onClick={() => {
              void feedback(lastFeedback, "reset");
            }}
          >
            Отменить последний выбор
          </button>
        )}
        {!tracks.length && (
          <EmptyState title="Пока нет новых рекомендаций">
            Продолжайте слушать музыку, чтобы появилась подборка.
          </EmptyState>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {tracks.map((track) => (
            <article
              key={track.id}
              className="space-y-3 rounded-xl border border-line bg-surface p-4"
            >
              <Link href={`/track/${track.id}`} className="font-medium">
                {track.artist} — {track.title}
              </Link>
              <p className="text-xs text-fg-3">{track.reason}</p>
              <SaveForLater trackId={track.id} />
              <div className="flex flex-wrap gap-2">
                {[
                  ["known", "Уже знаю"],
                  ["dislike", "Не нравится"],
                  ["like", "Больше такого"],
                ].map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    disabled={busy}
                    className={`${btn.secondary} ${btn.sm}`}
                    onClick={() => {
                      void feedback(track.id, value);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Как меняется вкус · 30 дней</h2>
        <p className="text-xs text-fg-3">
          Сравниваем последние 30 дней с предыдущими 30. Возвращения —
          исполнители из более ранней истории.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["Новые", evolution?.new],
              ["Вернулись", evolution?.returning],
              ["Стали звучать реже", evolution?.faded],
            ] as const
          ).map(([label, artists]) => (
            <div
              key={label}
              className="rounded-xl border border-line bg-surface p-4"
            >
              <h3 className="mb-3 font-medium">{label}</h3>
              {artists?.length ? (
                <ul className="space-y-2 text-sm">
                  {artists.map((artist) => (
                    <li key={artist.artist}>
                      {artist.artist}
                      <span className="block text-xs text-fg-3">
                        {artist.previous_plays} → {artist.plays} прослушиваний
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-fg-3">Пока нет изменений</p>
              )}
            </div>
          ))}
        </div>
        {!!evolution?.genres.length && (
          <p className="text-sm text-fg-2">
            Жанры:{" "}
            {evolution.genres
              .map(
                (genre) =>
                  `${genre.genre}: ${genre.previous_plays} → ${genre.plays}`,
              )
              .join(" · ")}
          </p>
        )}
      </section>
      {story && (
        <section className="space-y-4 rounded-xl border border-line bg-surface p-5">
          <h2 className="text-lg font-semibold">Ваша музыкальная неделя</h2>
          <p className="leading-relaxed text-fg-2">{story.story}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`${btn.primary} ${btn.sm}`}
              onClick={() => {
                try {
                  downloadStory(story);
                } catch (cause) {
                  setMessage(
                    cause instanceof Error
                      ? cause.message
                      : "Не удалось создать карточку",
                  );
                }
              }}
            >
              Скачать карточку PNG
            </button>
            <button
              type="button"
              className={`${btn.secondary} ${btn.sm}`}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(story.story);
                  setMessage("Итоги скопированы.");
                } catch {
                  setMessage(
                    "Не удалось скопировать. Можно выделить текст итогов.",
                  );
                }
              }}
            >
              Скопировать итоги
            </button>
          </div>
          <p className="text-xs text-fg-3">
            Карточка скачивается на ваше устройство. Вы сами выбираете, с кем
            поделиться.
          </p>
        </section>
      )}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Музыка для двоих</h2>
        <p className="text-sm text-fg-2">
          Подборка по общим исполнителям. Доступ зависит от настроек истории и
          статистики второго участника.
        </p>
        <form
          className="flex flex-wrap gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            await makeMix();
          }}
        >
          <input
            required
            aria-label="Имя второго участника"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="@имя пользователя"
            className={input}
          />
          <button
            type="submit"
            disabled={busy}
            className={`${btn.primary} ${btn.sm}`}
          >
            Собрать подборку
          </button>
        </form>
        {mix && (
          <div className="space-y-3">
            {!mix.tracks.length && (
              <EmptyState title="Общих исполнителей пока нет">
                Попробуйте другого участника или послушайте больше музыки.
              </EmptyState>
            )}
            {mix.tracks.map((track) => (
              <p key={track.id}>
                <Link
                  className="text-sm font-medium"
                  href={`/track/${track.id}`}
                >
                  {track.artist} — {track.title}
                </Link>
                <span className="block text-xs text-fg-3">{track.reason}</span>
              </p>
            ))}
            <Link className={`${btn.secondary} ${btn.sm}`} href="/together">
              Открыть Together
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
