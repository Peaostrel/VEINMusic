"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  Flag,
  Heart,
  Megaphone,
  MessageCircle,
  UserPlus,
  CalendarRange,
  Trophy,
} from "lucide-react";
import { apiJson } from "@/app/lib/api";
import { useT } from "@/app/lib/i18n/client";
import type { Translator } from "@/app/lib/i18n/core";
import type { NotificationList, SocialNotification } from "@/app/lib/types";
import { useVisiblePolling } from "@/app/lib/usePolling";
import ReportDialog, { type ReportTarget } from "@/components/ReportDialog";

const POLL_MS = 60_000;
const KIND_ICON: Record<SocialNotification["kind"], typeof Bell> = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  system: Megaphone,
  security: Bell,
  moderation: Flag,
  recap: CalendarRange,
  achievement: Trophy,
};

function timeAgo(iso: string | null, t: Translator): string {
  if (!iso) return "";
  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 60000),
  );
  if (minutes < 1) return t("только что");
  if (minutes < 60) return t("{n} мин назад", { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("{n} ч назад", { n: hours });
  return new Date(iso).toLocaleDateString(t.locale);
}

/**
 * The notification's sentence. Likes, comments and follows are rebuilt from
 * their fields (the API composes them in Russian, the same way as here);
 * other kinds carry a fixed text from the server, translated if known.
 */
function notificationText(n: SocialNotification, t: Translator): string {
  const actor = n.actor.username;
  const target = n.track?.title
    ? t("«{title}»", { title: n.track.title })
    : t("ваше прослушивание");
  if (n.kind === "like")
    return t("{actor} оценил(а) {target}", { actor, target });
  if (n.kind === "comment")
    return t("{actor} прокомментировал(а) {target}", { actor, target });
  if (n.kind === "follow")
    return t("{actor} подписался(ась) на вас", { actor });
  return t(n.text);
}

function notificationHref(notification: SocialNotification): string {
  if (notification.kind === "security") return "/settings";
  if (notification.kind === "moderation") return "/admin?tab=reports";
  if (notification.kind === "system") return "/";
  if (notification.kind === "achievement")
    return `/user/${notification.actor.username}/achievements`;
  if (notification.kind === "recap")
    return `/user/${notification.actor.username}/stats`;
  return `/user/${notification.actor.username}`;
}

/** Bell with the unread count and a dropdown of likes, comments and new followers. */
export default function NotificationsBell({
  align = "right",
}: Readonly<{ align?: "left" | "right" }>) {
  const t = useT();
  const [data, setData] = useState<NotificationList>({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<ReportTarget | null>(null);
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
      ? t("Уведомления: {n} непрочитанных", { n: data.unread })
      : t("Уведомления");

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
          aria-label={t("Уведомления")}
          className={`absolute ${align === "left" ? "left-0" : "right-0"} top-[calc(100%+8px)] z-50 max-h-[420px] w-[320px] overflow-y-auto rounded-xl border border-line bg-surface-2 shadow-[0_12px_32px_rgba(0,0,0,0.45)]`}
        >
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-fg">
            {t("Уведомления")}
          </h2>
          {data.items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-fg-2">
              {t(
                "Пока ничего нет. Здесь появятся лайки, комментарии и новые подписчики.",
              )}
            </p>
          ) : (
            <ul>
              {data.items.map((n) => {
                const Icon = KIND_ICON[n.kind];
                return (
                  <li key={n.id} className="relative">
                    <Link
                      href={notificationHref(n)}
                      onClick={() => setOpen(false)}
                      className={`flex gap-3 px-4 py-3 transition-colors hover:bg-line ${n.comment_id ? "pr-11" : ""} ${n.is_read ? "" : "bg-white/[0.03]"}`}
                    >
                      <Icon
                        className={`mt-0.5 h-4 w-4 shrink-0 ${n.is_read ? "text-fg-3" : "text-accent"}`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 text-sm">
                        <span className="block break-words text-fg">
                          {notificationText(n, t)}
                        </span>
                        {n.message &&
                          n.kind !== "system" &&
                          n.kind !== "security" &&
                          n.kind !== "moderation" &&
                          n.kind !== "recap" &&
                          n.kind !== "achievement" && (
                            <span className="mt-0.5 block truncate text-xs text-fg-2">
                              «{n.message}»
                            </span>
                          )}
                        <span className="mt-0.5 block font-mono text-[11px] text-fg-3">
                          {timeAgo(n.created_at, t)}
                        </span>
                      </span>
                    </Link>
                    {n.comment_id && (
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          setReport({
                            type: "comment",
                            commentId: n.comment_id as number,
                            author: n.actor.username,
                            text: n.message,
                          });
                        }}
                        aria-label={t("Пожаловаться на комментарий {user}", {
                          user: n.actor.username,
                        })}
                        title={t("Пожаловаться")}
                        className="absolute right-2 top-2.5 flex h-7 w-7 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-line hover:text-danger"
                      >
                        <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
      {report && (
        <ReportDialog target={report} onClose={() => setReport(null)} />
      )}
    </div>
  );
}
