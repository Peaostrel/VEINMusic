"use client";

import Link from "next/link";
import { Flame } from "lucide-react";
import { VerifiedBadge } from "@/components/UserBadges";
import { Meter } from "@/components/ui";
import { fallbackOnce } from "@/app/lib/img";
import { formatNumber, plural } from "@/app/lib/plural";
import type { getNextRankInfo } from "@/app/lib/ranks";
import type { AchievementInfo, MoodInfo, UserInfo } from "@/app/lib/types";

export interface ProfileHeaderSectionProps {
  u: UserInfo;
  username: string;
  fallbackAvatar: string;
  currentLevel: number;
  rankTitle: string;
  mood: MoodInfo | null;
  followers: number;
  following: number;
  openFollowModal: (type: string) => void;
  displayedAchs: AchievementInfo[];
  xpInCurrentLevel: number;
  nextRank: ReturnType<typeof getNextRankInfo>;
  totalScrobbles: number;
  actions: React.ReactNode;
}

function AchievementChip({ a }: Readonly<{ a: AchievementInfo }>) {
  const body = (
    <>
      {a.target_image ? (
        <img
          src={a.target_image}
          alt=""
          className="h-5 w-5 shrink-0 rounded object-cover"
        />
      ) : (
        <span className="text-sm leading-none" aria-hidden="true">
          {a.icon}
        </span>
      )}
      <span className="text-xs font-medium">{a.name}</span>
    </>
  );
  const title = [a.description, a.reward_xp > 0 ? `+${a.reward_xp} XP` : ""]
    .filter(Boolean)
    .join(" · ");
  const cls =
    "inline-flex h-8 items-center gap-2 rounded-md border border-line px-2.5 transition-colors hover:bg-surface-2";
  return a.rule_target?.startsWith("http") ? (
    <a
      href={a.rule_target}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={cls}
    >
      {body}
    </a>
  ) : (
    <span title={title} className={cls}>
      {body}
    </span>
  );
}

export function ProfileHeaderSection({
  u,
  username,
  fallbackAvatar,
  currentLevel,
  rankTitle,
  mood,
  followers,
  following,
  openFollowModal,
  displayedAchs,
  xpInCurrentLevel,
  nextRank,
  totalScrobbles,
  actions,
}: Readonly<ProfileHeaderSectionProps>) {
  const frame = u.avatar_frame
    ? `avatar-frame-wrapper avatar-frame-${u.avatar_frame}`
    : "";
  const numbers: {
    label: string;
    value: number;
    onClick?: () => void;
  }[] = [
    {
      label: plural(
        totalScrobbles,
        "прослушивание",
        "прослушивания",
        "прослушиваний",
      ),
      value: totalScrobbles,
    },
    {
      label: plural(followers, "подписчик", "подписчика", "подписчиков"),
      value: followers,
      onClick: () => openFollowModal("followers"),
    },
    {
      label: plural(following, "подписка", "подписки", "подписок"),
      value: following,
      onClick: () => openFollowModal("following"),
    },
    {
      label: `${plural(u.streak || 0, "день", "дня", "дней")} подряд`,
      value: u.streak || 0,
    },
  ];

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-6 border-b border-line-soft pb-7 md:flex-row md:items-start">
        <span className={`self-start ${frame}`}>
          <img
            src={u.avatar_url || fallbackAvatar}
            alt=""
            onError={fallbackOnce(fallbackAvatar)}
            className="h-24 w-24 rounded-full bg-surface-2 object-cover"
          />
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="flex items-center text-[28px] font-semibold leading-tight tracking-[-0.02em]">
              {u.display_name}
              <VerifiedBadge
                role={u.role}
                isVerified={u.is_verified}
                sizeClass="w-6 h-6"
              />
            </h1>
            <span className="font-mono text-[13px] text-fg-3">@{username}</span>
            {mood && (
              <span
                className="rounded border border-line px-1.5 py-px text-[11px] text-fg-2"
                title="Настроение по последним прослушиваниям"
              >
                {mood.mood}
              </span>
            )}
          </div>
          {u.bio && (
            <p className="max-w-[600px] whitespace-pre-line text-sm leading-relaxed text-fg-2">
              {u.bio}
            </p>
          )}
          <div className="mt-1 flex max-w-[460px] items-center gap-3">
            <span className="shrink-0 font-mono text-xs">
              ур. {currentLevel} · {rankTitle}
            </span>
            <Meter
              value={xpInCurrentLevel}
              max={100}
              height={4}
              className="flex-1"
            />
            <span className="shrink-0 font-mono text-xs text-fg-3">
              {xpInCurrentLevel} / 100 XP
            </span>
          </div>
          <p className="text-xs text-fg-3">
            {nextRank
              ? `Следующий ранг — ${nextRank.name}`
              : "Максимальный ранг"}
            {u.streak >= 7 && (
              <span className="ml-2 inline-flex items-center gap-1 text-accent">
                <Flame className="h-3 w-3" aria-hidden="true" />
                серия {u.streak} дней: +10% опыта
              </span>
            )}
          </p>
        </div>

        <div className="md:max-w-[340px] md:justify-end">{actions}</div>
      </header>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line-soft bg-line-soft sm:grid-cols-4">
        {numbers.map((n) => (
          <div
            key={n.label}
            className="flex flex-col-reverse gap-1 bg-bg px-5 py-4"
          >
            <dt className="text-xs text-fg-2">{n.label}</dt>
            <dd className="font-mono text-[22px] font-medium">
              {n.onClick ? (
                <button
                  type="button"
                  onClick={n.onClick}
                  className="rounded hover:text-accent"
                  aria-label={`${n.value} ${n.label} — показать список`}
                >
                  {formatNumber(n.value)}
                </button>
              ) : (
                formatNumber(n.value)
              )}
            </dd>
          </div>
        ))}
      </dl>

      {displayedAchs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {displayedAchs.map((a) => (
            <AchievementChip key={a.id} a={a} />
          ))}
          <Link
            href={`/user/${username}/achievements`}
            className="ml-1 text-xs text-fg-2 hover:text-fg"
          >
            Все достижения →
          </Link>
        </div>
      )}
      {displayedAchs.length === 0 && u.achievements?.length > 0 && (
        <Link
          href={`/user/${username}/achievements`}
          className="self-start text-xs text-fg-2 hover:text-fg"
        >
          Достижения · {u.achievements.length} →
        </Link>
      )}
    </div>
  );
}
