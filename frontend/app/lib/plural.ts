/** Russian plural form: plural(5, "трек", "трека", "треков") → "треков". */
export function plural(n: number, one: string, few: string, many: string) {
  const m10 = Math.abs(n) % 10;
  const m100 = Math.abs(n) % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** 1 482 906 — thin grouping as used across the UI. */
export const formatNumber = (n: number) => n.toLocaleString("ru-RU");
