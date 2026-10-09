/** Personal goals (stored in preferences) and how far along they are. */
import { useEffect, useState } from "react";
import { API_URL } from "./api";
import { plural } from "./plural";
import type { UserPreferences } from "./types";

export type Goal = UserPreferences["goals"]["items"][number];
export type GoalType = Goal["type"];

export const GOAL_TYPES: {
  value: GoalType;
  label: string;
  title: string;
  defaultTarget: number;
}[] = [
  {
    value: "weekly_scrobbles",
    label: "Прослушивания за неделю",
    title: "Музыкальная неделя",
    defaultTarget: 50,
  },
  {
    value: "monthly_minutes",
    label: "Минуты за месяц",
    title: "Месяц в музыке",
    defaultTarget: 1000,
  },
  {
    value: "new_artists",
    label: "Новые артисты за месяц",
    title: "Открыть новых артистов",
    defaultTarget: 10,
  },
  {
    value: "streak",
    label: "Серия дней",
    title: "Не прерывать серию",
    defaultTarget: 7,
  },
];

/** The numbers goals are measured against (any may be missing). */
export interface GoalSources {
  /** Plays in the last 7 days. */
  weekScrobbles?: number | null;
  /** Minutes and new artists in the last 30 days. */
  monthMinutes?: number | null;
  monthNewArtists?: number | null;
  streak?: number | null;
}

export function goalProgress(s: GoalSources): Record<GoalType, number> {
  return {
    weekly_scrobbles: s.weekScrobbles ?? 0,
    monthly_minutes: s.monthMinutes ?? 0,
    new_artists: s.monthNewArtists ?? 0,
    streak: s.streak ?? 0,
  };
}

/** «прослушиваний», «минут», «артистов», «дней» for a goal's target. */
export function goalUnit(type: GoalType, n: number): string {
  switch (type) {
    case "weekly_scrobbles":
      return plural(n, "прослушивание", "прослушивания", "прослушиваний");
    case "monthly_minutes":
      return plural(n, "минута", "минуты", "минут");
    case "new_artists":
      return plural(n, "артист", "артиста", "артистов");
    case "streak":
      return plural(n, "день", "дня", "дней");
  }
}

const json = (url: string) =>
  fetch(url, { credentials: "include" })
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);

/**
 * Month statistics and the streak, loaded only when an active goal needs
 * them (the week's plays usually come from the page already).
 */
export function useGoalSources(
  username: string | null,
  goals: Goal[],
): Omit<GoalSources, "weekScrobbles"> | null {
  const active = goals.filter((g) => g.active);
  const needMonth = active.some(
    (g) => g.type === "monthly_minutes" || g.type === "new_artists",
  );
  const needStreak = active.some((g) => g.type === "streak");
  const [sources, setSources] = useState<Omit<
    GoalSources,
    "weekScrobbles"
  > | null>(null);
  useEffect(() => {
    if (!username || (!needMonth && !needStreak)) return;
    const q = encodeURIComponent(username);
    let cancelled = false;
    Promise.all([
      needMonth ? json(`${API_URL}/api/detailed-stats/${q}?period=30d`) : null,
      needStreak ? json(`${API_URL}/api/user/${q}`) : null,
    ])
      .then(([month, user]) => {
        if (cancelled) return;
        setSources({
          monthMinutes: month?.total_time_min ?? null,
          monthNewArtists: month?.new_artists ?? null,
          streak: user?.streak ?? null,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [username, needMonth, needStreak]);
  return sources;
}
