"use client";

import { useEffect, useMemo, useState } from "react";
import { Pause, Play, Plus, Target, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/app/lib/api";
import { mergePreferences, storePreferences } from "@/app/lib/preferences";
import {
  GOAL_TYPES,
  goalProgress,
  goalUnit,
  type Goal,
  type GoalType,
} from "@/app/lib/goals";
import type { DetailedStats, UserInfo, UserPreferences } from "@/app/lib/types";
import {
  EmptyState,
  Loading,
  Meter,
  PageHeader,
  btn,
  input,
} from "@/components/ui";

export default function GoalsPage() {
  const router = useRouter();
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [week, setWeek] = useState<DetailedStats | null>(null);
  const [month, setMonth] = useState<DetailedStats | null>(null);
  const [profile, setProfile] = useState<UserInfo | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [newType, setNewType] = useState<GoalType>("weekly_scrobbles");
  const [newTarget, setNewTarget] = useState(50);

  useEffect(() => {
    const username = localStorage.getItem("username");
    if (!username) {
      router.replace("/auth");
      return;
    }
    Promise.all([
      fetch(`${API_URL}/api/profile/preferences`, { credentials: "include" }),
      fetch(
        `${API_URL}/api/detailed-stats/${encodeURIComponent(username)}?period=7d`,
        { credentials: "include" },
      ),
      fetch(
        `${API_URL}/api/detailed-stats/${encodeURIComponent(username)}?period=30d`,
        { credentials: "include" },
      ),
      fetch(`${API_URL}/api/user/${encodeURIComponent(username)}`, {
        credentials: "include",
      }),
    ])
      .then(async ([prefs, weekRes, monthRes, profileRes]) => {
        if (prefs.ok) setPreferences(mergePreferences(await prefs.json()));
        if (weekRes.ok) setWeek(await weekRes.json());
        if (monthRes.ok) setMonth(await monthRes.json());
        if (profileRes.ok) setProfile(await profileRes.json());
      })
      .catch(() => setStatus("Не удалось загрузить цели"))
      .finally(() => setLoading(false));
  }, [router]);

  const progress = useMemo(
    () =>
      goalProgress({
        weekScrobbles: week?.total_scrobbles,
        monthMinutes: month?.total_time_min,
        monthNewArtists: month?.new_artists,
        streak: profile?.streak,
      }),
    [week, month, profile],
  );

  const save = async (next: UserPreferences) => {
    setPreferences(next);
    try {
      const response = await fetch(`${API_URL}/api/profile/preferences`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (response.ok) {
        const saved = await response.json();
        setPreferences(saved);
        storePreferences(saved);
        setStatus("Цели сохранены");
      } else setStatus("Не удалось сохранить цели");
    } catch {
      setStatus("Не удалось сохранить цели");
    }
  };
  const add = () => {
    if (!preferences || preferences.goals.items.length >= 10) return;
    const template = GOAL_TYPES.find((item) => item.value === newType)!;
    const goal: Goal = {
      id: `${Date.now()}-${newType}`,
      type: newType,
      title: template.title,
      target: Math.max(1, newTarget),
      active: true,
    };
    void save({
      ...preferences,
      goals: { items: [...preferences.goals.items, goal] },
    });
  };
  const remove = (id: string) =>
    preferences &&
    void save({
      ...preferences,
      goals: {
        items: preferences.goals.items.filter((goal) => goal.id !== id),
      },
    });
  const update = (id: string, patch: Partial<Goal>) =>
    preferences &&
    void save({
      ...preferences,
      goals: {
        items: preferences.goals.items.map((goal) =>
          goal.id === id ? { ...goal, ...patch } : goal,
        ),
      },
    });

  if (loading || !preferences) return <Loading label="Загружаем цели…" />;
  return (
    <main className="mx-auto flex w-full max-w-[900px] flex-col gap-8 px-4 py-8 sm:px-8 lg:py-10">
      <PageHeader
        title="Музыкальные цели"
        subtitle="Личные ориентиры без соревнования с другими"
      />
      {status && (
        <output aria-live="polite" className="text-sm text-ok">
          {status}
        </output>
      )}
      <section className="grid gap-3">
        {preferences.goals.items.length === 0 ? (
          <EmptyState title="Целей пока нет">
            Создайте первую цель — прогресс посчитается по уже записанной
            истории.
          </EmptyState>
        ) : (
          preferences.goals.items.map((goal) => {
            const value = progress[goal.type];
            const done = goal.active && value >= goal.target;
            return (
              <article
                key={goal.id}
                className="rounded-xl border border-line bg-surface p-5"
              >
                <div className="flex items-start gap-4">
                  <span
                    className={`rounded-lg p-2 ${done ? "bg-ok-soft text-ok" : "bg-accent-soft text-accent"}`}
                  >
                    <Target className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <input
                      value={goal.title}
                      onChange={(event) =>
                        setPreferences({
                          ...preferences,
                          goals: {
                            items: preferences.goals.items.map((item) =>
                              item.id === goal.id
                                ? { ...item, title: event.target.value }
                                : item,
                            ),
                          },
                        })
                      }
                      onBlur={(event) =>
                        update(goal.id, {
                          title: event.target.value || "Музыкальная цель",
                        })
                      }
                      className="w-full bg-transparent text-sm font-semibold outline-none"
                    />
                    <p className="mt-1 text-xs text-fg-3">
                      {
                        GOAL_TYPES.find((item) => item.value === goal.type)
                          ?.label
                      }
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2 text-xs text-fg-2">
                        <span>Цель</span>
                        <input
                          type="number"
                          min={1}
                          max={100000}
                          value={goal.target}
                          onChange={(event) =>
                            setPreferences({
                              ...preferences,
                              goals: {
                                items: preferences.goals.items.map((item) =>
                                  item.id === goal.id
                                    ? {
                                        ...item,
                                        target: Math.min(
                                          100000,
                                          Math.max(
                                            1,
                                            Number(event.target.value) || 1,
                                          ),
                                        ),
                                      }
                                    : item,
                                ),
                              },
                            })
                          }
                          onBlur={(event) =>
                            update(goal.id, {
                              target: Math.min(
                                100000,
                                Math.max(1, Number(event.target.value) || 1),
                              ),
                            })
                          }
                          className={`${input} h-8 w-28 font-mono`}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          update(goal.id, { active: !goal.active })
                        }
                        className={`${btn.secondary} ${btn.sm}`}
                      >
                        {goal.active ? (
                          <Pause className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        {goal.active ? "Приостановить" : "Продолжить"}
                      </button>
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      <Meter
                        value={Math.min(value, goal.target)}
                        max={goal.target}
                        className="flex-1"
                      />
                      <span className="font-mono text-xs">
                        {value} / {goal.target}{" "}
                        <span className="font-sans text-fg-3">
                          {goalUnit(goal.type, goal.target)}
                        </span>
                      </span>
                    </div>
                    {done && (
                      <p className="mt-2 text-xs text-ok">Цель выполнена</p>
                    )}
                    {!goal.active && (
                      <p className="mt-2 text-xs text-fg-3">
                        Цель приостановлена
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(goal.id)}
                    aria-label="Удалить цель"
                    className="rounded p-2 text-fg-3 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold">Новая цель</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
          <select
            value={newType}
            onChange={(event) => {
              const type = event.target.value as GoalType;
              setNewType(type);
              setNewTarget(
                GOAL_TYPES.find((item) => item.value === type)?.defaultTarget ??
                  10,
              );
            }}
            className={`${input} h-10`}
          >
            {GOAL_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={100000}
            value={newTarget}
            onChange={(event) => setNewTarget(Number(event.target.value))}
            aria-label="Целевое значение"
            className={`${input} h-10 font-mono`}
          />
          <button
            type="button"
            onClick={add}
            disabled={preferences.goals.items.length >= 10}
            className={`${btn.primary} ${btn.md}`}
          >
            <Plus className="h-4 w-4" />
            Добавить
          </button>
        </div>
      </section>
    </main>
  );
}
