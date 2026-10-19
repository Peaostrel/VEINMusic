"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowDown, ArrowUp, Eye, EyeOff } from "lucide-react";
import { API_URL, apiJson } from "@/app/lib/api";
import { Avatar, EmptyState, Loading, Meter, btn } from "@/components/ui";
import StatusText from "@/components/StatusText";
import type { AchievementInfo } from "@/app/lib/types";
import {
  formatAchievementDate,
  renderDescriptionWithLinks,
} from "@/app/lib/achievementText";
import { AchievementTrackProgress } from "./_components/AchievementTrackProgress";
import { coverAt } from "@/app/lib/coverSize";

/** GET /api/achievements/all/{username} */
interface AchievementsResponse {
  user: { username: string; display_name: string; avatar_url: string | null };
  achievements: AchievementInfo[];
  earned_count: number;
  total_count: number;
}

function showcaseGroup(achievement: AchievementInfo) {
  if (!achievement.is_earned) return 2;
  return achievement.is_displayed ? 0 : 1;
}

function showcaseButtonLabel(
  saving: boolean,
  displayed: boolean,
  showcaseFull: boolean,
) {
  if (saving) return "Сохраняем…";
  if (displayed) return "Убрать из профиля";
  return showcaseFull ? "Лимит 6" : "Показать в профиле";
}

interface AchievementCardProps {
  achievement: AchievementInfo;
  username: string;
  isOwner: boolean;
  saving: boolean;
  showcaseFull: boolean;
  firstDisplayed: boolean;
  lastDisplayed: boolean;
  onMove: (achievementId: number, direction: -1 | 1) => void;
  onToggle: (achievement: AchievementInfo) => void;
}

