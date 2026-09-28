import Link from "next/link";

export interface LegalSection {
  title: string;
  text: string;
  list?: string[];
}

export function legalSection(
  title: string,
  text: string,
  ...list: string[]
): LegalSection {
  const section: LegalSection = { title, text };
  if (list.length > 0) section.list = list;
  return section;
}

const DOCS = [
  { href: "/privacy", label: "Конфиденциальность" },
  { href: "/terms", label: "Условия использования" },
];

/** Shared layout of the privacy policy and the terms of use. */
export default function LegalDoc({
  current,
  title,
  lead,
  updated,
  sections,
}: Readonly<{
  current: string;
  title: string;
  lead: string;
  /** Date of the last edit, written out by hand when the text changes. */
  updated: string;
  sections: LegalSection[];
}>) {
  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-8 px-4 pt-12 pb-24 md:flex-row md:gap-14 md:px-8 md:pt-16">
      <nav
        aria-label="Документы"
        className="flex shrink-0 gap-1 md:sticky md:top-24 md:h-fit md:w-[220px] md:flex-col"
      >
        {DOCS.map((d) => {
          const active = d.href === current;
          return (
            <Link
              key={d.href}
              href={d.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-9 items-center rounded-lg px-3 text-sm transition-colors ${
                active
                  ? "bg-surface-2 font-medium text-fg"
                  : "text-fg-2 hover:text-fg"
              }`}
            >
              {d.label}
            </Link>
          );
        })}
      </nav>

      <article className="flex max-w-[680px] min-w-0 flex-1 flex-col gap-10">
        <header className="flex flex-col gap-3">
          <span className="font-mono text-xs text-fg-3">
            Обновлено {updated}
          </span>
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em] md:text-[32px]">
            {title}
          </h1>
          <p className="text-[15px] text-fg-2">{lead}</p>
        </header>
        {sections.map((s, i) => (
          <section key={s.title} className="flex flex-col gap-3">
            <h2 className="flex items-baseline gap-3 text-lg font-semibold">
              <span className="font-mono text-sm font-normal text-fg-3">
                0{i + 1}
              </span>
              {s.title}
            </h2>
            <p className="text-[15px] leading-relaxed text-fg-2">{s.text}</p>
            {s.list && (
              <ul className="flex flex-col gap-2 text-[15px] leading-relaxed text-fg-2">
                {s.list.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span aria-hidden="true" className="text-fg-3">
                      —
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </article>
    </div>
  );
}
