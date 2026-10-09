"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useSiteTheme } from "@/app/lib/theme";
import GlobalAnnouncementBanner from "@/components/GlobalAnnouncementBanner";
import OfflineBanner from "@/components/OfflineBanner";
import Footer from "./Footer";
import GuestHeader from "./GuestHeader";
import { MobileTabBar, MobileTopBar } from "./MobileNav";
import Sidebar from "./Sidebar";
import { activeSection } from "./nav";
import { useAuthUser, useMediaQuery } from "./useAuthUser";

/**
 * Page chrome. Signed in: sidebar on desktop, top bar + tab bar on phones.
 * Signed out: a top header. The html[data-auth] flag (set before paint by
 * the inline script in the root layout) picks the layout in CSS, so the
 * right frame shows even before this component hydrates.
 */
export default function AppShell({
  children,
}: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  useSiteTheme(pathname);
  const { username, profile, ready, logout } = useAuthUser(pathname);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const active = activeSection(pathname, username);
  const onAuthPage = pathname?.startsWith("/auth") ?? false;

  return (
    <div className="flex min-h-screen flex-col">
      {!(ready && username) && (
        <div className="guest-only">
          <GuestHeader minimal={onAuthPage} />
        </div>
      )}

      <aside
        aria-label="Боковая панель"
        className="auth-only fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-width)] border-r border-line-soft bg-sidebar lg:block"
      >
        {username && isDesktop && (
          <Sidebar
            username={username}
            profile={profile}
            active={active}
            onLogout={logout}
          />
        )}
      </aside>

      <div className="auth-only sticky top-0 z-40 h-14 lg:hidden">
        {username && isDesktop === false && (
          <MobileTopBar
            username={username}
            profile={profile}
            onLogout={logout}
          />
        )}
      </div>

      <div className="shell-main flex flex-1 flex-col">
        <OfflineBanner />
        <GlobalAnnouncementBanner />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer />
      </div>

      <div className="auth-only fixed inset-x-0 bottom-0 z-40 lg:hidden">
        {username && isDesktop === false && (
          <MobileTabBar username={username} active={active} />
        )}
      </div>
    </div>
  );
}