function AchievementCard({
  achievement,
  username,
  isOwner,
  saving,
  showcaseFull,
  firstDisplayed,
  lastDisplayed,
  onMove,
  onToggle,
}: Readonly<AchievementCardProps>) {
  const currentVal = achievement.current_progress || 0;
  const targetVal = Number(achievement.target_value) || 1;
  const showProgress =
    !achievement.is_earned &&
    achievement.rule_type !== "manual" &&
    targetVal > 0;
  return (
    <li
      className={`flex flex-col gap-3 rounded-xl border p-4 ${
        achievement.is_earned ? "border-line bg-surface" : "border-line-soft"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2 text-2xl ${achievement.is_earned ? "" : "opacity-40 grayscale"}`}
        >
          {achievement.target_image ? (
            <img
              src={coverAt(achievement.target_image, 44)}
              loading="lazy"
              className="h-full w-full object-cover"
              alt=""
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <span aria-hidden="true">{achievement.icon}</span>
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3
              className={`text-sm font-medium ${achievement.is_earned ? "text-fg" : "text-fg-2"}`}
            >
              {achievement.name}
            </h3>
            <span
              className={`shrink-0 font-mono text-[11px] ${achievement.is_earned ? "text-accent" : "text-fg-3"}`}
            >
              {achievement.is_earned
                ? (formatAchievementDate(achievement.earned_at) ?? "Получено")
                : "Заблокировано"}
            </span>
          </div>
          <p className="text-[13px] leading-relaxed text-fg-2">
            {renderDescriptionWithLinks(
              achievement.description || "",
              achievement.rule_meta ?? null,
              achievement.rule_target ?? null,
              achievement.name,
            )}
          </p>
        </div>
      </div>
      {showProgress && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between font-mono text-[11px] text-fg-3">
            <span>прогресс</span>
            <span>
              {currentVal} / {targetVal}
            </span>
          </div>
          <Meter value={currentVal} max={targetVal} accent={false} />
          {achievement.track_progress_available &&
            (achievement.rule_type === "specific_album" ||
              achievement.rule_type === "specific_artist") && (
              <AchievementTrackProgress
                username={username}
                achievementId={achievement.id}
                remaining={Math.max(targetVal - currentVal, 0)}
                kind={
                  achievement.rule_type === "specific_artist"
                    ? "artist"
                    : "album"
                }
              />
            )}
        </div>
      )}
      {isOwner && achievement.is_earned && (
        <div className="flex gap-2">
          {achievement.is_displayed && (
            <>
              <button
                type="button"
                aria-label="Поднять"
                className={`${btn.secondary} ${btn.sm}`}
                disabled={firstDisplayed}
                onClick={() => onMove(achievement.id, -1)}
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Опустить"
                className={`${btn.secondary} ${btn.sm}`}
                disabled={lastDisplayed}
                onClick={() => onMove(achievement.id, 1)}
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            </>
          )}
          <button
            type="button"
            className={`${btn.secondary} ${btn.sm} flex-1`}
            aria-pressed={Boolean(achievement.is_displayed)}
            disabled={saving || (!achievement.is_displayed && showcaseFull)}
            onClick={() => onToggle(achievement)}
          >
            {achievement.is_displayed ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
            {showcaseButtonLabel(
              saving,
              Boolean(achievement.is_displayed),
              showcaseFull,
            )}
          </button>
        </div>
      )}
      <span className="mt-auto font-mono text-[11px] text-fg-3">
        есть у {achievement.rarity ?? 0}% слушателей
        {achievement.reward_xp > 0 ? ` · +${achievement.reward_xp} XP` : ""}
      </span>
    </li>
  );
}

export default function AchievementsPage() {
  const { username } = useParams<{ username: string }>();
  const [data, setData] = useState<AchievementsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [pending, setPending] = useState<Set<number>>(() => new Set());
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setIsOwner(localStorage.getItem("username") === username);
  }, [username]);

  const load = useCallback(async () => {
    if (!username) return;
    try {
      const res = await fetch(`${API_URL}/api/achievements/all/${username}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Not found or Server Error");
      setData(await res.json());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    void load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [load]);

  const toggleDisplayed = async (achievement: AchievementInfo) => {
    if (!achievement.is_earned || pending.has(achievement.id)) return;
    const previous = Boolean(achievement.is_displayed);
    setMessage(null);
    setPending((current) => new Set(current).add(achievement.id));
    setData((current) =>
      current
        ? {
            ...current,
            achievements: current.achievements.map((item) =>
              item.id === achievement.id
                ? { ...item, is_displayed: !previous }
                : item,
            ),
          }
        : current,
    );
    try {
      const result = await apiJson<{
        is_displayed: boolean;
        display_order: number | null;
      }>("/api/profile/achievements/toggle", {
        method: "POST",
        json: { achievement_id: achievement.id },
      });
      setData((current) =>
        current
          ? {
              ...current,
              achievements: current.achievements.map((item) =>
                item.id === achievement.id
                  ? {
                      ...item,
                      is_displayed: result.is_displayed,
                      display_order: result.display_order,
                    }
                  : item,
              ),
            }
          : current,
      );
      setMessage(
        result.is_displayed
          ? "✅ Достижение добавлено в профиль"
          : "✅ Достижение скрыто из профиля",
      );
      globalThis.dispatchEvent(new Event("profile_update"));
    } catch {
      setData((current) =>
        current
          ? {
              ...current,
              achievements: current.achievements.map((item) =>
                item.id === achievement.id
                  ? { ...item, is_displayed: previous }
                  : item,
              ),
            }
          : current,
      );
      setMessage("❌ Не удалось изменить отображение достижения");
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(achievement.id);
        return next;
      });
    }
  };

  const displayedAchievements = (data?.achievements ?? [])
    .filter((item) => item.is_earned && item.is_displayed)
    .sort(
      (left, right) =>
        (left.display_order ?? Number.MAX_SAFE_INTEGER) -
        (right.display_order ?? Number.MAX_SAFE_INTEGER),
    );

  const orderedAchievements = [...(data?.achievements ?? [])].sort(
    (left, right) => {
      const leftGroup = showcaseGroup(left);
      const rightGroup = showcaseGroup(right);
      if (leftGroup !== rightGroup) return leftGroup - rightGroup;
      if (leftGroup === 0) {
        return (
          (left.display_order ?? Number.MAX_SAFE_INTEGER) -
          (right.display_order ?? Number.MAX_SAFE_INTEGER)
        );
      }
      return right.id - left.id;
    },
  );

  const moveDisplayed = async (achievementId: number, direction: -1 | 1) => {
    const oldOrder = displayedAchievements.map((item) => item.id);
    const index = oldOrder.indexOf(achievementId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= oldOrder.length) return;
    const nextOrder = [...oldOrder];
    [nextOrder[index], nextOrder[target]] = [
      nextOrder[target],
      nextOrder[index],
    ];
    const orderById = new Map(
      nextOrder.map((itemId, position) => [itemId, position]),
    );
    setData((current) =>
      current
        ? {
            ...current,
            achievements: current.achievements.map((item) => {
              const nextPosition = orderById.get(item.id);
              return {
                ...item,
                display_order: nextPosition ?? item.display_order,
              };
            }),
          }
        : current,
    );
    try {
      await apiJson("/api/profile/achievements/reorder", {
        method: "POST",
        json: { achievement_ids: nextOrder },
      });
      globalThis.dispatchEvent(new Event("profile_update"));
    } catch {
      setMessage("❌ Не удалось сохранить порядок");
      void load();
    }
  };

  if (loading) return <Loading label="Загружаем достижения…" />;

  if (error || !data?.user)
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">Не удалось загрузить</h1>
        <p className="text-sm text-fg-2">
          Пользователь не найден или сервер не ответил.
        </p>
        <Link href="/" className={`${btn.secondary} ${btn.md} mt-4`}>
          На главную
        </Link>
      </div>
    );

  const progressPercent =
    data.total_count > 0 ? (data.earned_count / data.total_count) * 100 : 0;

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-7 px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
      <header className="flex flex-col gap-3">
        <Link
          href={`/user/${username}`}
          className="self-start text-[13px] text-fg-2 hover:text-fg"
        >
          ← Профиль
        </Link>
        <div className="flex items-center gap-4">
          <Avatar
            src={data.user.avatar_url}
            seed={String(username)}
            size={48}
          />
          <div className="flex flex-col">
            <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">
              {data.user.display_name}
            </h1>
            <span className="text-sm text-fg-2">
              Достижения ·{" "}
              <span className="font-mono text-fg-3">@{data.user.username}</span>
            </span>
          </div>
        </div>
      </header>

      <section
        aria-label="Прогресс"
        className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5"
      >
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-sm text-fg-2">
            Получено{" "}
            <span className="font-mono text-fg">{data.earned_count}</span> из{" "}
            <span className="font-mono text-fg">{data.total_count}</span>
          </p>
          <span className="font-mono text-2xl font-medium">
            {Math.round(progressPercent)}%
          </span>
        </div>
        <Meter value={progressPercent} height={4} />
        <progress
          className="sr-only"
          aria-label="Прогресс достижений"
          max={100}
          value={Math.round(progressPercent)}
        />
      </section>

      {isOwner && (
        <div className="-mt-3 flex min-h-5 items-center">
          <StatusText text={message} />
        </div>
      )}

      {data.achievements.length === 0 && (
        <EmptyState title="Достижений пока нет">
          Администраторы ещё не завели ни одного достижения.
        </EmptyState>
      )}

      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {orderedAchievements.map((achievement) => (
          <AchievementCard
            key={achievement.id}
            achievement={achievement}
            username={data.user.username}
            isOwner={isOwner}
            saving={pending.has(achievement.id)}
            showcaseFull={displayedAchievements.length >= 6}
            firstDisplayed={displayedAchievements[0]?.id === achievement.id}
            lastDisplayed={displayedAchievements.at(-1)?.id === achievement.id}
            onMove={(achievementId, direction) =>
              void moveDisplayed(achievementId, direction)
            }
            onToggle={(item) => void toggleDisplayed(item)}
          />
        ))}
      </ul>
    </div>
  );
}
