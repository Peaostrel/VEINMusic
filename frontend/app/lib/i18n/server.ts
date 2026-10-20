import { cookies } from "next/headers";
import { cache } from "react";
import { LANG_COOKIE, isLang, makeTranslator, type Lang } from "./core";
import en from "./en";

/** The visitor's language: the cookie set by the language switch, else Russian. */
export const getLang = cache(async (): Promise<Lang> => {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(value) ? value : "ru";
});

/** Translator for Server Components, generateMetadata and route handlers. */
export const getT = cache(async () => makeTranslator(await getLang(), en));

/** The English dictionary, handed to the client only when it is needed. */
export const messagesFor = (lang: Lang) => (lang === "en" ? en : null);
