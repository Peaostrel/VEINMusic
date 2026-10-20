import { cookies, headers } from "next/headers";
import { cache } from "react";
import {
  LANG_COOKIE,
  isLang,
  langFromAccept,
  makeTranslator,
  type Lang,
} from "./core";
import en from "./en";

/**
 * The visitor's language: the one picked with the switch, else their
 * browser's (Russian for Russian speakers, English for the rest), else
 * Russian (crawlers send no Accept-Language).
 */
export const getLang = cache(async (): Promise<Lang> => {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLang(value)) return value;
  return langFromAccept((await headers()).get("accept-language")) ?? "ru";
});

/** Translator for Server Components, generateMetadata and route handlers. */
export const getT = cache(async () => makeTranslator(await getLang(), en));

/** The English dictionary, handed to the client only when it is needed. */
export const messagesFor = (lang: Lang) => (lang === "en" ? en : null);
