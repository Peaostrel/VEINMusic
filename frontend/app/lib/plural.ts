import { currentLocale, pluralize } from "./i18n/active";

/**
 * Word for a count: plural(5, "трек", "трека", "треков") → "треков"; in
 * English the dictionary entry "трек|трека|треков" → "track|tracks".
 * Client code only; Server Components use `(await getT()).plural`.
 */
export function plural(n: number, one: string, few: string, many: string) {
  return pluralize(n, one, few, many);
}

/** 1 482 906 — thin grouping as used across the UI. */
export const formatNumber = (n: number) => n.toLocaleString(currentLocale());
