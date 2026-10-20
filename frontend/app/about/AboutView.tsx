"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChartColumn, Minus, Plus, Trophy, Zap } from "lucide-react";
import { API_URL } from "@/app/lib/api";
import { formatNumber, plural } from "@/app/lib/plural";
import { isValidUser } from "@/app/lib/theme";
import { sanitizeImageUrl } from "@/app/utils/sanitizeUrl";
import { sourceLabel } from "@/utils/formatters";
import { PlayingBars, btn } from "@/components/ui";
import { coverAt } from "@/app/lib/coverSize";
import { useT } from "@/app/lib/i18n/client";
import { msg, type Translator } from "@/app/lib/i18n/core";
import {
  FeatureGrid,
  HeroIntro,
  NumbersStrip,
  StepsSection,
} from "@/components/Landing";

export interface PublicStats {
  total_scrobbles: number;
  total_tracks: number;
  total_users: number;
  online: number;
}

export interface Week {
  from: string;
  to: string;
  days: { date: string; plays: number }[];
  total_plays: number;
  hours: number;
  top_artist: { name: string; plays: number } | null;
}

export interface FeedItem {
  id: number;
  username: string | null;
  title: string;
  artist: string;
  cover_url?: string | null;
  source: string;
  time?: string;
  relative_time: string;
  is_playing?: boolean;
}

const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

/** Short weekday of a "YYYY-MM-DD" date (UTC): Russian list, else Intl. */
function weekday(date: string, t: Translator): string {
  const day = new Date(date + "T00:00:00Z");
  if (t.lang === "ru") return WEEKDAYS[day.getUTCDay()];
  return new Intl.DateTimeFormat(t.locale, {
    weekday: "short",
    timeZone: "UTC",
  }).format(day);
}

/** The API sends a Russian "5м назад"; other languages count it from `time`. */
function relativeTime(item: FeedItem, t: Translator): string {
  if (t.lang === "ru" || !item.time) return item.relative_time;
  const then = Date.parse(item.time);
  if (Number.isNaN(then)) return item.relative_time;
  const minutes = Math.round((then - Date.now()) / 60_000);
  const format = new Intl.RelativeTimeFormat(t.locale, {
    numeric: "auto",
    style: "short",
  });
  if (Math.abs(minutes) < 60) return format.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return format.format(hours, "hour");
  return format.format(Math.round(hours / 24), "day");
}
const QUIET_WEEK = 20;

const features = [
  {
    icon: Zap,
    title: msg("Скроблинг из разных сервисов"),
    text: msg(
      "Яндекс Музыка, Spotify и SoundCloud подключаются напрямую. Для YouTube Music, VK и других веб-плееров доступно расширение VEIN.",
    ),
  },
  {
    icon: ChartColumn,
    title: msg("Честная статистика"),
    text: msg(
      "Почасовая история, топы артистов и треков за неделю, месяц и всё время. Когда вы слушаете и сколько — без округлений.",
    ),
  },
  {
    icon: Trophy,
    title: msg("Уровни и достижения"),
    text: msg(
      "Опыт за каждый трек, дослушанный до 85%. Уровни, достижения и серия дней подряд — она сгорает, если пропустить день.",
    ),
  },
];

const steps = [
  {
    title: msg("Создайте профиль"),
    text: msg(
      "После регистрации откройте центр интеграций и выберите музыкальные сервисы.",
    ),
  },
  {
    title: msg("Подключите сервис"),
    text: msg(
      "Яндекс Музыка, Spotify и SoundCloud работают напрямую. Для остальных плееров установите расширение.",
    ),
  },
  {
    title: msg("Смотрите статистику"),
    text: msg(
      "Каждое прослушивание сохраняется и появляется в профиле за пару секунд.",
    ),
  },
];

