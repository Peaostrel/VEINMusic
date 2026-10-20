"use client";

import { setLang, useT } from "@/app/lib/i18n/client";
import { LANGS } from "@/app/lib/i18n/core";

/** RU / EN toggle: the guest header and the account menu. */
export default function LanguageSwitch({
  className = "",
}: Readonly<{ className?: string }>) {
  const t = useT();
  return (
    <div
      role="group"
      aria-label={t("Язык интерфейса")}
      className={`inline-flex shrink-0 rounded-md border border-line p-0.5 font-mono text-[11px] ${className}`}
    >
      {LANGS.map((lang) => (
        <button
          key={lang}
          type="button"
          lang={lang}
          aria-pressed={t.lang === lang}
          onClick={() => {
            if (t.lang !== lang) setLang(lang);
          }}
          className={`rounded px-2 py-1 uppercase transition-colors ${
            t.lang === lang ? "bg-line text-fg" : "text-fg-3 hover:text-fg"
          }`}
        >
          {lang}
        </button>
      ))}
    </div>
  );
}
