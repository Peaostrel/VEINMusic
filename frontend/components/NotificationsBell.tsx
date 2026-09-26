"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiJson } from "@/app/lib/api";
import type { NotificationList, SocialNotification } from "@/app/lib/types";
import { useVisiblePolling } from "@/app/lib/usePolling";

const POLL_MS = 60_000;
const KIND_ICON: Record<SocialNotification["kind"], string> = {
  like: "❤️",
  comment: "💬",
  follow: "👤",
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
export default function NotificationsBell() {
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
        className="relative text-gray-300 hover:text-[var(--accent-text)] transition p-2 rounded-lg hover:bg-white/5"
      >
        <span className="text-lg" aria-hidden="true">
          🔔
        </span>
        {data.unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center"
          >
            {data.unread > 99 ? "99+" : data.unread}
          </span>
        )}
      </button>

      {open && (
        <section
          aria-label="Уведомления"
          className="absolute right-0 top-[calc(100%+12px)] w-[320px] max-h-[420px] overflow-y-auto bg-[#222222] border border-white/10 rounded-2xl shadow-[0_15px_40px_rgba(0,0,0,0.6)] z-50"
        >
          <h2 className="px-4 py-3 text-sm font-bold text-white border-b border-white/5">
            Уведомления
          </h2>
          {data.items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-300 text-center">
              Пока ничего нет. Здесь появятся лайки, комментарии и новые
              подписчики.
            </p>
          ) : (
            <ul>
              {data.items.map((n) => (
                <li key={n.id}>
                  <Link
                    href={`/user/${n.actor.username}`}
                    onClick={() => setOpen(false)}
                    className={`flex gap-3 px-4 py-3 hover:bg-white/5 transition-colors ${n.is_read ? "" : "bg-white/[0.03]"}`}
                  >
                    <span className="text-lg shrink-0" aria-hidden="true">
                      {KIND_ICON[n.kind]}
                    </span>
                    <span className="min-w-0 text-sm">
                      <span className="block text-white break-words">
                        {n.text}
                      </span>
                      {n.message && (
                        <span className="block text-gray-300 text-xs mt-0.5 truncate">
                          «{n.message}»
                        </span>
                      )}
                      <span className="block text-gray-400 text-xs mt-0.5">
                        {timeAgo(n.created_at)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
