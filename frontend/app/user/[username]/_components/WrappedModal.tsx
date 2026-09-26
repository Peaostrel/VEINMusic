"use client";

import Dialog from "@/components/Dialog";
import { LogoTile, Wordmark } from "@/components/brand";
import { VerifiedBadge } from "@/components/UserBadges";
import { Meter, btn } from "@/components/ui";
import { fallbackOnce } from "@/app/lib/img";
import { formatNumber } from "@/app/lib/plural";
import type { ProfileViewProps } from "./useProfilePage";

/** Story-sized card to screenshot and share. */
export function WrappedModal({
  data,
  showWrapped,
  setShowWrapped,
  u,
  fallbackAvatar,
  currentLevel,
}: ProfileViewProps) {
  if (!showWrapped) return null;
  const artists = data.stats.top_artists?.slice(0, 5) ?? [];
  const max = artists[0]?.plays || 1;
  return (
    <Dialog label="Карточка профиля" onClose={() => setShowWrapped(false)}>
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-[600px] w-[360px] max-w-full flex-col justify-between rounded-2xl border border-line bg-surface p-7">
          <div className="flex flex-col items-center gap-3 text-center">
            <img
              src={u.avatar_url || fallbackAvatar}
              alt=""
              onError={fallbackOnce(fallbackAvatar)}
              className="h-24 w-24 rounded-full bg-surface-2 object-cover"
            />
            <h2 className="flex items-center justify-center text-2xl font-semibold tracking-[-0.02em]">
              {u.display_name}
              <VerifiedBadge role={u.role} isVerified={u.is_verified} />
            </h2>
            <span className="font-mono text-xs text-fg-3">
              ур. {currentLevel} ·{" "}
              {formatNumber(data.stats.total_scrobbles || 0)} прослушиваний
            </span>
          </div>

          <section className="flex flex-col gap-3">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.06em] text-fg-3">
              Любимые артисты
            </h3>
            <ol className="flex flex-col gap-3">
              {artists.map((a, i) => (
                <li
                  key={a.artist}
                  className="grid grid-cols-[16px_minmax(0,1fr)_40px] items-center gap-3"
                >
                  <span className="font-mono text-xs text-fg-3">{i + 1}</span>
                  <span className="flex min-w-0 flex-col gap-1.5">
                    <span className="truncate text-sm font-medium">
                      {a.artist}
                    </span>
                    <Meter value={a.plays} max={max} accent={i === 0} />
                  </span>
                  <span className="text-right font-mono text-xs text-fg-2">
                    {a.plays}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <div className="flex items-center justify-center gap-2">
            <LogoTile size={22} />
            <Wordmark className="text-sm" />
          </div>
        </div>
        <p className="text-center text-xs text-fg-3">
          Сделайте скриншот и поделитесь в сторис
        </p>
        <button
          type="button"
          onClick={() => setShowWrapped(false)}
          className={`${btn.secondary} ${btn.md}`}
        >
          Закрыть
        </button>
      </div>
    </Dialog>
  );
}
