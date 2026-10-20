"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  LANG_COOKIE,
  makeTranslator,
  type Lang,
  type Messages,
  type Translator,
} from "./core";
import { activeTranslator, setActiveTranslator } from "./active";

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
  return <LangContext.Provider value={t}>{children}</LangContext.Provider>;
}

/** Translator for Client Components. */
export const useT = () => useContext(LangContext);

/** Remember the language for a year and reload the page in it. */
export function setLang(lang: Lang) {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}
