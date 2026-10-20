"use client";

import { coverAt } from "@/app/lib/coverSize";
import Link from "next/link";
import { Music2 } from "lucide-react";
import { sanitizeImageUrl } from "@/app/utils/sanitizeUrl";
import SaveForLater from "@/components/SaveForLater";
import { useCallback, useEffect, useState } from "react";
import { jsonRequest, qualityRequest } from "@/app/lib/qualityApi";
import { btn, EmptyState, input, Loading, PageHeader } from "@/components/ui";
import { useT } from "@/app/lib/i18n/client";
import { tr } from "@/app/lib/i18n/active";
import { msg } from "@/app/lib/i18n/core";
import { plural } from "@/app/lib/plural";

const FEEDBACK_ACTIONS = [
  ["known", msg("Уже знаю")],
  ["like", msg("Больше такого")],
  ["block_artist", msg("Не рекомендовать артиста")],
];

interface Track {
  id: number;
  title: string;
  artist: string;
  reason: string;
  cover_url?: string | null;
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

async function recordImpressions(tracks: Track[]): Promise<void> {
  try {
    await qualityRequest(
      "/api/me/recommendations/impressions",
      jsonRequest("POST", {
        ids: tracks.map((track) => track.id),
      }),
    );
  } catch {
    // Recording impressions is best effort and must not hide recommendations.
  }
}

function downloadStory(story: Story) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(tr("Браузер не поддерживает создание карточки"));
  ctx.fillStyle = "#11121a";
  ctx.fillRect(0, 0, 1080, 1080);
  ctx.fillStyle = "#bda3ff";
  ctx.font = "bold 40px sans-serif";
  ctx.fillText(tr("VEIN · МОЯ МУЗЫКАЛЬНАЯ НЕДЕЛЯ"), 70, 110);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 110px sans-serif";
  ctx.fillText(tr("{n} мин", { n: story.minutes }), 70, 290);
  ctx.font = "32px sans-serif";
  ctx.fillText(
    `${story.plays} ${plural(story.plays, "прослушивание", "прослушивания", "прослушиваний")} · ${story.new_artists_count} ${plural(story.new_artists_count, "новый исполнитель", "новых исполнителя", "новых исполнителей")}`,
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
  const t = useT();
  const [novelty, setNovelty] = useState(50);
  const [recentInterest, setRecentInterest] = useState(50);
  const [blocked, setBlocked] = useState<
    { track_id: number; artist: string }[]
  >([]);
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
        `/api/recommendations/me?novelty=${novelty}&recent_interest=${recentInterest}&avoid_recent=${avoidRecent}`,
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
    [novelty, recentInterest],
  );
  useEffect(() => {
    let active = true;
    Promise.all([
      qualityRequest<{ recommendations: Track[] }>("/api/recommendations/me"),
      qualityRequest<Evolution>("/api/me/taste-evolution"),
      qualityRequest<Story>("/api/me/weekly-story"),
      qualityRequest<{ track_id: number; artist: string }[]>(
        "/api/me/recommendations/blocked-artists",
      ),
    ])
      .then(([recs, tastes, recap, excluded]) => {
        if (active) {
          setTracks(recs.recommendations);
          if (recs.recommendations.length)
            void recordImpressions(recs.recommendations);
          setEvolution(tastes);
          setStory(recap);
          setBlocked(excluded);
        }
      })
      .catch((cause) => {
        if (active)
          setMessage(
            cause instanceof Error
              ? cause.message
              : tr("Не удалось загрузить данные"),
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
      setBlocked(
        await qualityRequest<{ track_id: number; artist: string }[]>(
          "/api/me/recommendations/blocked-artists",
        ),
      );
      setMessage(
        value === "reset"
          ? t("Выбор отменён.")
          : t("Учли ваш выбор в подборке."),
      );
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : t("Не удалось сохранить выбор"),
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
        cause instanceof Error
          ? cause.message
          : t("Не удалось создать подборку"),
      );
    } finally {
      setBusy(false);
    }
  };
  if (loading) return <Loading label={t("Собираем музыкальные открытия…")} />;
  return (
    <main className="mx-auto max-w-[980px] space-y-9 px-4 py-8 sm:px-8">
      <PageHeader
        title={t("Открытия и ваш вкус")}
        subtitle={t("Рекомендации, изменения вкуса и музыка для двоих")}
      />
      <Link href="/library" className="text-sm text-fg-2">
        {t("← Библиотека")}
      </Link>
      <output aria-live="polite" className="block text-sm">
        {message}
      </output>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("Что послушать дальше")}</h2>
        <Link href="/library/later" className="text-sm text-accent">
          {t("Мой список «Послушать позже» →")}
        </Link>
        <label className="block text-sm">
          {t("Разнообразие: {n}%", { n: novelty })}
          <input
            aria-label={t("Разнообразие рекомендаций")}
            type="range"
            min="0"
            max="100"
            step="10"
            value={novelty}
            onChange={(event) => setNovelty(Number(event.target.value))}
            className="block w-full"
          />
          <span className="text-xs text-fg-3">
            {t(
              "0 — ближе к любимым исполнителям; 100 — больше новых. Не больше двух треков одного артиста.",
            )}
          </span>
        </label>
        <label className="block text-sm">
          {t("Недавние интересы: {n}%", { n: recentInterest })}
          <input
            aria-label={t("Вес недавних интересов")}
            type="range"
            min="0"
            max="100"
            step="10"
            value={recentInterest}
            onChange={(event) => setRecentInterest(Number(event.target.value))}
            className="block w-full"
          />
          <span className="text-xs text-fg-3">
            {t(
              "0 — общий вкус; 100 — сильнее учитываем последние 30 дней. Применяется кнопкой ниже.",
            )}
          </span>
        </label>
        {!!blocked.length && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">
              {t("Исключённые исполнители")}
            </h3>
            <ul>
              {blocked.map((row) => (
                <li
                  key={row.track_id}
                  className="flex flex-wrap items-center gap-3 text-sm"
                >
                  {row.artist}
                  <button
                    type="button"
                    disabled={busy}
                    className={`${btn.secondary} ${btn.md}`}
                    onClick={() => {
                      void feedback(row.track_id, "reset");
                    }}
                  >
                    {t("Вернуть {artist}", { artist: row.artist })}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            className={`${btn.secondary} ${btn.md}`}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void loadRecommendations()
                .catch((cause: unknown) =>
                  setMessage(
                    cause instanceof Error
                      ? cause.message
                      : t("Ошибка подборки"),
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            {t("Применить разнообразие")}
          </button>
          <button
            className={`${btn.secondary} ${btn.md}`}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void loadRecommendations(true)
                .catch((cause: unknown) =>
                  setMessage(
                    cause instanceof Error
                      ? cause.message
                      : t("Ошибка подборки"),
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            {t("Новая подборка")}
          </button>
          <button
            className={`${btn.secondary} ${btn.md}`}
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
                    cause instanceof Error
                      ? cause.message
                      : t("Ошибка истории"),
                  ),
                );
            }}
          >
            {t("История рекомендаций")}
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
            {t("Отменить последний выбор")}
          </button>
        )}
        {!tracks.length && (
          <EmptyState
            title={t("Пока нет новых рекомендаций")}
            action={
              <Link
                href="/library/connect"
                className={`${btn.secondary} ${btn.sm}`}
              >
                {t("Проверить подключение")}
              </Link>
            }
          >
            {t(
              "Продолжайте слушать музыку, чтобы появилась подборка. Если прослушивания не появляются, проверьте подключение сервиса.",
            )}
          </EmptyState>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {tracks.map((track) => (
            <article
              key={track.id}
              className="flex flex-col gap-4 rounded-xl bg-surface p-5"
            >
              <div className="flex min-w-0 items-center gap-3">
                {sanitizeImageUrl(track.cover_url) ? (
                  <img
                    src={sanitizeImageUrl(coverAt(track.cover_url, 64))}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-16 w-16 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-surface-2">
                    <Music2 className="h-6 w-6 text-fg-3" aria-hidden="true" />
                  </span>
                )}
                <Link href={`/track/${track.id}`} className="min-w-0">
                  <span className="block truncate text-base font-semibold">
                    {track.title}
                  </span>
                  <span className="block truncate text-sm text-fg-2">
                    {track.artist}
                  </span>
                </Link>
              </div>
              <p className="text-sm leading-relaxed text-fg-2">
                <span className="mb-1 block text-xs font-medium text-accent">
                  {t("Почему этот трек")}
                </span>
                {t(track.reason)}
              </p>
              <div className="mt-auto flex flex-wrap items-start gap-2">
                <SaveForLater trackId={track.id} />
                <button
                  type="button"
                  disabled={busy}
                  className={`${btn.ghost} ${btn.sm}`}
                  onClick={() => {
                    void feedback(track.id, "dislike");
                  }}
                >
                  {t("Скрыть")}
                </button>
                <details className="w-full">
                  <summary className="cursor-pointer py-2 text-xs text-fg-2">
                    {t("Ещё действия")}
                  </summary>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {FEEDBACK_ACTIONS.map(([value, label]) => (
                      <button
                        type="button"
                        key={value}
                        disabled={busy}
                        className={`${btn.secondary} ${btn.sm}`}
                        onClick={() => {
                          void feedback(track.id, value);
                        }}
                      >
                        {t(label)}
                      </button>
                    ))}
                  </div>
                </details>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">
          {t("Как меняется вкус · 30 дней")}
        </h2>
        <p className="text-xs text-fg-3">
          {t(
            "Сравниваем последние 30 дней с предыдущими 30. Возвращения — исполнители из более ранней истории.",
          )}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              [msg("Новые"), evolution?.new],
              [msg("Вернулись"), evolution?.returning],
              [msg("Стали звучать реже"), evolution?.faded],
            ] as const
          ).map(([label, artists]) => (
            <div
              key={label}
              className="rounded-xl border border-line bg-surface p-4"
            >
              <h3 className="mb-3 font-medium">{t(label)}</h3>
              {artists?.length ? (
                <ul className="space-y-2 text-sm">
                  {artists.map((artist) => (
                    <li key={artist.artist}>
                      {artist.artist}
                      <span className="block text-xs text-fg-3">
                        {artist.previous_plays} → {artist.plays}{" "}
                        {plural(
                          artist.plays,
                          "прослушивание",
                          "прослушивания",
                          "прослушиваний",
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-fg-3">{t("Пока нет изменений")}</p>
              )}
            </div>
          ))}
        </div>
        {!!evolution?.genres.length && (
          <p className="text-sm text-fg-2">
            {t("Жанры:")}{" "}
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
          <h2 className="text-lg font-semibold">
            {t("Ваша музыкальная неделя")}
          </h2>
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
                      : t("Не удалось создать карточку"),
                  );
                }
              }}
            >
              {t("Скачать карточку PNG")}
            </button>
            <button
              type="button"
              className={`${btn.secondary} ${btn.sm}`}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(story.story);
                  setMessage(t("Итоги скопированы."));
                } catch {
                  setMessage(
                    t("Не удалось скопировать. Можно выделить текст итогов."),
                  );
                }
              }}
            >
              {t("Скопировать итоги")}
            </button>
          </div>
          <p className="text-xs text-fg-3">
            {t(
              "Карточка скачивается на ваше устройство. Вы сами выбираете, с кем поделиться.",
            )}
          </p>
        </section>
      )}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("Музыка для двоих")}</h2>
        <p className="text-sm text-fg-2">
          {t(
            "Подборка по общим исполнителям. Доступ зависит от настроек истории и статистики второго участника.",
          )}
        </p>
        <form
          className="flex flex-wrap gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            await makeMix();
          }}
        >
          <input
            autoComplete="off"
            required
            aria-label={t("Имя второго участника")}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder={t("@имя пользователя")}
            className={input}
          />
          <button
            type="submit"
            disabled={busy}
            className={`${btn.primary} ${btn.sm}`}
          >
            {t("Собрать подборку")}
          </button>
        </form>
        {mix && (
          <div className="space-y-3">
            {!mix.tracks.length && (
              <EmptyState title={t("Общих исполнителей пока нет")}>
                {t(
                  "Попробуйте другого участника или послушайте больше музыки.",
                )}
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
                <span className="block text-xs text-fg-3">
                  {t(track.reason)}
                </span>
              </p>
            ))}
            <Link className={`${btn.secondary} ${btn.sm}`} href="/together">
              {t("Открыть Together")}
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
