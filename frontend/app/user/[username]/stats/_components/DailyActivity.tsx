import { BarStrip } from "@/components/StatsCharts";

/** YYYY-MM-DD dates ending at the API-provided profile-local date. */
function lastDays(days: number, endDate?: string | null): string[] {
  const dates: string[] = [];
  const anchor = endDate ? new Date(`${endDate}T12:00:00`) : new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(anchor);
    d.setDate(d.getDate() - i);
    dates.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
  }
  return dates;
}

/** Scrobbles per day for the last `days` days; today in the accent. */
export function DailyActivity({
  activity,
  days,
  endDate,
}: Readonly<{
  activity: Record<string, number>;
  days: number;
  endDate?: string | null;
}>) {
  const data: Record<string, number> = {};
  for (const date of lastDays(days, endDate)) {
    const label = new Date(`${date}T00:00:00`).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
    });
    data[label] = activity[date] || 0;
  }
  const today = Object.keys(data).at(-1);
  return (
    <section
      aria-labelledby="daily-activity"
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="daily-activity" className="text-base font-semibold">
          Прослушивания по дням
        </h2>
        <span className="font-mono text-xs text-fg-3">
          последние {days} дн.
        </span>
      </div>
      <BarStrip
        data={data}
        label="Прослушивания по дням"
        highlight={today}
        height={180}
        labelEvery={days > 14 ? 5 : 1}
      />
    </section>
  );
}
