"use client";

import { coverAt } from "@/app/lib/coverSize";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { API_URL } from "@/app/lib/api";
import type { CalendarDay, ListeningCalendar } from "@/app/lib/types";
import { formatNumber, plural } from "@/app/lib/plural";
import { getSafeUrl } from "../../_components/profileUtils";
import CalendarRange from "./CalendarRange";
import { btn, Segmented } from "@/components/ui";

const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function localDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function dayLabel(value: string) {
  return localDate(value).toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function Month({
  year,
  month,
  days,
  max,
  selected,
  onSelect,
}: Readonly<{
  year: number;
  month: number;
  days: Map<string, CalendarDay>;
  max: number;
  selected: string | null;
  onSelect: (day: CalendarDay) => void;
}>) {
  const total = new Date(year, month + 1, 0).getDate();
  const leading = (new Date(year, month, 1).getDay() + 6) % 7;
  const cells: number[] = [
    ...Array.from({ length: leading }, (_, offset) => -offset),
    ...Array.from({ length: total }, (_, index) => index + 1),
  ];
  return (
    <section className="rounded-lg border border-line-soft p-3">
      <h3 className="mb-3 text-sm font-medium">{MONTHS[month]}</h3>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center font-mono text-[10px] text-fg-3">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((number) => {
          if (number <= 0)
            return (
              <span
                key={`blank-${year}-${month}-${number}`}
                aria-hidden="true"
              />
            );
          const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(number).padStart(2, "0")}`;
          const day = days.get(key);
          const strength = day
            ? Math.max(24, Math.round((day.scrobbles / max) * 100))
            : 0;
          const activeTextColor = strength >= 60 ? "text-on-accent" : "text-fg";
          return (
            <button
              key={key}
              type="button"
              disabled={!day}
              aria-pressed={selected === key}
              onClick={() => day && onSelect(day)}
              aria-label={
                day
                  ? `${dayLabel(key)}: ${day.scrobbles} прослушиваний`
                  : `${dayLabel(key)}: нет прослушиваний`
              }
              title={
                day
                  ? `${day.scrobbles} · ${day.top_artist}`
                  : "Нет прослушиваний"
              }
              className={`h-11 min-w-0 rounded-lg border font-mono text-xs transition-transform enabled:hover:scale-110 enabled:focus-visible:outline enabled:focus-visible:outline-2 enabled:focus-visible:outline-accent ${
                selected === key
                  ? "border-fg ring-2 ring-fg ring-offset-2 ring-offset-surface"
                  : "border-transparent"
              } ${day ? activeTextColor : "text-fg-3"}`}
              style={{
                background: day
                  ? `color-mix(in srgb, var(--accent) ${strength}%, var(--color-surface-2))`
                  : "var(--color-surface-2)",
              }}
            >
              {number}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function MusicCalendar({ username }: Readonly<{ username: string }>) {
  const currentYear = new Date().getFullYear();
  const [mode, setMode] = useState<"month" | "year">("month");
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(currentYear);
  const [calendar, setCalendar] = useState<ListeningCalendar | null>(null);
  const [selected, setSelected] = useState<CalendarDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(false);
    setCalendar(null);
    setSelected(null);
    fetch(`${API_URL}/api/stats/calendar/${username}?year=${year}`, {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Calendar request failed");
        return response.json();
      })
      .then((data: ListeningCalendar | null) => {
        if (!data || !active) return;
        setCalendar(data);
        setSelected(data.summary.best_day);
        if (data.summary.best_day)
          setMonth(Number(data.summary.best_day.date.slice(5, 7)) - 1);
      })
      .catch((requestError: unknown) => {
        if (active && !(requestError instanceof DOMException)) setError(true);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      controller.abort();
    };
  }, [username, year]);

  const dayMap = useMemo(
    () => new Map((calendar?.days ?? []).map((day) => [day.date, day])),
    [calendar],
  );
  const max = Math.max(1, ...(calendar?.days ?? []).map((d) => d.scrobbles));

  return (
    <section
      aria-labelledby="music-calendar-title"
      className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="music-calendar-title"
            className="flex items-center gap-2 text-base font-semibold"
          >
            <CalendarDays className="h-4 w-4 text-accent" aria-hidden="true" />
            Музыкальный календарь
          </h2>
          <p className="mt-1 text-xs text-fg-3">
            Нажмите на активный день, чтобы увидеть его итоги.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-fg-2">
          <span>Год</span>
          <select
            aria-label="Год календаря"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className="h-8 rounded-lg border border-line bg-bg px-2 font-mono text-xs text-fg outline-none"
          >
            {(calendar?.available_years ?? [currentYear]).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-fg-3">
          Собираем календарь…
        </p>
      ) : null}
      {!loading && error ? (
        <p className="rounded-lg border border-dashed border-line py-8 text-center text-sm text-fg-3">
          Не удалось загрузить календарь. Обновите страницу и попробуйте снова.
        </p>
      ) : null}
      {!loading && !error && (
        <>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line-soft bg-line-soft sm:grid-cols-4">
            {[
              ["активных дней", calendar?.summary.active_days ?? 0],
              ["прослушиваний", calendar?.summary.total_scrobbles ?? 0],
              ["минут музыки", calendar?.summary.total_minutes ?? 0],
              ["лучшая серия", `${calendar?.summary.longest_streak ?? 0} дн.`],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex flex-col-reverse bg-surface px-4 py-3"
              >
                <dt className="text-[11px] text-fg-3">{label}</dt>
                <dd className="font-mono text-lg">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented
              label="Вид календаря"
              value={mode}
              onChange={setMode}
              options={[
                { id: "month", label: "Месяц" },
                { id: "year", label: "Весь год" },
              ]}
            />
            {mode === "month" && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Предыдущий месяц"
                  disabled={month === 0}
                  className={btn.icon}
                  onClick={() => setMonth((value) => value - 1)}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <span
                  className="min-w-24 text-center text-sm font-medium"
                  aria-live="polite"
                >
                  {MONTHS[month]}
                </span>
                <button
                  type="button"
                  aria-label="Следующий месяц"
                  disabled={month === 11}
                  className={btn.icon}
                  onClick={() => setMonth((value) => value + 1)}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
          <div
            className={
              mode === "month" && selected
                ? "grid items-start gap-5 xl:grid-cols-2"
                : "space-y-5"
            }
          >
            <div
              className={
                mode === "year"
                  ? "grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3"
                  : "mx-auto w-full max-w-lg"
              }
            >
              {(mode === "year"
                ? MONTHS.map((_, index) => index)
                : [month]
              ).map((monthIndex) => (
                <Month
                  key={monthIndex}
                  year={year}
                  month={monthIndex}
                  days={dayMap}
                  max={max}
                  selected={selected?.date ?? null}
                  onSelect={setSelected}
                />
              ))}
            </div>

            <div className="min-w-0 space-y-4">
              {selected ? (
                <div className="flex flex-col gap-4 rounded-lg border border-line bg-bg p-4 sm:flex-row sm:flex-wrap sm:items-center">
                  {selected.top_track.cover_url ? (
                    <img
                      src={getSafeUrl(
                        coverAt(selected.top_track.cover_url, 64),
                      )}
                      alt=""
                      className="h-16 w-16 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="h-16 w-16 rounded-lg bg-surface-2" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs capitalize text-fg-3">
                      {dayLabel(selected.date)}
                    </p>
                    <p className="mt-1 truncate text-base font-medium">
                      {selected.top_track.title}
                    </p>
                    <p className="truncate text-sm text-fg-2">
                      {selected.top_track.artist}
                    </p>
                  </div>
                  <dl className="grid w-full grid-cols-3 gap-3">
                    <div>
                      <dt className="text-[10px] text-fg-3">прослушивания</dt>
                      <dd className="font-mono text-base">
                        {formatNumber(selected.scrobbles)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-fg-3">минуты</dt>
                      <dd className="font-mono text-base">
                        {formatNumber(selected.minutes)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-fg-3">артисты</dt>
                      <dd
                        className="font-mono text-base"
                        title={plural(
                          selected.unique_artists,
                          "артист",
                          "артиста",
                          "артистов",
                        )}
                      >
                        {formatNumber(selected.unique_artists)}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-line py-8 text-center text-sm text-fg-3">
                  В этом году пока нет прослушиваний.
                </p>
              )}
              {selected && (
                <CalendarRange
                  key={`${username}-${selected.date}`}
                  username={username}
                  date={selected.date}
                />
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
