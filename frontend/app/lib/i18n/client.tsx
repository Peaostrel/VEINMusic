"use client";

import { use, useContext, useEffect, type ReactNode } from "react";
import { LANG_COOKIE, makeTranslator, type Lang, type Messages } from "./core";
import { activeTranslator, setActiveTranslator } from "./active";
import { LangContext as SharedContext } from "./context";
import { apiFetch, installLangHeader } from "../api";

// Always set in the client build (only the react-server build lacks it)
const LangContext = SharedContext!;

installLangHeader();

let english: Promise<Messages> | null = null;

/**
 * The English dictionary as a chunk of its own: loaded once and cached by
 * the browser, instead of riding in every page's HTML (≈250 KB). Russian
 * pages never load it.
 */
const loadEnglish = () =>
  (english ??= import("./en").then((module) => module.default));

/** Wraps the app in the root layout with the visitor's language. */
export function LangProvider({
  lang,
  children,
}: Readonly<{ lang: Lang; children: ReactNode }>) {
  // Hydration waits for the dictionary, so English text matches the server's
  const messages = lang === "en" ? use(loadEnglish()) : null;
  // In the browser: the translator from an earlier render, if still right
  let t = typeof window === "undefined" ? null : activeTranslator();
  if (!t || t.lang !== lang) {
    t = makeTranslator(lang, messages);
    setActiveTranslator(t);
  }
  useEffect(() => {
    void saveLangForAccount(lang);
  }, [lang]);
  return <LangContext.Provider value={t}>{children}</LangContext.Provider>;
}

const SAVED_KEY = "vein_lang_saved";

/**
 * Tell the API the language of a signed-in visitor (once per browser
 * session and language): emails, push and notifications are written in it.
 */
async function saveLangForAccount(lang: Lang) {
  try {
    if (!localStorage.getItem("username")) return;
    if (sessionStorage.getItem(SAVED_KEY) === lang) return;
    const res = await apiFetch("/api/account/lang", {
      method: "PUT",
      json: { lang },
    });
    if (res.ok) sessionStorage.setItem(SAVED_KEY, lang);
  } catch {
    // offline or signed out: tried again on the next page load
  }
}

/** Translator for Client Components. */
export const useT = () => useContext(LangContext);

/** Remember the language for a year and reload the page in it. */
export function setLang(lang: Lang) {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}
