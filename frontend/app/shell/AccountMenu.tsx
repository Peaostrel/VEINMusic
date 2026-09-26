"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Award, LogOut, Shield, SlidersHorizontal, User } from "lucide-react";
import { Avatar } from "@/components/ui";
import { VerifiedBadge } from "@/components/UserBadges";
import { isStaff } from "./nav";
import type { NavUser } from "./types";

const itemClass =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-fg-2 transition-colors hover:bg-line hover:text-fg";

/**
 * Account button with a popover (profile, achievements, logout).
 * `variant="chip"` is the sidebar user row; `variant="avatar"` is the
 * compact phone header button, which also lists settings and admin.
 */
export default function AccountMenu({
  username,
  profile,
  onLogout,
  variant,
}: Readonly<{
  username: string;
  profile: NavUser | null;
  onLogout: () => void;
  variant: "chip" | "avatar";
}>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = profile?.display_name || username;
  const frame = profile?.avatar_frame
    ? `avatar-frame-wrapper avatar-frame-${profile.avatar_frame}`
    : "";
  const me = encodeURIComponent(username);
  const compact = variant === "avatar";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Меню аккаунта"
        aria-expanded={open}
        aria-controls="account-menu"
        className={
          compact
            ? "flex h-9 w-9 items-center justify-center rounded-full"
            : "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
        }
      >
        <span className={frame}>
          <Avatar
            src={profile?.avatar_url}
            seed={username}
            size={compact ? 30 : 32}
          />
        </span>
        {!compact && (
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-medium text-fg">
              {name}
            </span>
            <span className="truncate font-mono text-[11px] text-fg-3">
              ур. {profile?.level ?? 1}
            </span>
          </span>
        )}
      </button>
      {open && (
        <div
          id="account-menu"
          className={`absolute z-50 w-[240px] overflow-hidden rounded-xl border border-line bg-surface-2 shadow-[0_12px_32px_rgba(0,0,0,0.45)] ${
            compact
              ? "right-0 top-[calc(100%+8px)]"
              : "bottom-[calc(100%+8px)] left-0"
          }`}
        >
          <div className="border-b border-line px-4 py-3">
            <div className="flex items-center truncate text-sm font-medium text-fg">
              <span className="truncate">{name}</span>
              {profile && (
                <VerifiedBadge
                  role={profile.role}
                  isVerified={profile.is_verified}
                  sizeClass="w-4 h-4"
                />
              )}
            </div>
            <div className="font-mono text-xs text-fg-3">@{username}</div>
          </div>
          <nav aria-label="Аккаунт" className="flex flex-col p-1.5">
            <Link href={`/user/${me}`} onClick={close} className={itemClass}>
              <User className="h-4 w-4" aria-hidden="true" />
              Мой профиль
            </Link>
            <Link
              href={`/user/${me}/achievements`}
              onClick={close}
              className={itemClass}
            >
              <Award className="h-4 w-4" aria-hidden="true" />
              Достижения
            </Link>
            {compact && (
              <Link href="/settings" onClick={close} className={itemClass}>
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                Настройки
              </Link>
            )}
            {compact && isStaff(profile?.role) && (
              <Link href="/admin" onClick={close} className={itemClass}>
                <Shield className="h-4 w-4" aria-hidden="true" />
                Админка
              </Link>
            )}
          </nav>
          <div className="border-t border-line p-1.5">
            <button
              type="button"
              onClick={() => {
                close();
                onLogout();
              }}
              className={`${itemClass} w-full text-left hover:text-danger`}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Выйти
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
