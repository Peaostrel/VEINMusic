"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useT } from "@/app/lib/i18n/client";
import { msg } from "@/app/lib/i18n/core";

const API = "https://api.music.vein.guru";

/** Code samples; `key` and `days` are the translated placeholder words. */
const samples = (key: string, days: string) => ({
  curl: String.raw`curl -X POST ${API}/api/scrobble \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "${key}",
    "title": "Всё забрать",
    "artist": "Джизус",
    "source": "terminal"
  }'`,
  python: `import requests

payload = {
    "api_key": "${key}",
    "title": "Демиург",
    "artist": "Джизус",
    "source": "python_bot",
    "duration": 180,
    "progress_sec": 10,
    "is_playing": True,
}

r = requests.post("${API}/api/scrobble", json=payload)
print(r.json())`,
  profile: `import requests

r = requests.get("${API}/api/user/peaostrel")
user = r.json()

print(user["display_name"], "—", user["streak"], "${days}")`,
  json: `{
  "api_key": "${key}",
  "title": "Worthless I, Worthless You",
  "artist": "LAZZY2WICE",
  "source": "custom_script",
  "progress_sec": 15,
  "duration": 69,
  "is_playing": true
}`,
});

type Lang = keyof ReturnType<typeof samples>;

const TABS: { id: Lang; label: string }[] = [
  { id: "curl", label: "cURL" },
  { id: "python", label: "Python" },
  { id: "profile", label: msg("Профиль (GET)") },
  { id: "json", label: "JSON" },
];

export default function CodeSamples() {
  const t = useT();
  const SAMPLES = samples(t("ваш_ключ"), t("дн. подряд"));
  const [lang, setLang] = useState<Lang>("curl");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SAMPLES[lang]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line pr-3 pl-2">
        <div
          role="tablist"
          aria-label={t("Пример")}
          className="hide-scrollbar flex min-w-0 overflow-x-auto"
        >
          {TABS.map((tab) => {
            const active = tab.id === lang;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setLang(tab.id);
                  setCopied(false);
                }}
                className={`-mb-px h-10 shrink-0 border-b-2 px-3 text-[13px] transition-colors ${
                  active
                    ? "border-accent text-fg"
                    : "border-transparent text-fg-3 hover:text-fg"
                }`}
              >
                {t(tab.label)}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1.5 text-xs text-fg-2 transition-colors hover:text-fg"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-ok" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {copied ? t("Скопировано") : t("Копировать")}
        </button>
      </div>
      <pre
        role="tabpanel"
        className="overflow-x-auto bg-bg/40 p-5 font-mono text-[13px] leading-relaxed text-fg-2"
      >
        <code>{SAMPLES[lang]}</code>
      </pre>
    </div>
  );
}
