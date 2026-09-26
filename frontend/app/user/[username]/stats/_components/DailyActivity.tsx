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

/** Scrobbles per day for the last two weeks. */
export function DailyActivity({
  activity,
}: Readonly<{ activity: Record<string, number> }>) {
  const dates = lastDays(14);
  const maxActivity = Math.max(...Object.values(activity).map(Number), 1);

  return (
    <section
      className="bg-[#121212]/70 p-6 rounded-2xl border border-white/5 shadow-xl"
      aria-labelledby="daily-activity"
    >
      <h2 id="daily-activity" className="text-xl font-black text-white mb-6">
        <span aria-hidden="true">📈</span> Активность (последние 14 дней)
      </h2>
      <ul className="h-40 flex items-end gap-2">
        {dates.map((date) => {
          const count = activity[date] || 0;
          const height = (count / maxActivity) * 100;
          const dayLabel = new Date(date).toLocaleDateString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
          });
          return (
            <li
              key={date}
              className="flex-1 flex flex-col justify-end items-center group relative h-full"
              aria-label={`${dayLabel}: ${count}`}
            >
              <div
                aria-hidden="true"
                className="absolute -top-8 opacity-0 group-hover:opacity-100 bg-[#222] text-white text-xs px-2 py-1 rounded transition-opacity border border-white/10 shadow-lg"
              >
                {count}
              </div>
              <div
                aria-hidden="true"
                className="w-full bg-[var(--accent)]/20 hover:bg-[var(--accent)]/50 rounded-t-sm transition-all duration-300 relative"
                style={{ height: `${Math.max(height, 2)}%` }}
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-[var(--accent)] rounded-t-sm"></div>
              </div>
              <div
                aria-hidden="true"
                className="text-[10px] text-gray-400 mt-2 font-mono"
              >
                {dayLabel}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
