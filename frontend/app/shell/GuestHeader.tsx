"use client";

import Link from "next/link";
import { BrandLink } from "@/components/brand";
import { btn } from "@/components/ui";
import UserSearch from "./UserSearch";

const links = [
  { href: "/feed", label: "Лента" },
  { href: "/leaderboard", label: "Топ" },
  { href: "/about#how", label: "Как это работает" },
  { href: "/about#faq", label: "Вопросы" },
];

/** Top bar for signed-out visitors. `minimal` is used on the auth page. */
export default function GuestHeader({
  minimal = false,
}: Readonly<{ minimal?: boolean }>) {
  return (
    <header className="border-b border-line-soft">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-8 px-4 sm:px-6">
        <BrandLink />
        {minimal ? (
          <Link href="/" className="ml-auto text-sm text-fg-2 hover:text-fg">
            ← На главную
          </Link>
        ) : (
          <>
            <nav
              aria-label="Основное"
              className="hidden items-center gap-6 text-sm text-fg-2 md:flex"
            >
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="hover:text-fg">
                  {l.label}
                </Link>
              ))}
            </nav>
            <div className="flex-1" />
            <UserSearch
              id="header-search"
              className="hidden w-[220px] lg:block"
            />
            <Link
              href="/auth"
              className="hidden text-sm text-fg-2 hover:text-fg sm:block"
            >
              Войти
            </Link>
            <Link
              href="/auth?mode=register"
              className={`${btn.primary} h-9 px-3.5`}
            >
              Создать профиль
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
