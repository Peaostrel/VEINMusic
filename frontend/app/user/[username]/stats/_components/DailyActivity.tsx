import { BarStrip } from "@/components/StatsCharts";

/** Local YYYY-MM-DD dates of the last `days` days, oldest first. */
function lastDays(days: number): string[] {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
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
}: Readonly<{ activity: Record<string, number>; days: number }>) {
  const data: Record<string, number> = {};
  for (const date of lastDays(days)) {
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
      <div className="flex items-baseline justify-between">
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
