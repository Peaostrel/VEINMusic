"use client";

import Link from "next/link";
import { useT } from "@/app/lib/i18n/client";
import { msg } from "@/app/lib/i18n/core";
import { BrandLink } from "@/components/brand";
import { btn } from "@/components/ui";
import LanguageSwitch from "@/components/LanguageSwitch";
import UserSearch from "./UserSearch";

const links = [
  { href: "/feed", label: msg("Лента") },
  { href: "/leaderboard", label: msg("Топ") },
  { href: "/about#how", label: msg("Как это работает") },
  { href: "/about#faq", label: msg("Вопросы") },
];

/** Top bar for signed-out visitors. `minimal` is used on the auth page. */
export default function GuestHeader({
  minimal = false,
}: Readonly<{ minimal?: boolean }>) {
  const t = useT();
  return (
    <header className="border-b border-line-soft">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-8 px-4 sm:px-6">
        <BrandLink />
        {minimal ? (
          <div className="ml-auto flex items-center gap-4">
            <Link href="/" className="text-sm text-fg-2 hover:text-fg">
              {t("← На главную")}
            </Link>
            <LanguageSwitch />
          </div>
        ) : (
          <>
            <nav
              aria-label={t("Основное")}
              className="hidden items-center gap-6 text-sm text-fg-2 md:flex"
            >
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="hover:text-fg">
                  {t(l.label)}
                </Link>
              ))}
            </nav>
            <div className="flex-1" />
            <UserSearch
              id="header-search"
              className="hidden w-[220px] lg:block"
            />
            <LanguageSwitch />
            <Link
              href="/auth"
              className={`${btn.secondary} h-9 px-3.5 text-sm sm:border-0 sm:px-0 sm:text-fg-2 sm:hover:bg-transparent sm:hover:text-fg`}
            >
              {t("Войти")}
            </Link>
            <span className="hidden sm:block">
              <Link
                href="/auth?mode=register"
                className={`${btn.primary} h-9 px-3.5`}
              >
                {t("Создать профиль")}
              </Link>
            </span>
          </>
        )}
      </div>
    </header>
  );
}
