import Link from "next/link";
import { useT } from "@/app/lib/i18n/client";
import { msg } from "@/app/lib/i18n/core";
import { AGE_RATING } from "@/app/lib/legal";

const links = [
  { href: "/about", label: msg("О проекте") },
  { href: "/extension", label: msg("Расширение") },
  { href: "/developers", label: msg("Разработчикам") },
  { href: "/privacy", label: msg("Конфиденциальность") },
  { href: "/terms", label: msg("Условия") },
  { href: "/recommendations", label: msg("Рекомендации") },
];

/** Quiet footer with service links. */
export default function Footer() {
  const t = useT();
  return (
    <footer className="mt-16 border-t border-line-soft">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-4 py-6 text-[13px] text-fg-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span className="flex items-center gap-3">
          © {new Date().getFullYear()} VEINMusic
          <span
            title={t("Возрастная категория")}
            className="rounded border border-line-soft px-1.5 font-mono text-[11px] leading-5"
          >
            {AGE_RATING}
          </span>
        </span>
        <nav
          aria-label={t("Служебные ссылки")}
          className="flex flex-wrap gap-x-6 gap-y-2"
        >
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-fg-2">
              {t(l.label)}
            </Link>
          ))}
          <a
            href="https://github.com/Peaostrel/VEINMusic"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-fg-2"
          >
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
