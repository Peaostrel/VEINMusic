"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { renderDescriptionWithLinks } from "@/app/lib/achievementText";
import type { AchievementInfo } from "@/app/lib/types";

const CARD_WIDTH = 320;
const SCREEN_GAP = 16;

function earnedDate(value: string | null | undefined): string | null {
  if (!value) return null;
  // The API sends UTC, sometimes without a zone suffix
  const iso = /(Z|[+-]\d\d:?\d\d)$/.test(value) ? value : `${value}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** The goal's link (a Yandex Music album, track or artist), if any. */
function targetUrl(a: AchievementInfo): string | null {
  const raw = a.rule_target?.includes("||")
    ? a.rule_target.split("||")[1]
    : a.rule_target;
  return raw?.startsWith("http") ? raw : null;
}

function Cover({ a, size }: Readonly<{ a: AchievementInfo; size: string }>) {
  return a.target_image ? (
    <img
      src={a.target_image}
      alt=""
      className={`${size} shrink-0 rounded-md object-cover`}
    />
  ) : (
    <span
      className={`${size} flex shrink-0 items-center justify-center rounded-md bg-surface-2 leading-none`}
      aria-hidden="true"
    >
      {a.icon}
    </span>
  );
}

/**
 * An achievement on the profile: hovering, focusing or tapping it opens a
 * card with the cover, the description (links work), the reward and the
 * date it was earned.
 */
export function AchievementChip({ a }: Readonly<{ a: AchievementInfo }>) {
  const [open, setOpen] = useState(false);
  // Horizontal shift of the card from the chip, keeping it on screen
  const [offsetX, setOffsetX] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  // A tap focuses (and hovers) the chip before its click: that click must
  // not close the card the same tap just opened
  const openedAt = useRef(0);
  const cardId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const show = () => {
    window.clearTimeout(closeTimer.current);
    const box = ref.current?.getBoundingClientRect();
    if (box) {
      const width = Math.min(CARD_WIDTH, window.innerWidth - 2 * SCREEN_GAP);
      const left = Math.min(
        Math.max(box.left, SCREEN_GAP),
        window.innerWidth - SCREEN_GAP - width,
      );
      setOffsetX(left - box.left);
    }
    if (!open) openedAt.current = Date.now();
    setOpen(true);
  };
  const hide = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  };

  const date = earnedDate(a.earned_at);
  const url = targetUrl(a);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={(e) => {
        if (!ref.current?.contains(e.relatedTarget as Node | null)) hide();
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={cardId}
        onClick={() => {
          if (open && Date.now() - openedAt.current > 400) setOpen(false);
          else show();
        }}
        className={`inline-flex h-8 items-center gap-2 rounded-md border px-2.5 transition-colors hover:bg-surface-2 ${open ? "border-accent/50 bg-surface-2" : "border-line"}`}
      >
        <Cover a={a} size="h-5 w-5 text-sm" />
        <span className="text-xs font-medium">{a.name}</span>
      </button>

      {open && (
        <dialog
          open
          id={cardId}
          aria-label={`Достижение «${a.name}»`}
          style={{ left: offsetX, right: "auto" }}
          className="absolute top-full z-40 m-0 mt-2 flex w-[min(320px,calc(100vw-32px))] flex-col gap-3 rounded-xl border border-line bg-surface p-4 text-fg shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
        >
          <div className="flex items-start gap-3">
            <Cover a={a} size="h-14 w-14 text-3xl" />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-accent">
                Достижение
              </span>
              <h4 className="text-[15px] font-semibold leading-snug text-fg">
                {a.name}
              </h4>
              {date && (
                <span className="font-mono text-[11px] text-fg-3">
                  получено {date}
                </span>
              )}
            </div>
          </div>

          {a.description && (
            <p className="text-[13px] leading-relaxed text-fg-2">
              {renderDescriptionWithLinks(
                a.description,
                a.rule_meta ?? null,
                a.rule_target ?? null,
                a.name,
              )}
            </p>
          )}

          {(a.reward_xp > 0 || url) && (
            <div className="flex items-center justify-between gap-3 border-t border-line-soft pt-3">
              {a.reward_xp > 0 ? (
                <span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[11px] font-medium text-accent">
                  +{a.reward_xp} XP
                </span>
              ) : (
                <span />
              )}
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-fg-2 hover:text-fg"
                >
                  {url.includes("music.yandex.")
                    ? "Открыть в Яндекс Музыке"
                    : "Открыть"}
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              )}
            </div>
          )}
        </dialog>
      )}
    </div>
  );
}
