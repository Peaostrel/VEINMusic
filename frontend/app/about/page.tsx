"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChartColumn, Download, Minus, Plus, Trophy, Zap } from "lucide-react";
import { API_URL } from "@/app/lib/api";
import { formatNumber, plural } from "@/app/lib/plural";
import { isValidUser } from "@/app/lib/theme";
import { sanitizeImageUrl } from "@/app/utils/sanitizeUrl";
import { sourceLabel } from "@/utils/formatters";
import { PlayingBars, btn } from "@/components/ui";

interface PublicStats {
  total_scrobbles: number;
  total_tracks: number;
  total_users: number;
  online: number;
}

interface Week {
  from: string;
  to: string;
  days: { date: string; plays: number }[];
  total_plays: number;
  hours: number;
  top_artist: { name: string; plays: number } | null;
}

interface FeedItem {
  id: number;
  username: string | null;
  title: string;
  artist: string;
  cover_url?: string | null;
  source: string;
  relative_time: string;
  is_playing?: boolean;
}

const EXTENSION_URL =
  "https://github.com/Peaostrel/VEINMusic/tree/VEIN/music-extension";
const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

/** Short weekday of a "YYYY-MM-DD" date (UTC). */
function weekday(date: string): string {
  return WEEKDAYS[new Date(date + "T00:00:00Z").getUTCDay()];
}
const QUIET_WEEK = 20;

const features = [
  {
    icon: Zap,
    title: "Скроблинг из браузера",
    text: "Расширение видит, что играет в Яндекс Музыке, Spotify, VK и SoundCloud, и сохраняет каждый трек. Иногда думает пару секунд, но забирает всё честно.",
  },
  {
    icon: ChartColumn,
    title: "Честная статистика",
    text: "Почасовая история, топы артистов и треков за неделю, месяц и всё время. Когда вы слушаете и сколько — без округлений.",
  },
  {
    icon: Trophy,
    title: "Уровни и достижения",
    text: "Опыт за каждый трек, дослушанный до 85%. Уровни, достижения и серия дней подряд — она сгорает, если пропустить день.",
  },
];

const steps = [
  {
    title: "Установите расширение",
    text: "Без него VEIN не видит музыку. Расширение тихо работает во вкладке с плеером.",
  },
  {
    title: "Включите музыку",
    text: "Через секунду после старта трека расширение его заметит. Больше ничего делать не нужно.",
  },
  {
    title: "Смотрите статистику",
    text: "Каждое прослушивание сохраняется и появляется в профиле за пару секунд.",
  },
];

const faq = [
  {
    q: "Какие сервисы поддерживаются?",
    a: "Яндекс Музыка, Spotify, VK Музыка и SoundCloud в браузере — через расширение. Историю из Last.fm можно импортировать в настройках.",
  },
  {
    q: "Обязательно ставить расширение?",
    a: "Для веб-плееров — да: без него VEIN не знает, что у вас играет. Часть сервисов можно подключить напрямую в настройках.",
  },
  {
    q: "Когда трек засчитывается?",
    a: "Прослушивание сохраняется сразу, а опыт начисляется, когда трек дослушан до 85% длины.",
  },
  {
    q: "Кто видит мою историю?",
    a: "Решаете вы: профиль можно сделать открытым или приватным, а в ленте друзей показывать только то, что вы разрешили.",
  },
  {
    q: "Можно забрать свои данные?",
    a: "Да. Всю историю можно выгрузить в настройках, а аккаунт — удалить вместе с данными.",
  },
];

function useLandingData() {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [week, setWeek] = useState<Week | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  useEffect(() => {
    const get = <T,>(path: string) =>
      fetch(`${API_URL}${path}`)
        .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
        .catch(() => null);
    get<PublicStats>("/api/public-stats").then(setStats);
    get<Week>("/api/public-stats/week").then(setWeek);
    get<{ feed: FeedItem[] }>("/api/feed/global").then((d) =>
      setFeed(Array.isArray(d?.feed) ? d.feed : []),
    );
  }, []);
  return { stats, week, feed };
}

