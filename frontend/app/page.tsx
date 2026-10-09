"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Heart, MessageCircle, Users } from "lucide-react";

import About from "./about/page";
import { API_URL } from "@/app/lib/api";
import { formatNumber, plural } from "@/app/lib/plural";
import { storedPreferences } from "@/app/lib/preferences";
import { isValidUser } from "@/app/lib/theme";
import type { TasteTwin, UserPreferences } from "@/app/lib/types";
import { useVisiblePolling } from "@/app/lib/usePolling";
import { sanitizeImageUrl } from "@/app/utils/sanitizeUrl";
import { sourceLabel } from "@/utils/formatters";
import {
  Avatar,
  EmptyState,
  Meter,
  PageHeader,
  PlayingBars,
  Segmented,
} from "@/components/ui";

const FEED_POLL_MS = 15000;
const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

interface FeedItem {
  id: number;
  username: string;
  avatar_url?: string | null;
  cover_url?: string;
  source: string;
  title: string;
  artist: string;
  relative_time?: string;
  likes_count: number;
  comments_count: number;
  listening_with?: string[];
  is_playing?: boolean;
  can_like?: boolean;
  can_comment?: boolean;
}

interface WeekStats {
  total_scrobbles: number;
  total_time_min: number;
  unique_artists: number;
  unique_tracks: number;
  activity_graph: Record<string, number>;
}

type FeedTab = "global" | "friends";

interface IntegrationSummary {
  services: {
    id: string;
    linked: boolean;
    user_enabled: boolean;
    admin_enabled: boolean;
  }[];
  auto_sync: boolean;
}

function sourceIsHidden(source: string, hiddenSources: string[]): boolean {
  const normalized = source.toLowerCase();
  return hiddenSources.some((hidden) => {
    if (hidden === "desktop")
      return normalized.includes("desktop") || normalized.includes("app");
    return normalized.includes(hidden);
  });
}

function Cover({ src }: Readonly<{ src?: string }>) {
  const url = sanitizeImageUrl(src);
  return url ? (
    <img src={url} alt="" className="h-12 w-12 rounded object-cover" />
  ) : (
    <span className="block h-12 w-12 rounded bg-surface-2" />
  );
}

function FeedRow({
  item,
  liked,
  onLike,
}: Readonly<{ item: FeedItem; liked: boolean; onLike: () => void }>) {
  return (
    <li className="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 border-b border-line-soft px-1 py-3.5 sm:grid-cols-[48px_minmax(0,1fr)_170px_110px]">
      <Cover src={item.cover_url} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          {item.is_playing && (
            <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-accent">
              <PlayingBars /> играет
            </span>
          )}
          <span className="truncate text-[15px] font-medium">{item.title}</span>
        </div>
        <span className="truncate text-[13px] text-fg-2">{item.artist}</span>
        {item.listening_with && item.listening_with.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-fg-3">
            <Users className="h-3 w-3" aria-hidden="true" />
            вместе с {item.listening_with[0]}
          </span>
        )}
      </div>
      <Link
        href={`/user/${item.username}`}
        className="col-start-2 flex min-w-0 items-center gap-2 sm:col-start-auto"
      >
        <Avatar src={item.avatar_url} seed={item.username} size={28} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px]">{item.username}</span>
          <span className="truncate font-mono text-[11px] text-fg-3">
            {sourceLabel(item.source)}
            {item.relative_time ? ` · ${item.relative_time}` : ""}
          </span>
        </span>
      </Link>
      <div className="col-start-2 flex gap-1 sm:col-start-auto sm:justify-end">
        <button
          type="button"
          onClick={onLike}
          disabled={item.can_like === false}
          aria-pressed={liked}
          aria-label={`Нравится: ${item.likes_count || 0}`}
          title={
            item.can_like === false
              ? "Пользователь отключил реакции"
              : undefined
          }
          className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2 font-mono text-xs transition-colors hover:bg-surface-2 ${
            liked ? "text-accent" : "text-fg-2"
          } disabled:cursor-not-allowed disabled:opacity-35`}
        >
          <Heart
            className={`h-4 w-4 ${liked ? "fill-current" : ""}`}
            aria-hidden="true"
          />
          {item.likes_count || 0}
        </button>
        {item.can_comment === false ? (
          <span
            title="Пользователь отключил комментарии"
            className="inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-md px-2 font-mono text-xs text-fg-2 opacity-35"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            {item.comments_count || 0}
          </span>
        ) : (
          <Link
            href={`/user/${item.username}`}
            aria-label={`Комментарии: ${item.comments_count || 0}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 font-mono text-xs text-fg-2 transition-colors hover:bg-surface-2"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            {item.comments_count || 0}
          </Link>
        )}
      </div>
    </li>
  );
}

