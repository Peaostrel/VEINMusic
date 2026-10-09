"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { formatNumber } from "@/app/lib/plural";
import {
  goalProgress,
  goalUnit,
  useGoalSources,
  type Goal,
} from "@/app/lib/goals";
import { Meter } from "@/components/ui";

const SHOWN = 4;

function linkText(active: number): string {
  if (active === 0) return "Поставить цель →";
  return active > SHOWN ? `Все цели (${active}) →` : "Все цели →";
}

/** Active goals with progress, for the home page sidebar. */
export default function GoalsCard({
  username,
  goals,
  weekScrobbles,
}: Readonly<{
  username: string;
  goals: Goal[];
  weekScrobbles: number | null;
}>) {
  const sources = useGoalSources(username, goals);
  const progress = goalProgress({ ...sources, weekScrobbles });
  const active = goals.filter((g) => g.active);
  const done = active.filter((g) => progress[g.type] >= g.target).length;
  return (
    <section
      aria-labelledby="goals-title"
      className="flex flex-col gap-3.5 rounded-xl border border-line bg-surface p-5"
    >
      <div className="flex items-baseline justify-between">
        <h2 id="goals-title" className="text-sm font-semibold">
          Цели
        </h2>
        {active.length > 0 && (
          <span className="text-xs text-fg-3">
            выполнено {done} из {active.length}
          </span>
        )}
      </div>
      {active.length === 0 ? (
        <p className="text-[13px] text-fg-2">
          Поставьте цель на неделю или месяц: сколько слушать, сколько новых
          артистов открыть, сколько дней подряд не прерывать серию.
        </p>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {active.slice(0, SHOWN).map((goal) => {
            const value = progress[goal.type];
            const complete = value >= goal.target;
            return (
              <li key={goal.id} className="flex flex-col gap-1.5">
                <span className="flex min-w-0 items-center gap-1.5 text-[13px]">
                  {complete && (
                    <Check
                      className="h-3.5 w-3.5 shrink-0 text-ok"
                      aria-label="Выполнено"
                    />
                  )}
                  <span className="truncate">{goal.title}</span>
                </span>
                <Meter value={value} max={goal.target} />
                <span className="flex justify-between gap-3 text-xs text-fg-3">
                  <span>
                    <span className="tabular-nums text-fg-2">
                      {formatNumber(Math.min(value, goal.target))}
                    </span>{" "}
                    из{" "}
                    <span className="tabular-nums">
                      {formatNumber(goal.target)}
                    </span>{" "}
                    {goalUnit(goal.type, goal.target)}
                  </span>
                  <span className={`tabular-nums ${complete ? "text-ok" : ""}`}>
                    {Math.min(100, Math.floor((value / goal.target) * 100))}%
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/goals" className="text-[13px] text-accent">
        {linkText(active.length)}
      </Link>
    </section>
  );
}
