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
    { id: "feed", label: "Лента", href: "/", icon: Rss },
    { id: "top", label: "Топ", href: "/leaderboard", icon: Trophy },
    {
      id: "together",
      label: "Слушать вместе",
      href: "/together",
      icon: Headphones,
    },
    {
      id: "stats",
      label: "Статистика",
      href: `/user/${me}/stats`,
      icon: ChartColumn,
    },
    {
      id: "library",
      label: "Моя библиотека",
      href: "/library",
      icon: LibraryBig,
    },
    { id: "goals", label: "Цели", href: "/goals", icon: Target },
    { id: "profile", label: "Профиль", href: `/user/${me}`, icon: User },
    {
      id: "settings",
      label: "Настройки",
      href: "/settings",
      icon: SlidersHorizontal,
    },
    {
      id: "admin",
      label: "Админка",
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