function shortNumber(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(".", ",")}k` : String(n);
}

function weekRange(week: Week) {
  const fmt = (iso: string, withMonth: boolean) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: withMonth ? "long" : undefined,
      timeZone: "UTC",
    });
  const sameMonth = week.from.slice(0, 7) === week.to.slice(0, 7);
  return `${fmt(week.from, !sameMonth)}–${fmt(week.to, true)}`;
}

/** "VEIN за неделю": site-wide plays per day, totals and artist of the week. */
function WeekCard({ week }: Readonly<{ week: Week | null }>) {
  const days = week?.days ?? [];
  const max = Math.max(1, ...days.map((d) => d.plays));
  const quiet = !week || week.total_plays < QUIET_WEEK;
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
      label: "музыки",
      value:
        (week?.hours ?? 0) >= 1
          ? `${formatNumber(Math.round(week?.hours ?? 0))} ч`
          : `${Math.round((week?.hours ?? 0) * 60)} мин`,
    },
    {
      label: "артист недели",
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
          VEIN за неделю
        </h2>
        {week && (
          <span className="font-mono text-[11px] text-fg-3">
            {weekRange(week)} · все слушатели
          </span>
        )}
      </div>
      {quiet ? (
        <div className="flex h-[104px] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line text-center">
          <span className="text-sm font-medium">Пока тихо</span>
          <span className="px-4 text-xs text-fg-2">
            На этой неделе {formatNumber(week?.total_plays ?? 0)}{" "}
            {plural(
              week?.total_plays ?? 0,
              "прослушивание",
              "прослушивания",
              "прослушиваний",
            )}
            . Станьте тем, кто это исправит.
          </span>
        </div>
      ) : (
        <div
          role="img"
          aria-label={
            "Прослушивания по дням: " +
            days.map((d) => weekday(d.date) + " " + d.plays).join(", ")
          }
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
                  {shortNumber(d.plays)}
                </span>
                <div
                  className={`w-full rounded-sm ${last ? "bg-accent" : "bg-bar"}`}
                  style={{
                    height: Math.max(2, Math.round((d.plays / max) * 62)),
                  }}
                />
                <span className="font-mono text-[10px] text-fg-3">
                  {weekday(d.date)}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <dl className="grid grid-cols-3 gap-3 border-t border-line pt-3">
        {totals.map((t) => (
          <div key={t.label} className="flex min-w-0 flex-col-reverse gap-0.5">
            <dt className="text-[11px] text-fg-2">{t.label}</dt>
            <dd
              className={`truncate text-lg ${t.text ? "font-medium" : "font-mono"}`}
              title={t.text ? t.value : undefined}
            >
              {t.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Cover({ src, size }: Readonly<{ src?: string | null; size: number }>) {
  const url = sanitizeImageUrl(src);
  return url ? (
    <img
      src={url}
      alt=""
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

export default function About() {
  const { stats, week, feed } = useLandingData();
  const [openFaq, setOpenFaq] = useState(0);
  const [username, setUsername] = useState<string | null>(null);
  useEffect(() => {
    const u = localStorage.getItem("username");
    setUsername(isValidUser(u) ? u : null);
  }, []);

  const primaryHref = username ? `/user/${username}` : "/auth?mode=register";
  const primaryLabel = username ? "В мой профиль" : "Начать скроблить";
  const online = stats?.online ?? 0;
  const numbers = [
    { label: "прослушиваний", value: stats?.total_scrobbles },
    { label: "треков в базе", value: stats?.total_tracks },
    { label: "слушателей", value: stats?.total_users },
    { label: "онлайн сейчас", value: stats?.online },
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
              прямо сейчас
            </span>
          )}
          <h1
            id="hero-title"
            className="text-[44px] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-[64px]"
          >
            Твоя музыка.
            <br />
            <span className="text-fg-3">Твоя история.</span>
          </h1>
          <p className="max-w-[520px] text-lg leading-relaxed text-fg-2">
            VEIN собирает всё, что вы слушаете в Яндекс Музыке, Spotify, VK и
            SoundCloud, в одну историю — с топами, статистикой по часам и лентой
            друзей.
          </p>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Link href={primaryHref} className={`${btn.primary} ${btn.lg}`}>
              {primaryLabel}
            </Link>
            <a
              href={EXTENSION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`${btn.secondary} ${btn.lg}`}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Установить расширение
            </a>
          </div>
          <ul
            aria-label="Поддерживаемые сервисы"
            className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-fg-3"
          >
            <li>Яндекс Музыка</li>
            <li>Spotify</li>
            <li>VK Музыка</li>
            <li>SoundCloud</li>
            <li>Last.fm (импорт)</li>
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <WeekCard week={week} />
          {feed.length > 0 && (
            <ul
              aria-label="Последние прослушивания"
              className="rounded-xl border border-line bg-surface px-5 py-1.5"
            >
              {feed.slice(0, 3).map((item) => (
                <li
                  key={item.id}
                  className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line py-2.5 last:border-0"
                >
                  <Cover src={item.cover_url} size={36} />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">
                      {item.title}
                    </span>
                    <span className="block truncate text-xs text-fg-2">
                      {item.artist}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5 font-mono text-[11px]">
                    <span className="max-w-[120px] truncate text-fg-2">
                      {item.username}
                    </span>
                    {item.is_playing ? (
                      <span className="flex items-center gap-1.5 text-accent">
                        <PlayingBars /> играет
                      </span>
                    ) : (
                      <span className="text-fg-3">
                        {sourceLabel(item.source)} · {item.relative_time}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-label="VEIN в цифрах" className="border-y border-line-soft">
        <dl className="mx-auto grid w-full max-w-[1200px] grid-cols-2 px-4 sm:px-6 md:grid-cols-4">
          {numbers.map((n, i) => (
            <div
              key={n.label}
              className={`flex flex-col-reverse gap-1.5 py-6 md:py-8 ${
                i % 2 === 1 ? "border-l border-line-soft pl-5 md:pl-8" : ""
              } ${i === 2 ? "md:border-l md:border-line-soft md:pl-8" : ""} ${
                i >= 2 ? "border-t border-line-soft md:border-t-0" : ""
              }`}
            >
              <dt className="text-[13px] text-fg-2">{n.label}</dt>
              <dd className="font-mono text-2xl font-medium tracking-[-0.02em] md:text-[32px]">
                {n.value === undefined ? "—" : formatNumber(n.value)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        aria-labelledby="features-title"
        className="mx-auto flex w-full max-w-[1200px] flex-col gap-10 px-4 pt-20 sm:px-6 lg:pt-24"
      >
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <h2
            id="features-title"
            className="text-[30px] font-semibold tracking-[-0.025em] md:text-4xl"
          >
            Что умеет VEIN
          </h2>
          <p className="max-w-[420px] text-[15px] leading-normal text-fg-2">
            Показываем ровно то, что пришло из плеера. Без рекомендательных
            алгоритмов и без рекламы.
          </p>
        </div>
        <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
          {features.map((f) => (
            <article key={f.title} className="flex flex-col gap-3.5 bg-bg p-7">
              <f.icon
                className="h-[22px] w-[22px] text-accent"
                aria-hidden="true"
              />
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="text-sm leading-relaxed text-fg-2">{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        id="how"
        aria-labelledby="how-title"
        className="mx-auto flex w-full max-w-[1200px] scroll-mt-8 flex-col gap-10 px-4 pt-20 sm:px-6 lg:pt-24"
      >
        <h2
          id="how-title"
          className="text-[30px] font-semibold tracking-[-0.025em] md:text-4xl"
        >
          Как это работает
        </h2>
        <ol className="grid gap-10 md:grid-cols-3">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className={`flex flex-col gap-3.5 border-t pt-5 ${i === 0 ? "border-accent" : "border-line"}`}
            >
              <span
                className={`font-mono text-[13px] ${i === 0 ? "text-accent" : "text-fg-3"}`}
              >
                0{i + 1}
              </span>
              <h3 className="text-lg font-semibold">{s.title}</h3>
              <p className="text-sm leading-relaxed text-fg-2">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="mx-auto grid w-full max-w-[1200px] gap-16 px-4 pt-20 sm:px-6 lg:grid-cols-2 lg:gap-[72px] lg:pt-24">
        <section aria-labelledby="live-title" className="flex flex-col gap-5">
          <div className="flex items-baseline justify-between">
            <h2
              id="live-title"
              className="text-2xl font-semibold tracking-[-0.02em]"
            >
              Сейчас слушают
            </h2>
            <Link href="/feed" className="text-[13px] text-accent">
              Вся лента →
            </Link>
          </div>
          {feed.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-5 py-10 text-center text-sm text-fg-2">
              Пока никто ничего не слушает. Самое время начать.
            </p>
          ) : (
            <ol className="border-t border-line-soft">
              {feed.slice(0, 6).map((item) => (
                <li
                  key={item.id}
                  className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3.5 border-b border-line-soft py-3"
                >
                  <Cover src={item.cover_url} size={40} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {item.title}
                    </span>
                    <span className="block truncate text-xs text-fg-2">
                      {item.artist}
                    </span>
                  </span>
                  <span className="text-right font-mono text-[11px] leading-relaxed text-fg-3">
                    {item.username && (
                      <Link
                        href={`/user/${item.username}`}
                        className="block max-w-[140px] truncate hover:text-fg-2"
                      >
                        {item.username}
                      </Link>
                    )}
                    {item.relative_time}
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
            Вопросы
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
                      {item.q}
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
                      {item.a}
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
              Готовы увидеть свою музыку?
            </h2>
            <p className="text-[15px] text-fg-2">
              Регистрация — 10 секунд. Первые треки появятся в профиле, как
              только заиграет плеер.
            </p>
          </div>
          <Link
            href={primaryHref}
            className={`${btn.primary} ${btn.lg} shrink-0`}
          >
            {username ? "В мой профиль" : "Создать профиль"}
          </Link>
        </section>
      </div>
    </div>
  );
}
