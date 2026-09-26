"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Heart, Megaphone, MessageCircle, UserPlus } from "lucide-react";
import { apiJson } from "@/app/lib/api";
import type { NotificationList, SocialNotification } from "@/app/lib/types";
import { useVisiblePolling } from "@/app/lib/usePolling";

const POLL_MS = 60_000;
const KIND_ICON: Record<SocialNotification["kind"], typeof Bell> = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  system: Megaphone,
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 60000),
  );
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return new Date(iso).toLocaleDateString("ru-RU");
}

/** Bell with the unread count and a dropdown of likes, comments and new followers. */
export default function NotificationsBell({
  align = "right",
}: Readonly<{ align?: "left" | "right" }>) {
  const [data, setData] = useState<NotificationList>({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      setData(await apiJson<NotificationList>("/api/me/notifications"));
    } catch {
      // signed out or backend unavailable: keep the last state
    }
  }, []);

  useVisiblePolling(load, POLL_MS);

  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, close]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && data.unread > 0) {
      try {
        await apiJson("/api/me/notifications/read", {
          method: "POST",
          json: { ids: null },
        });
        setData((prev) => ({
          unread: 0,
          items: prev.items.map((n) => ({ ...n, is_read: true })),
        }));
      } catch {
        // will be retried on the next open
      }
    }
  };

  const label =
    data.unread > 0
      ? `Уведомления: ${data.unread} непрочитанных`
      : "Уведомления";

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
        {data.unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-mono text-[10px] font-medium text-on-accent"
          >
            {data.unread > 99 ? "99+" : data.unread}
          </span>
        )}
      </button>

      {open && (
        <section
          aria-label="Уведомления"
          className={`absolute ${align === "left" ? "left-0" : "right-0"} top-[calc(100%+8px)] z-50 max-h-[420px] w-[320px] overflow-y-auto rounded-xl border border-line bg-surface-2 shadow-[0_12px_32px_rgba(0,0,0,0.45)]`}
        >
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-fg">
            Уведомления
          </h2>
          {data.items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-fg-2">
              Пока ничего нет. Здесь появятся лайки, комментарии и новые
              подписчики.
            </p>
          ) : (
            <ul>
              {data.items.map((n) => {
                const Icon = KIND_ICON[n.kind];
                return (
                  <li key={n.id}>
                    <Link
                      href={
                        n.kind === "system" ? "/" : `/user/${n.actor.username}`
                      }
                      onClick={() => setOpen(false)}
                      className={`flex gap-3 px-4 py-3 transition-colors hover:bg-line ${n.is_read ? "" : "bg-white/[0.03]"}`}
                    >
                      <Icon
                        className={`mt-0.5 h-4 w-4 shrink-0 ${n.is_read ? "text-fg-3" : "text-accent"}`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 text-sm">
                        <span className="block break-words text-fg">
                          {n.text}
                        </span>
                        {n.message && n.kind !== "system" && (
                          <span className="mt-0.5 block truncate text-xs text-fg-2">
                            «{n.message}»
                          </span>
                        )}
                        <span className="mt-0.5 block font-mono text-[11px] text-fg-3">
                          {timeAgo(n.created_at)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
