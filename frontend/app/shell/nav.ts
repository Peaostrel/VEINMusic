import {
  ChartColumn,
  Headphones,
  LibraryBig,
  Rss,
  Shield,
  SlidersHorizontal,
  Target,
  Trophy,
  User,
} from "lucide-react";
import { msg } from "@/app/lib/i18n/core";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: typeof Rss;
  staffOnly?: boolean;
}

/** Sections of the signed-in app, in sidebar order. */
export function navItems(username: string): NavItem[] {
  const me = encodeURIComponent(username);
  return [
    { id: "feed", label: msg("Лента"), href: "/", icon: Rss },
    { id: "top", label: msg("Топ"), href: "/leaderboard", icon: Trophy },
    {
      id: "together",
      label: msg("Слушать вместе"),
      href: "/together",
      icon: Headphones,
    },
    {
      id: "stats",
      label: msg("Статистика"),
      href: `/user/${me}/stats`,
      icon: ChartColumn,
    },
    {
      id: "library",
      label: msg("Моя библиотека"),
      href: "/library",
      icon: LibraryBig,
    },
    { id: "goals", label: msg("Цели"), href: "/goals", icon: Target },
    { id: "profile", label: msg("Профиль"), href: `/user/${me}`, icon: User },
    {
      id: "settings",
      label: msg("Настройки"),
      href: "/settings",
      icon: SlidersHorizontal,
    },
    {
      id: "admin",
      label: msg("Админка"),
      href: "/admin",
      icon: Shield,
      staffOnly: true,
    },
  ];
}

/** Which nav item the current path belongs to. */
export function activeSection(
  pathname: string | null,
  username: string | null,
): string | null {
  if (!pathname) return null;
  if (pathname === "/" || pathname.startsWith("/feed")) return "feed";
  if (pathname.startsWith("/leaderboard")) return "top";
  if (pathname.startsWith("/together")) return "together";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/library")) return "library";
  if (pathname.startsWith("/goals")) return "goals";
  if (pathname.startsWith("/admin")) return "admin";
  if (username) {
    const mine = `/user/${encodeURIComponent(username)}`.toLowerCase();
    const path = pathname.toLowerCase();
    if (path === `${mine}/stats`) return "stats";
    if (path === mine || path.startsWith(`${mine}/`)) return "profile";
  }
  return null;
}

export const isStaff = (role?: string) =>
  role === "developer" || role === "admin";