function YourWeek({
  username,
  stats,
}: Readonly<{ username: string; stats: WeekStats | null }>) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return {
      key,
      label: WEEKDAYS[d.getDay()],
      plays: stats?.activity_graph?.[key] ?? 0,
    };
  });
  const max = Math.max(1, ...days.map((d) => d.plays));
  const hours = Math.round((stats?.total_time_min ?? 0) / 60);
  const cells = [
    {
      value: formatNumber(stats?.total_scrobbles ?? 0),
      label: plural(
        stats?.total_scrobbles ?? 0,
        "прослушивание",
        "прослушивания",
        "прослушиваний",
      ),
    },
    { value: `${hours} ч`, label: "музыки" },
    {
      value: formatNumber(stats?.unique_artists ?? 0),
      label: plural(
        stats?.unique_artists ?? 0,
        "артист",
        "артиста",
        "артистов",
      ),
    },
    {
      value: formatNumber(stats?.unique_tracks ?? 0),
      label: plural(stats?.unique_tracks ?? 0, "трек", "трека", "треков"),
    },
  ];
  return (
    <section
      aria-labelledby="week-title"
      className="flex flex-col gap-3.5 rounded-xl border border-line bg-surface p-5"
    >
      <h2 id="week-title" className="text-sm font-semibold">
        Ваша неделя
      </h2>
      <dl className="grid grid-cols-2 gap-4">
        {cells.map((c) => (
          <div key={c.label} className="flex flex-col-reverse gap-0.5">
            <dt className="text-xs text-fg-2">{c.label}</dt>
            <dd className="font-mono text-2xl font-medium">{c.value}</dd>
          </div>
        ))}
      </dl>
      <div
        role="img"
        aria-label={
          "По дням: " + days.map((d) => d.label + " " + d.plays).join(", ")
        }
        className="flex h-12 items-end gap-1.5"
      >
        {days.map((d, i) => (
          <div key={d.key} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`w-full rounded-sm ${i === 6 ? "bg-accent" : "bg-bar"}`}
              style={{ height: Math.max(2, Math.round((d.plays / max) * 30)) }}
            />
            <span className="font-mono text-[10px] text-fg-3">{d.label}</span>
          </div>
        ))}
      </div>
      <Link
        href={`/user/${username}/stats`}
        className="text-[13px] text-accent"
      >
        Вся статистика →
      </Link>
    </section>
  );
}

