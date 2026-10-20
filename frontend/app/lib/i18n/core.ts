/**
 * Interface language. Russian is the source: every UI string is written in
 * Russian and that string is also its key in the English dictionary
 * (app/lib/i18n/en/*.json). A string missing from the dictionary shows in
 * Russian, so a forgotten translation never breaks a page.
 */

export type Lang = "ru" | "en";
export type Messages = Readonly<Record<string, string>>;
export type Vars = Readonly<Record<string, string | number>>;

/** Cookie with the chosen language, read by the root layout. */
export const LANG_COOKIE = "vein_lang";
export const LANGS: readonly Lang[] = ["ru", "en"];

export const isLang = (value: unknown): value is Lang =>
  value === "ru" || value === "en";

/** BCP 47 tag for Intl / toLocaleString. */
export const localeOf = (lang: Lang) => (lang === "en" ? "en-US" : "ru-RU");

function fill(text: string, vars?: Vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

function russianPlural(n: number, one: string, few: string, many: string) {
  const m10 = Math.abs(n) % 10;
  const m100 = Math.abs(n) % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export interface Translator {
  /** t("Новых: {n}", { n: 3 }) — the Russian text, or its translation. */
  (ru: string, vars?: Vars): string;
  readonly lang: Lang;
  /** "ru-RU" or "en-US", for dates and numbers. */
  readonly locale: string;
  /**
   * Word for a count: plural(5, "трек", "трека", "треков"). The English
   * forms are the dictionary entry "трек|трека|треков" → "track|tracks".
   */
  plural(n: number, one: string, few: string, many: string): string;
  /** 1 482 906 / 1,482,906 */
  number(n: number): string;
}

export function makeTranslator(
  lang: Lang,
  messages: Messages | null,
): Translator {
  const dict = lang === "en" ? messages : null;
  const t = ((ru: string, vars?: Vars) =>
    fill(dict?.[ru] ?? ru, vars)) as Translator;
  const locale = localeOf(lang);
  Object.assign(t, {
    lang,
    locale,
    plural(n: number, one: string, few: string, many: string) {
      const en = dict?.[`${one}|${few}|${many}`];
      if (en) {
        const [single, multiple = single] = en.split("|");
        return Math.abs(n) === 1 ? single : multiple;
      }
      return russianPlural(n, one, few, many);
    },
    number: (n: number) => n.toLocaleString(locale),
  });
  return t;
}

/**
 * Marks Russian text kept in data (nav items, option lists) for translation
 * at render with t(item.label). Returns the text unchanged; the check script
 * (scripts/i18n-check.mjs) makes sure it has an English entry.
 */
export const msg = (ru: string) => ru;