const faq = [
  {
    q: msg("Какие сервисы поддерживаются?"),
    a: msg(
      "Яндекс Музыка, Spotify и SoundCloud подключаются напрямую. YouTube Music, VK Музыка и другие веб-плееры работают через расширение. Историю из Last.fm можно импортировать в настройках.",
    ),
  },
  {
    q: msg("Обязательно ставить расширение?"),
    a: msg(
      "Нет. Для Яндекс Музыки, Spotify и SoundCloud достаточно прямого подключения. Расширение нужно для YouTube Music, VK и неподдерживаемых напрямую веб-плееров.",
    ),
  },
  {
    q: msg("Когда трек засчитывается?"),
    a: msg(
      "Прослушивание сохраняется сразу, а опыт начисляется, когда трек дослушан до 85% длины.",
    ),
  },
  {
    q: msg("Кто видит мою историю?"),
    a: msg(
      "Решаете вы: профиль можно сделать открытым или приватным, а в ленте друзей показывать только то, что вы разрешили.",
    ),
  },
  {
    q: msg("Можно забрать свои данные?"),
    a: msg(
      "Да. Всю историю можно выгрузить в настройках, а аккаунт — удалить вместе с данными.",
    ),
  },
];

/** What the server already read for the landing; null where it couldn't. */
export interface LandingData {
  stats: PublicStats | null;
  week: Week | null;
  feed: FeedItem[] | null;
}

function useLandingData(initial: LandingData | null) {
  const [stats, setStats] = useState<PublicStats | null>(
    initial?.stats ?? null,
  );
  const [week, setWeek] = useState<Week | null>(initial?.week ?? null);
  const [feed, setFeed] = useState<FeedItem[]>(initial?.feed ?? []);
  useEffect(() => {
    // Everything arrived with the page's HTML: nothing to ask again
    if (initial?.stats && initial.week && initial.feed) return;
    // The home page mounts this landing hidden until it has read the
    // session: a signed-in visitor never sees it, so skip its requests
    if (
      location.pathname === "/" &&
      document.documentElement.dataset.auth === "1"
    )
      return;
    const get = <T,>(path: string) =>
      fetch(`${API_URL}${path}`)
        .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
        .catch(() => null);
    let active = true;
    Promise.all([
      get<PublicStats>("/api/public-stats"),
      get<Week>("/api/public-stats/week"),
      get<{ feed: FeedItem[] }>("/api/feed/global"),
    ])
      .then(([stats, week, data]) => {
        if (!active) return;
        // Keep what the server already sent if a retry fails
        if (stats) setStats(stats);
        if (week) setWeek(week);
        if (Array.isArray(data?.feed)) setFeed(data.feed);
      })
      .catch(() => {
        /* The landing page remains usable without statistics. */
      });
    return () => {
      active = false;
    };
  }, [initial]);
  return { stats, week, feed };
}

function shortNumber(n: number, t: Translator) {
  if (n < 1000) return String(n);
  const k = (n / 1000).toFixed(1);
  return `${t.lang === "ru" ? k.replace(".", ",") : k}k`;
}

function weekRange(week: Week, t: Translator) {
  const fmt = (iso: string, withMonth: boolean) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(t.locale, {
      day: "numeric",
      month: withMonth ? "long" : undefined,
      timeZone: "UTC",
    });
  const sameMonth = week.from.slice(0, 7) === week.to.slice(0, 7);
  return `${fmt(week.from, !sameMonth)}–${fmt(week.to, true)}`;
}

