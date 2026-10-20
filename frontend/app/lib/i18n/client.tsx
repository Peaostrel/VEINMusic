"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import {
  LANG_COOKIE,
  makeTranslator,
  type Lang,
  type Messages,
  type Translator,
} from "./core";
import { activeTranslator, setActiveTranslator } from "./active";
import { apiFetch } from "../api";

const LangContext = createContext<Translator>(makeTranslator("ru", null));

/** Wraps the app in the root layout with the visitor's language. */
export function LangProvider({
  lang,
  messages,
  children,
}: Readonly<{ lang: Lang; messages: Messages | null; children: ReactNode }>) {
  let t = activeTranslator();
  if (t.lang !== lang) {
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
