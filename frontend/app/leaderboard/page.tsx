"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { VerifiedBadge } from "@/components/UserBadges";
import {
  Avatar,
  EmptyState,
  Loading,
  Meter,
  PageHeader,
  Segmented,
} from "@/components/ui";
import { API_URL } from "@/app/lib/api";
import { formatNumber } from "@/app/lib/plural";
import { isValidUser } from "@/app/lib/theme";
import type { LeaderboardEntry, MyRank } from "@/app/lib/types";

type Scope = "all" | "following";

function useBoard(scope: Scope, signedIn: boolean) {
  const [users, setUsers] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (scope === "following" && !signedIn) return;
    const path =
      scope === "following" ? "/api/leaderboard/following" : "/api/leaderboard";
    let cancelled = false;
    fetch(`${API_URL}${path}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setUsers(Array.isArray(data) ? data : []);
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, signedIn]);
  return { users, loading, setLoading };
}

function Podium({
  users,
  me,
}: Readonly<{ users: LeaderboardEntry[]; me: string | null }>) {
  return (
    <ol aria-label="Первые места" className="grid gap-3 sm:grid-cols-3">
      {users.map((u, i) => (
        <li key={u.username}>
          <Link
            href={`/user/${u.username}`}
            className={`flex h-full flex-col gap-4 rounded-xl border bg-surface p-5 transition-colors hover:bg-surface-2 ${
              i === 0 ? "border-accent" : "border-line"
            }`}
          >
            <div className="flex items-center justify-between font-mono text-xs">
              <span className={i === 0 ? "text-accent" : "text-fg-2"}>
                #{u.rank}
              </span>
              <span className="text-fg-3">ур. {u.level}</span>
            </div>
            <div className="flex items-center gap-3">
              <Avatar src={u.avatar_url} seed={u.username} size={44} />
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center truncate text-[15px] font-semibold">
                  <span className="truncate">{u.display_name}</span>
                  <VerifiedBadge
                    role={u.role}
                    isVerified={u.is_verified}
                    sizeClass="w-4 h-4"
                  />
                </span>
                <span className="truncate font-mono text-xs text-fg-3">
                  @{u.username}
                  {u.username === me ? " · вы" : ""}
                </span>
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-medium">
                {formatNumber(u.total_xp)}
              </span>
              <span className="text-xs text-fg-2">XP</span>
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}

function Rows({
  users,
  top,
  me,
}: Readonly<{ users: LeaderboardEntry[]; top: number; me: string | null }>) {
  return (
    <ol aria-label="Остальные места" className="border-t border-line-soft">
      {users.map((u) => {
        const mine = u.username === me;
        return (
          <li
            key={u.username}
            className={`grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-4 border-b border-line-soft px-3 py-2.5 md:grid-cols-[40px_minmax(0,1fr)_64px_180px_90px] ${
              mine ? "bg-surface shadow-[inset_2px_0_0_var(--accent)]" : ""
            }`}
          >
            <span className="font-mono text-[13px] text-fg-3">#{u.rank}</span>
            <Link
              href={`/user/${u.username}`}
              className="flex min-w-0 items-center gap-3"
            >
              <Avatar src={u.avatar_url} seed={u.username} size={32} />
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center truncate text-sm font-medium">
                  <span className="truncate">{u.display_name}</span>
                  <VerifiedBadge
                    role={u.role}
                    isVerified={u.is_verified}
                    sizeClass="w-3.5 h-3.5"
                  />
                  {mine && (
                    <span className="ml-2 font-mono text-[11px] text-accent">
                      это вы
                    </span>
                  )}
                </span>
                <span className="truncate font-mono text-[11px] text-fg-3">
                  @{u.username}
                </span>
              </span>
            </Link>
            <span className="hidden font-mono text-xs text-fg-2 md:block">
              ур. {u.level}
            </span>
            <Meter
              value={u.total_xp}
              max={top}
              accent={mine}
              className="hidden md:block"
            />
            <span className="text-right font-mono text-[13px]">
              {formatNumber(u.total_xp)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function MyPlace({ rank }: Readonly<{ rank: MyRank | null }>) {
  if (!rank?.rank) return null;
  return (
    <section
      aria-labelledby="me-title"
      className="flex flex-col gap-3.5 rounded-xl border border-line bg-surface p-5"
    >
      <h2 id="me-title" className="text-sm font-semibold">
        Ваше место
      </h2>
      <div className="flex items-baseline gap-2.5">
        <span className="font-mono text-4xl font-medium">#{rank.rank}</span>
        <span className="text-[13px] text-fg-2">
          из {formatNumber(rank.total)}
        </span>
      </div>
      {rank.ahead ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between gap-3 text-xs text-fg-2">
            <span className="truncate">
              до #{rank.rank - 1} — {rank.ahead.display_name}
            </span>
            <span className="shrink-0 font-mono">
              {formatNumber(rank.ahead.gap_xp)} XP
            </span>
          </div>
          <Meter
            value={rank.total_xp}
            max={rank.total_xp + rank.ahead.gap_xp}
            height={4}
          />
        </div>
      ) : (
        <p className="text-xs text-fg-2">Вы на первом месте. Держитесь.</p>
      )}
      <p className="text-xs text-fg-3">
        Опыт копится за каждый дослушанный трек.
      </p>
    </section>
  );
}

const rules: [string, React.ReactNode][] = [
  ["xp", "Опыт даётся за трек, дослушанный до 85% длины."],
  ["level", "Каждые 100 XP — новый уровень."],
  [
    "ban",
    <>
      Накрутка прослушиваний — бан, см.{" "}
      <Link href="/terms" className="underline underline-offset-2">
        условия
      </Link>
      {"."}
    </>,
  ],
];

export default function Leaderboard() {
  const [me, setMe] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("all");
  const [myRank, setMyRank] = useState<MyRank | null>(null);
  const { users, loading, setLoading } = useBoard(scope, Boolean(me));

  useEffect(() => {
    const u = localStorage.getItem("username");
    if (!isValidUser(u)) return;
    setMe(u);
    fetch(`${API_URL}/api/leaderboard/me`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then(setMyRank)
      .catch(() => {});
  }, []);

  const podium = users.slice(0, 3);
  const rest = users.slice(3);
  const top = users[0]?.total_xp || 1;

  let body: React.ReactNode;
  if (loading) body = <Loading label="Считаем опыт…" />;
  else if (users.length === 0)
    body =
      scope === "following" ? (
        <EmptyState title="Тут пока только вы">
          Подпишитесь на друзей, чтобы соревноваться с ними.
        </EmptyState>
      ) : (
        <EmptyState title="Никто ещё не слушал музыку">
          Будьте первым.
        </EmptyState>
      );
  else
    body = (
      <>
        <Podium users={podium} me={me} />
        {rest.length > 0 && <Rows users={rest} top={top} me={me} />}
      </>
    );

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-10 px-4 py-8 sm:px-8 lg:flex-row lg:px-12 lg:py-10">
      <section className="flex min-w-0 flex-1 flex-col gap-6">
        <PageHeader
          title="Топ слушателей"
          subtitle="По опыту за всё время · обновляется раз в минуту"
          actions={
            me ? (
              <Segmented
                label="Кого показывать"
                value={scope}
                onChange={(v) => {
                  setLoading(true);
                  setScope(v);
                }}
                options={[
                  { id: "all", label: "Все" },
                  { id: "following", label: "Подписки" },
                ]}
              />
            ) : undefined
          }
        />
        {body}
      </section>

      <aside className="flex w-full shrink-0 flex-col gap-5 lg:w-[300px] lg:pt-[70px]">
        <MyPlace rank={myRank} />
        <section aria-labelledby="xp-title" className="flex flex-col gap-3">
          <h2 id="xp-title" className="text-sm font-semibold">
            Как считается опыт
          </h2>
          <ol className="flex flex-col gap-2.5 text-[13px] leading-normal text-fg-2">
            {rules.map(([id, r], i) => (
              <li key={id} className="grid grid-cols-[22px_1fr] gap-2">
                <span className="font-mono text-fg-3">0{i + 1}</span>
                <span>{r}</span>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
}
