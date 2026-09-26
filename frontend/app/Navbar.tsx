"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { API_URL } from "@/app/lib/api";
import { isValidUser, setProfileTheme, useSiteTheme } from "@/app/lib/theme";
import NotificationsBell from "@/components/NotificationsBell";
import UserSearch from "./navbar/UserSearch";
import UserMenu from "./navbar/UserMenu";
import type { NavUser } from "./navbar/types";

export default function Navbar() {
  const [username, setUsername] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<NavUser | null>(null);
  const pathname = usePathname();

  useSiteTheme(pathname);

  useEffect(() => {
    const storedUser = localStorage.getItem("username");
    if (!isValidUser(storedUser)) return;
    setUsername(storedUser);
    fetch(`${API_URL}/api/user/${storedUser}`, { credentials: "include" })
      .then((res) => res.json())
      .then((data: NavUser) => {
        setUserProfile(data);
        // Only apply the DB theme on first load; don't override a theme
        // the user has already chosen this session.
        if (data.theme && !localStorage.getItem("site_theme")) {
          localStorage.setItem("site_theme", data.theme);
          globalThis.dispatchEvent(new Event("theme_update"));
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (e) {
      console.error("Logout failed:", e);
    }
    localStorage.removeItem("username");
    globalThis.postMessage(
      { type: "VEIN_EXTENSION_LOGOUT" },
      globalThis.location.origin,
    );
    localStorage.setItem("site_theme", "classic");
    setUsername(null);
    setUserProfile(null);
    setProfileTheme(undefined);
    globalThis.location.href = "/auth";
  };

  const navLinkClass =
    "text-gray-400 hover:text-[var(--accent-text)] transition p-2 rounded-lg hover:bg-white/5";

  return (
    <>
      <style>{`
        .navbar-accent { color: var(--accent) !important; filter: drop-shadow(0 0 10px var(--accent-glow-strong)); }
        ::selection { background-color: var(--accent) !important; color: #000 !important; }
      `}</style>
      <nav
        aria-label="Основная навигация"
        className="fixed top-4 left-1/2 -translate-x-1/2 w-[95%] max-w-6xl z-50"
      >
        <div className="bg-[#121212]/70 backdrop-blur-xl border border-white/5 rounded-2xl px-4 py-3 flex items-center justify-between shadow-[0_8px_30px_rgb(0,0,0,0.4)] gap-4">
          <Link
            href="/"
            aria-label="VEIN Music — главная"
            className="flex items-center gap-3 group shrink-0"
          >
            <div
              aria-hidden="true"
              className="w-10 h-10 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] rounded-xl flex items-center justify-center text-[var(--text-on-accent)] font-black text-2xl group-hover:scale-110 group-hover:rotate-6 transition-all duration-300 shadow-[0_0_15px_var(--accent-glow)]"
            >
              V
            </div>
            <span
              className="font-black text-2xl tracking-tight hidden lg:block"
              style={{ color: "white" }}
            >
              VEIN{" "}
              <span
                style={{
                  color: "var(--accent)",
                  filter: "drop-shadow(0 0 10px var(--accent-glow-strong))",
                }}
              >
                Music
              </span>
            </span>
          </Link>
          <UserSearch />
          <div className="flex items-center gap-2 sm:gap-4 font-bold text-sm shrink-0">
            <Link href="/feed" className={navLinkClass} aria-label="Лента">
              <span className="text-lg" aria-hidden="true">
                📡
              </span>{" "}
              <span className="hidden md:inline ml-1">Лента</span>
            </Link>
            <Link
              href="/leaderboard"
              className={navLinkClass}
              aria-label="Топ слушателей"
            >
              <span className="text-lg" aria-hidden="true">
                🏆
              </span>{" "}
              <span className="hidden md:inline ml-1">Топ</span>
            </Link>
            {isValidUser(username) && <NotificationsBell />}
            {isValidUser(username) ? (
              <UserMenu
                username={username}
                profile={userProfile}
                onLogout={handleLogout}
              />
            ) : (
              <Link
                href="/auth"
                className="bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] text-[var(--text-on-accent)] px-5 py-2 rounded-xl transition-all duration-300 shadow-[0_0_15px_var(--accent-glow)] hover:scale-105 shrink-0 ml-2"
              >
                Войти
              </Link>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