/** "VEIN за неделю": site-wide plays per day, totals and artist of the week. */
function WeekCard({ week }: Readonly<{ week: Week | null }>) {
  const t = useT();
  if (!week)
    return (
      <section
        aria-label={t("Загружаем статистику за неделю")}
        className="flex min-h-[230px] animate-pulse flex-col gap-4 rounded-xl border border-line bg-surface p-5"
      >
        <span className="h-4 w-36 rounded bg-surface-2" />
        <span className="h-[104px] rounded-lg bg-surface-2" />
        <span className="h-10 rounded bg-surface-2" />
      </section>
    );
  const days = week?.days ?? [];
  const max = Math.max(1, ...days.map((d) => d.plays));
  const quiet = week.total_plays < QUIET_WEEK;
  const totals = [
    {
      label: plural(
        week?.total_plays ?? 0,
        "прослушивание",
        "прослушивания",
        "прослушиваний",
      ),
      value: formatNumber(week?.total_plays ?? 0),
    },
    {
      label: t("музыки"),
      value:
        (week?.hours ?? 0) >= 1
          ? t("{n} ч", { n: formatNumber(Math.round(week?.hours ?? 0)) })
          : t("{n} мин", { n: Math.round((week?.hours ?? 0) * 60) }),
    },
    {
      label: t("артист недели"),
      value: week?.top_artist?.name ?? "—",
      text: true,
    },
  ];
  return (
    <section
      aria-labelledby="week-title"
      className="flex flex-col gap-3.5 rounded-xl border border-line bg-surface p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="week-title" className="whitespace-nowrap text-sm font-semibold">
          {t("VEIN за неделю")}
        </h2>
        {week && (
          <span className="font-mono text-[11px] text-fg-3">
            {weekRange(week, t)} · {t("все слушатели")}
          </span>
        )}
      </div>
      {quiet ? (
        <div className="flex h-[104px] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line text-center">
          <span className="text-sm font-medium">{t("Пока тихо")}</span>
          <span className="px-4 text-xs text-fg-2">
            {t("На этой неделе {n} {plays}. Станьте тем, кто это исправит.", {
              n: formatNumber(week?.total_plays ?? 0),
              plays: plural(
                week?.total_plays ?? 0,
                "прослушивание",
                "прослушивания",
                "прослушиваний",
              ),
            })}
          </span>
        </div>
      ) : (
        <div
          role="img"
          aria-label={t("Прослушивания по дням: {days}", {
            days: days
              .map((d) => weekday(d.date, t) + " " + d.plays)
              .join(", "),
          })}
          className="flex h-[104px] items-end gap-1.5"
        >
          {days.map((d, i) => {
            const last = i === days.length - 1;
            return (
              <div
                key={d.date}
                className="flex flex-1 flex-col items-center gap-1.5"
              >
                <span
                  className={`font-mono text-[10px] ${last ? "text-accent" : "text-fg-3"}`}
                >
                  {shortNumber(d.plays, t)}
                </span>
                <div
                  className={`w-full rounded-sm ${last ? "bg-accent" : "bg-bar"}`}
                  style={{
                    height: Math.max(2, Math.round((d.plays / max) * 62)),
                  }}
                />
                <span className="font-mono text-[10px] text-fg-3">
                  {weekday(d.date, t)}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <dl className="grid grid-cols-3 gap-3 border-t border-line pt-3">
        {totals.map((total) => (
          <div
            key={total.label}
            className="flex min-w-0 flex-col-reverse gap-0.5"
          >
            <dt className="text-[11px] text-fg-2">{total.label}</dt>
            <dd
              className={`truncate text-lg ${total.text ? "font-medium" : "font-mono"}`}
              title={total.text ? total.value : undefined}
            >
              {total.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Cover({ src, size }: Readonly<{ src?: string | null; size: number }>) {
  const url = sanitizeImageUrl(coverAt(src, size));
  return url ? (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      className="shrink-0 rounded object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="shrink-0 rounded bg-surface-2"
      style={{ width: size, height: size }}
    />
  );
}

/** Cover, title and artist of a feed row. */
function CoverAndTitle({
  item,
  size,
}: Readonly<{ item: FeedItem; size: 36 | 40 }>) {
  return (
    <>
      <Cover src={item.cover_url} size={size} />
      <span className="min-w-0">
        <span
          className={`block truncate font-medium ${size === 36 ? "text-[13px]" : "text-sm"}`}
        >
          {item.title}
        </span>
        <span className="block truncate text-xs text-fg-2">{item.artist}</span>
      </span>
    </>
  );
}

export default function About({
  initial = null,
}: Readonly<{ initial?: LandingData | null }>) {
  const t = useT();
  const { stats, week, feed } = useLandingData(initial);
  const [openFaq, setOpenFaq] = useState(0);
  const [username, setUsername] = useState<string | null>(null);
  useEffect(() => {
    const u = localStorage.getItem("username");
    setUsername(isValidUser(u) ? u : null);
  }, []);

  const primaryHref = username ? `/user/${username}` : "/auth?mode=register";
  const primaryLabel = username ? t("В мой профиль") : t("Начать скроблить");
  const online = stats?.online ?? 0;
  // "2 слушателя", not "2 слушателей"
  const label = (n: number | undefined, ...forms: [string, string, string]) =>
    plural(n ?? 0, ...forms);
  const numbers = [
    {
      label: label(
        stats?.total_scrobbles,
        "прослушивание",
        "прослушивания",
        "прослушиваний",
      ),
      value: stats?.total_scrobbles,
    },
    {
      label: label(
        stats?.total_tracks,
        "уникальный трек",
        "уникальных трека",
        "уникальных треков",
      ),
      value: stats?.total_tracks,
    },
    {
      label: label(stats?.total_users, "слушатель", "слушателя", "слушателей"),
      value: stats?.total_users,
    },
    { label: t("онлайн сейчас"), value: stats?.online },
  ];

  return (
    <div className="flex flex-col">
      <section
        aria-labelledby="hero-title"
        className="mx-auto grid w-full max-w-[1200px] items-center gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-16 lg:pb-20 lg:pt-24"
      >
        <div className="flex flex-col gap-7">
          {online > 0 && (
            <span className="inline-flex h-[26px] items-center gap-2 self-start rounded-full border border-line px-2.5 font-mono text-xs text-fg-2">
              <span className="h-1.5 w-1.5 rounded-full bg-ok" />
              {online}{" "}
              {plural(
                online,
                "человек слушает",
                "человека слушают",
                "человек слушают",
              )}{" "}
              {t("прямо сейчас")}
            </span>
          )}
          <HeroIntro
            title={t("Твоя музыка.")}
            subtitle={t("Твоя история.")}
            text={t(
              "VEIN собирает всё, что вы слушаете в Яндекс Музыке, Spotify, YouTube Music, VK и SoundCloud, в одну историю — с топами, статистикой по часам и лентой друзей.",
            )}
            primary={{ href: primaryHref, label: primaryLabel }}
            extensionLabel={t("Расширение для браузера")}
          />
          <ul
            aria-label={t("Поддерживаемые сервисы")}
            className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-fg-3"
          >
            <li>{t("Яндекс Музыка")}</li>
            <li>Spotify</li>
            <li>YouTube Music</li>
            <li>{t("VK Музыка")}</li>
            <li>SoundCloud</li>
            <li>{t("Last.fm (импорт)")}</li>
          </ul>
          <Link
            href="/en"
            hrefLang="en"
            lang="en"
            className="self-start text-[13px] text-fg-3 hover:text-fg-2"
          >
            English
          </Link>
        </div>

        <div className="flex flex-col gap-3">
          <WeekCard week={week} />
          {feed.length > 0 && (
            <ul
              aria-label={t("Последние прослушивания")}
              className="rounded-xl border border-line bg-surface px-5 py-1.5"
            >
              {feed.slice(0, 3).map((item) => (
                <li
                  key={item.id}
                  className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line py-2.5 last:border-0"
                >
                  <CoverAndTitle item={item} size={36} />
                  <span className="flex flex-col items-end gap-0.5 font-mono text-[11px]">
                    <span className="max-w-[120px] truncate text-fg-2">
                      {item.username}
                    </span>
                    {item.is_playing ? (
                      <span className="flex items-center gap-1.5 text-accent">
                        <PlayingBars /> {t("играет")}
                      </span>
                    ) : (
                      <span className="text-fg-3">
                        {sourceLabel(item.source)} · {relativeTime(item, t)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <NumbersStrip
        label={t("VEIN в цифрах")}
        numbers={numbers}
        format={formatNumber}
      />

      <section
        aria-labelledby="features-title"
        className="mx-auto flex w-full max-w-[1200px] flex-col gap-10 px-4 pt-20 sm:px-6 lg:pt-24"
      >
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <h2
            id="features-title"
            className="text-[30px] font-semibold tracking-[-0.025em] md:text-4xl"
          >
            {t("Что умеет VEIN")}
          </h2>
          <p className="max-w-[420px] text-[15px] leading-normal text-fg-2">
            {t(
              "Показываем ровно то, что пришло из плеера. Без рекомендательных алгоритмов и без рекламы.",
            )}
          </p>
        </div>
        <FeatureGrid
          features={features.map((f) => ({
            ...f,
            title: t(f.title),
            text: t(f.text),
          }))}
        />
      </section>

      <StepsSection
        title={t("Как это работает")}
        steps={steps.map((s) => ({ title: t(s.title), text: t(s.text) }))}
      />

      <div className="mx-auto grid w-full max-w-[1200px] gap-16 px-4 pt-20 sm:px-6 lg:grid-cols-2 lg:gap-[72px] lg:pt-24">
        <section aria-labelledby="live-title" className="flex flex-col gap-5">
          <div className="flex items-baseline justify-between">
            <h2
              id="live-title"
              className="text-2xl font-semibold tracking-[-0.02em]"
            >
              {t("Сейчас слушают")}
            </h2>
            <Link href="/feed" className="text-[13px] text-accent">
              {t("Вся лента →")}
            </Link>
          </div>
          {feed.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-5 py-10 text-center text-sm text-fg-2">
              {t("Пока никто ничего не слушает. Самое время начать.")}
            </p>
          ) : (
            <ol className="border-t border-line-soft">
              {feed.slice(0, 6).map((item) => (
                <li
                  key={item.id}
                  className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3.5 border-b border-line-soft py-3"
                >
                  <CoverAndTitle item={item} size={40} />
                  <span className="text-right font-mono text-[11px] leading-relaxed text-fg-3">
                    {item.username && (
                      <Link
                        href={`/user/${item.username}`}
                        className="block max-w-[140px] truncate hover:text-fg-2"
                      >
                        {item.username}
                      </Link>
                    )}
                    {relativeTime(item, t)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section
          id="faq"
          aria-labelledby="faq-title"
          className="flex scroll-mt-8 flex-col gap-5"
        >
          <h2
            id="faq-title"
            className="text-2xl font-semibold tracking-[-0.02em]"
          >
            {t("Вопросы")}
          </h2>
          <div className="border-t border-line-soft">
            {faq.map((item, i) => {
              const open = openFaq === i;
              return (
                <div key={item.q} className="border-b border-line-soft">
                  <h3>
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={`faq-${i}`}
                      onClick={() => setOpenFaq(open ? -1 : i)}
                      className="flex w-full items-center justify-between gap-4 py-4 text-left text-[15px] font-medium"
                    >
                      {t(item.q)}
                      {open ? (
                        <Minus
                          className="h-4 w-4 shrink-0 text-fg-3"
                          aria-hidden="true"
                        />
                      ) : (
                        <Plus
                          className="h-4 w-4 shrink-0 text-fg-3"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  </h3>
                  {open && (
                    <p
                      id={`faq-${i}`}
                      className="pb-4 pr-8 text-sm leading-relaxed text-fg-2"
                    >
                      {t(item.a)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="mx-auto mt-20 w-full max-w-[1200px] px-4 sm:px-6 lg:mt-24">
        <section
          aria-labelledby="cta-title"
          className="flex flex-col gap-6 rounded-xl border border-line bg-surface p-8 md:flex-row md:items-center md:justify-between md:p-12"
        >
          <div className="flex flex-col gap-2">
            <h2
              id="cta-title"
              className="text-[28px] font-semibold tracking-[-0.02em]"
            >
              {t("Готовы увидеть свою музыку?")}
            </h2>
            <p className="text-[15px] text-fg-2">
              {t(
                "Регистрация — 10 секунд. Первые треки появятся в профиле, как только заиграет плеер.",
              )}
            </p>
          </div>
          <Link
            href={primaryHref}
            className={`${btn.primary} ${btn.lg} shrink-0`}
          >
            {username ? t("В мой профиль") : t("Создать профиль")}
          </Link>
        </section>
      </div>
    </div>
  );
}