function Twins({ twins }: Readonly<{ twins: TasteTwin[] }>) {
  return (
    <section aria-labelledby="twins-title" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 id="twins-title" className="text-sm font-semibold">
          Музыкальные двойники
        </h2>
        <span className="text-xs text-fg-3">по общим артистам</span>
      </div>
      <ul className="flex flex-col gap-2.5">
        {twins.map((t) => (
          <li key={t.username}>
            <Link
              href={`/user/${t.username}`}
              className="grid grid-cols-[32px_minmax(0,1fr)_44px] items-center gap-2.5 rounded-md"
            >
              <Avatar src={t.avatar_url} seed={t.username} size={32} />
              <span className="flex min-w-0 flex-col gap-1.5">
                <span className="truncate text-[13px]">
                  {t.display_name || t.username}{" "}
                  <span className="text-fg-3">
                    · {t.common_artists.slice(0, 2).join(", ")}
                  </span>
                </span>
                <Meter value={t.match} />
              </span>
              <span className="text-right font-mono text-[13px]">
                {t.match}%
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DashboardStatus({
  integrations,
  goals,
  week,
}: Readonly<{
  integrations: IntegrationSummary | null;
  goals: UserPreferences["goals"]["items"];
  week: WeekStats | null;
}>) {
  const connected =
    integrations?.services.filter((service) => service.linked) ?? [];
  const problems = connected.filter(
    (service) => !service.admin_enabled || !service.user_enabled,
  ).length;
  const weeklyGoal = goals.find(
    (goal) => goal.active && goal.type === "weekly_scrobbles",
  );
  let integrationMessage = "Проверяем подключения…";
  if (integrations) {
    if (connected.length === 0)
      integrationMessage = "Облачные сервисы пока не подключены";
    else if (problems)
      integrationMessage = `${problems} подключений требуют внимания`;
    else integrationMessage = `${connected.length} подключений работают`;
  }
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Состояние VEIN</h2>
        <Link
          href="/settings?tab=integrations"
          className="text-xs text-fg-3 hover:text-accent"
        >
          Интеграции →
        </Link>
      </div>
      <p className={`mt-3 text-sm ${problems ? "text-fg-2" : "text-ok"}`}>
        {integrationMessage}
      </p>
      {weeklyGoal ? (
        <Link
          href="/goals"
          className="mt-4 block border-t border-line-soft pt-4"
        >
          <span className="flex justify-between text-xs">
            <span>{weeklyGoal.title}</span>
            <span className="font-mono">
              {week?.total_scrobbles ?? 0} / {weeklyGoal.target}
            </span>
          </span>
          <Meter
            className="mt-2"
            value={week?.total_scrobbles ?? 0}
            max={weeklyGoal.target}
          />
        </Link>
      ) : (
        <Link
          href="/goals"
          className="mt-4 block border-t border-line-soft pt-4 text-xs text-fg-2 hover:text-accent"
        >
          Поставить музыкальную цель →
        </Link>
      )}
    </section>
  );
}

function SkeletonRows() {
  return (
    <ul aria-hidden="true" className="border-t border-line-soft">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <li
          key={i}
          className="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-4 border-b border-line-soft px-1 py-3.5"
        >
          <span className="h-12 w-12 animate-pulse rounded bg-surface-2" />
          <span className="flex flex-col gap-2">
            <span className="h-3 w-48 animate-pulse rounded bg-surface-2" />
            <span className="h-3 w-28 animate-pulse rounded bg-surface-2" />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function Home() {
  const [globalHistory, setGlobalHistory] = useState<FeedItem[]>([]);
  const [friendsHistory, setFriendsHistory] = useState<FeedItem[]>([]);
  const [twins, setTwins] = useState<TasteTwin[]>([]);
  const [week, setWeek] = useState<WeekStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFeed, setActiveFeed] = useState<FeedTab>("global");
  const [username, setUsername] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [hiddenSources, setHiddenSources] = useState<string[]>([]);
  const [goals, setGoals] = useState<UserPreferences["goals"]["items"]>([]);
  const [integrationSummary, setIntegrationSummary] =
    useState<IntegrationSummary | null>(null);

  useEffect(() => {
    const u = localStorage.getItem("username");
    const feed = storedPreferences().feed;
    setUsername(isValidUser(u) ? u : null);
    setActiveFeed(feed.default_scope === "following" ? "friends" : "global");
    setHiddenSources(feed.hidden_sources);
    setGoals(storedPreferences().goals.items);
    setChecked(true);

    const updatePreferences = () => {
      const next = storedPreferences();
      setActiveFeed(
        next.feed.default_scope === "following" ? "friends" : "global",
      );
      setHiddenSources(next.feed.hidden_sources);
      setGoals(next.goals.items);
    };
    globalThis.addEventListener("preferences_update", updatePreferences);
    return () =>
      globalThis.removeEventListener("preferences_update", updatePreferences);
  }, []);

  const fetchFeed = useCallback(async () => {
    const user = localStorage.getItem("username");
    if (!isValidUser(user)) return;
    try {
      if (activeFeed === "friends") {
        const res = await fetch(`${API_URL}/api/friends-history/${user}`, {
          credentials: "include",
        });
        const data = await res.json();
        setFriendsHistory(Array.isArray(data) ? data : []);
      } else {
        const res = await fetch(`${API_URL}/api/global-history`, {
          credentials: "include",
        });
        const data = await res.json();
        setGlobalHistory(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [activeFeed]);

  // Only the visible feed, only while the tab is shown
  useVisiblePolling(fetchFeed, FEED_POLL_MS, Boolean(username));

  // Taste twins and the week change slowly: load once
  useEffect(() => {
    if (!username) return;
    const q = encodeURIComponent(username);
    fetch(`${API_URL}/api/discovery/taste-twins?username=${q}`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => setTwins(Array.isArray(data) ? data : []))
      .catch((e) => console.error(e));
    fetch(`${API_URL}/api/detailed-stats/${q}?period=7d`, {
      credentials: "include",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then(setWeek)
      .catch(() => {});
    fetch(`${API_URL}/api/integrations/status`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then(setIntegrationSummary)
      .catch(() => {});
  }, [username]);

  const toggleLike = async (scrobbleId: number) => {
    const wasLiked = liked.has(scrobbleId);
    setLiked((prev) => {
      const next = new Set(prev);
      if (next.has(scrobbleId)) next.delete(scrobbleId);
      else next.add(scrobbleId);
      return next;
    });
    try {
      const response = await fetch(
        `${API_URL}/api/scrobble/${scrobbleId}/like`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        },
      );
      if (!response.ok) throw new Error("Реакции отключены");
      await fetchFeed();
    } catch (e) {
      console.error(e);
      setLiked((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.add(scrobbleId);
        else next.delete(scrobbleId);
        return next;
      });
    }
  };

  // Before localStorage is read (and on the server) render both: the
  // html[data-auth] flag set in <head> shows the right one without a flash.
  if (!checked)
    return (
      <>
        <div className="guest-only">
          <About />
        </div>
        <div className="auth-only mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-8 lg:px-12">
          <SkeletonRows />
        </div>
      </>
    );
  if (!username) return <About />;

  const currentFeed = (
    activeFeed === "global" ? globalHistory : friendsHistory
  ).filter((item) => !sourceIsHidden(item.source, hiddenSources));

  let feedBody: React.ReactNode;
  if (loading) feedBody = <SkeletonRows />;
  else if (currentFeed.length === 0)
    feedBody =
      activeFeed === "friends" ? (
        <EmptyState title="Тут пока пусто">
          Подпишитесь на кого-нибудь, чтобы видеть здесь их треки.
        </EmptyState>
      ) : (
        <EmptyState title="Пока тихо">
          Включите музыку — ваш трек появится здесь первым.
        </EmptyState>
      );
  else
    feedBody = (
      <ol className="border-t border-line-soft">
        {currentFeed.map((item) => (
          <FeedRow
            key={item.id}
            item={item}
            liked={liked.has(item.id)}
            onLike={() => toggleLike(item.id)}
          />
        ))}
      </ol>
    );

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-10 px-4 py-8 sm:px-8 lg:flex-row lg:px-12 lg:py-10">
      <section
        aria-labelledby="feed-title"
        className="flex min-w-0 flex-1 flex-col gap-5"
      >
        <PageHeader
          id="feed-title"
          title="Лента"
          subtitle="Что слушают прямо сейчас"
          actions={
            <Segmented
              label="Чья лента"
              value={activeFeed}
              onChange={(v) => {
                setLoading(true);
                setActiveFeed(v);
              }}
              options={[
                { id: "global", label: "Все" },
                { id: "friends", label: "Подписки" },
              ]}
            />
          }
        />
        {feedBody}
        <Link
          href="/feed"
          className="self-start text-[13px] text-fg-2 hover:text-fg"
        >
          Вся лента с фильтрами →
        </Link>
      </section>

      <aside className="flex w-full shrink-0 flex-col gap-6 lg:w-[320px] lg:pt-1.5">
        <DashboardStatus
          integrations={integrationSummary}
          goals={goals}
          week={week}
        />
        <YourWeek username={username} stats={week} />
        {twins.length > 0 && <Twins twins={twins} />}
      </aside>
    </div>
  );
}
