import Link from "next/link";
import { AGE_RATING } from "@/app/lib/legal";

const links = [
  { href: "/about", label: "О проекте" },
  { href: "/extension", label: "Расширение" },
  { href: "/developers", label: "Разработчикам" },
  { href: "/privacy", label: "Конфиденциальность" },
  { href: "/terms", label: "Условия" },
  { href: "/recommendations", label: "Рекомендации" },
];

/** Quiet footer with service links. */
export default function Footer() {
  return (
    <footer className="mt-16 border-t border-line-soft">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-4 py-6 text-[13px] text-fg-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span className="flex items-center gap-3">
          © {new Date().getFullYear()} VEINMusic
          <span
            title="Возрастная категория"
            className="rounded border border-line-soft px-1.5 font-mono text-[11px] leading-5"
          >
            {AGE_RATING}
          </span>
        </span>
        <nav
          aria-label="Служебные ссылки"
          className="flex flex-wrap gap-x-6 gap-y-2"
        >
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-fg-2">
              {l.label}
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
