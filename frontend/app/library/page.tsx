"use client";

import { coverAt } from "@/app/lib/coverSize";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Sparkles, Search, Music2 } from "lucide-react";
import { API_URL } from "@/app/lib/api";
import { plural } from "@/app/lib/plural";
import { btn, input, EmptyState, Loading, PageHeader } from "@/components/ui";
import { useT } from "@/app/lib/i18n/client";
import { tr } from "@/app/lib/i18n/active";

interface MemoryTrack {
  id: number;
  title: string;
  artist: string;
  cover_url?: string | null;
  plays: number;
  played_at?: string;
  last_played?: string;
}
interface Memories {
  date: string;
  returning_artists: { artist: string; days_away: number; plays: number }[];
  on_this_day: MemoryTrack[];
  forgotten: MemoryTrack[];
}

export default function LibraryPage() {
  const t = useT();
  const router = useRouter();
  // Guests saw two red "failed to load" errors; send them to sign in instead
  const [guest, setGuest] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem("username")) {
      setGuest(true);
      router.replace("/auth");
    }
  }, [router]);
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<MemoryTrack[]>([]);
  const [savedError, setSavedError] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const [data, setData] = useState<Memories | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!localStorage.getItem("username")) return;
    const controller = new AbortController();
    fetch(`${API_URL}/api/me/listen-later?limit=4`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok)
          throw new Error(tr("Не удалось загрузить список на потом"));
        return response.json();
      })
      .then((result: { items: { track: MemoryTrack }[] }) =>
        setSaved(result.items.map((item) => item.track)),
      )
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setSavedError(
            cause instanceof Error ? cause.message : tr("Ошибка загрузки"),
          );
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!localStorage.getItem("username")) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(
      `${API_URL}/api/me/memories?${new URLSearchParams(date ? { on: date } : {})}`,
      {
        credentials: "include",
        signal: controller.signal,
      },
    )
      .then((response) => {
        if (!response.ok)
          throw new Error(tr("Не удалось загрузить воспоминания"));
        return response.json();
      })
      .then(setData)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setData(null);
          setError(
            cause instanceof Error ? cause.message : tr("Ошибка загрузки"),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date]);
  if (guest) return <Loading label={t("Открываем вход…")} />;
  return (
    <main className="mx-auto flex w-full max-w-[1000px] flex-col gap-8 px-4 py-8 sm:px-8 lg:py-10">
      <PageHeader
        title={t("Моя библиотека")}
        subtitle={t("Воспоминания, забытая музыка и порядок в истории")}
      />
      <form
        action="/library/search"
        className="flex flex-wrap gap-3"
        role="search"
        aria-label={t("Поиск в библиотеке")}
      >
        <label className="relative min-w-0 flex-1 basis-52">
          <Search
            className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-fg-3"
            aria-hidden="true"
          />
          <input
            autoComplete="off"
            name="q"
            type="search"
            aria-label={t("Поиск в моей музыке")}
            placeholder={t("Трек, артист или альбом")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={`${input} h-12 pl-10`}
          />
        </label>
        <button className={`${btn.primary} ${btn.lg}`} type="submit">
          {t("Найти музыку")}
        </button>
      </form>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/library/discover" className={`${btn.secondary} ${btn.md}`}>
          {t("Открытия и ваш вкус")}
        </Link>
        <Link href="/goals" className={`${btn.ghost} ${btn.md}`}>
          {t("Музыкальные цели")}
        </Link>
        <details className="relative">
          <summary className={`${btn.ghost} ${btn.md} cursor-pointer`}>
            {t("Управление библиотекой")}
          </summary>
          <nav
            aria-label={t("Управление библиотекой")}
            className="absolute left-0 z-20 mt-2 flex w-64 flex-col gap-1 rounded-xl border border-line bg-surface p-2 shadow-xl"
          >
            <Link
              href="/library/connect"
              className={`${btn.ghost} ${btn.md} justify-start`}
            >
              {t("Подключить музыку")}
            </Link>
            <Link
              href="/library/transfer"
              className={`${btn.ghost} ${btn.md} justify-start`}
            >
              {t("Перенести историю")}
            </Link>
            <Link
              href="/library/cleanup"
              className={`${btn.ghost} ${btn.md} justify-start`}
            >
              {t("Навести порядок")}
            </Link>
          </nav>
        </details>
      </div>
      <section aria-labelledby="saved-music-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="saved-music-title" className="text-lg font-semibold">
            {t("Послушать позже")}
          </h2>
          <Link href="/library/later" className="text-sm text-accent">
            {t("Весь список →")}
          </Link>
        </div>
        {savedError ? (
          <p role="alert" className="text-sm text-danger">
            {savedError}
          </p>
        ) : (
          <MemorySection
            title=""
            subtitle=""
            icon={null}
            tracks={saved}
            empty={t("Сохраняйте музыку из рекомендаций — она появится здесь.")}
          />
        )}
      </section>
      <label className="block text-sm">
        <span>{t("Дата воспоминаний")}</span>
        <input
          type="date"
          aria-label={t("Дата воспоминаний")}
          min="2000-01-01"
          max={new Date().toLocaleDateString("en-CA")}
          value={date || data?.date || ""}
          onChange={(event) => setDate(event.target.value)}
          className="mt-2 block min-h-11 w-full rounded-lg border border-line bg-surface px-3 sm:w-64"
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {loading && <Loading label={t("Собираем воспоминания…")} />}
      {!loading && !error && (
        <>
          <MemorySection
            title={t("В этот день")}
            subtitle={t("Что играло в эту дату в прошлые годы")}
            icon={<CalendarClock className="h-4 w-4" />}
            tracks={data?.on_this_day ?? []}
            empty={t("Через год здесь появятся музыкальные воспоминания.")}
          />
          <MemorySection
            title={t("Давно не звучало")}
            subtitle={t("Любимые треки, которые вы не включали больше 90 дней")}
            icon={<Sparkles className="h-4 w-4" />}
            tracks={data?.forgotten ?? []}
            empty={t("Пока нет забытых треков — продолжайте слушать музыку.")}
          />
          {!!data?.returning_artists?.length && (
            <section className="space-y-3">
              <h2 className="font-semibold">{t("Снова с вами")}</h2>
              <p className="text-sm text-fg-3">
                {t(
                  "Исполнители, к которым вы вернулись за последний месяц после перерыва от 90 дней.",
                )}
              </p>
              <ul className="space-y-2">
                {data.returning_artists.map((artist) => (
                  <li key={artist.artist}>
                    <Link
                      className="inline-flex min-h-11 items-center text-accent"
                      href={`/library/search?q=${encodeURIComponent(artist.artist)}`}
                    >
                      {artist.artist} ·{" "}
                      {t("перерыв {days} {daysWord}", {
                        days: artist.days_away,
                        daysWord: plural(
                          artist.days_away,
                          "день",
                          "дня",
                          "дней",
                        ),
                      })}{" "}
                      · {artist.plays}{" "}
                      {plural(
                        artist.plays,
                        "прослушивание",
                        "прослушивания",
                        "прослушиваний",
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function MemorySection({
  title,
  subtitle,
  icon,
  tracks,
  empty,
}: Readonly<{
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  tracks: MemoryTrack[];
  empty: string;
}>) {
  const t = useT();
  return (
    <section className="flex flex-col gap-4">
      {title && (
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            {icon}
            {title}
          </h2>
          <p className="mt-1 text-xs text-fg-3">{subtitle}</p>
        </div>
      )}
      {tracks.length === 0 ? (
        <EmptyState title={t("Пока пусто")}>{empty}</EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tracks.map((track) => (
            <Link
              key={`${track.id}-${track.played_at || track.last_played}`}
              href={`/library/search?q=${encodeURIComponent(track.title)}`}
              className="group overflow-hidden rounded-xl bg-surface transition-colors hover:bg-surface-2"
            >
              {track.cover_url ? (
                <img
                  src={coverAt(track.cover_url, 200)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <span className="flex aspect-square w-full items-center justify-center bg-surface-2">
                  <Music2 className="h-10 w-10 text-fg-3" aria-hidden="true" />
                </span>
              )}
              <span className="block p-3">
                <span className="block truncate text-sm font-medium">
                  {track.title}
                </span>
                <span className="block truncate text-xs text-fg-3">
                  {track.artist}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
