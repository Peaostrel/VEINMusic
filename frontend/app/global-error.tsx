"use client";

import { activeTranslator } from "@/app/lib/i18n/active";
import {
  LANG_COOKIE,
  isLang,
  langFromAccept,
  type Lang,
} from "@/app/lib/i18n/core";

/*
 * Its own texts in both languages: the layout (and with it the language
 * provider and the English dictionary) may never have loaded.
 */
const TEXTS = {
  ru: {
    title: "Ошибка — VEINMusic",
    heading: "VEINMusic не загрузился",
    later: "Попробуйте ещё раз через минуту.",
    code: "Если ошибка повторяется, напишите нам и приложите код:",
    retry: "Попробовать ещё раз",
  },
  en: {
    title: "Error — VEINMusic",
    heading: "VEINMusic didn't load",
    later: "Please try again in a minute.",
    code: "If the error keeps happening, write to us and include the code:",
    retry: "Try again",
  },
} as const;

/** The cookie, else the browser's language (the provider may not exist). */
function visitorLang(): Lang {
  if (typeof document === "undefined") return activeTranslator().lang;
  const saved = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${LANG_COOKIE}=`))
    ?.split("=")[1];
  if (isLang(saved)) return saved;
  return (
    langFromAccept(navigator.languages?.join(",") || navigator.language) ?? "ru"
  );
}

/**
 * Last resort when the root layout itself fails: renders its own document,
 * without the site's CSS, so the colours are inline.
 */
export default function GlobalError({
  error,
  retry,
}: Readonly<{ error: Error & { digest?: string }; retry: () => void }>) {
  const lang = visitorLang();
  const text = TEXTS[lang];
  return (
    <html lang={lang}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0e0f10",
          color: "#ededeb",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          textAlign: "center",
          padding: 16,
        }}
      >
        <title>{text.title}</title>
        <main role="alert" style={{ maxWidth: 420 }}>
          <p style={{ fontSize: 48, color: "#80848c", margin: 0 }}>:(</p>
          <h1 style={{ fontSize: 20, margin: "12px 0 8px" }}>{text.heading}</h1>
          <p style={{ fontSize: 14, color: "#a9acb2", lineHeight: 1.5 }}>
            {text.later}
          </p>
          {error.digest ? (
            <p style={{ fontSize: 12, color: "#80848c" }}>
              {text.code}{" "}
              <span style={{ fontFamily: "monospace" }}>{error.digest}</span>
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 12,
              padding: "10px 18px",
              border: 0,
              borderRadius: 8,
              background: "#e3a93b",
              color: "#121212",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {text.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
