import { msg } from "./i18n/core";

/** Rank names are Russian source text: show them with t(). */
export const getRankInfo = (level: number) => {
  if (level >= 100) return { title: msg("Божество") };
  if (level >= 50) return { title: msg("Легенда") };
  if (level >= 30) return { title: msg("Маньяк") };
  if (level >= 15) return { title: msg("Аудиофил") };
  if (level >= 5) return { title: msg("Меломан") };
  return { title: msg("Турист") };
};

export const getNextRankInfo = (level: number) => {
  if (level < 5) return { name: msg("Меломан"), target: 5 };
  if (level < 15) return { name: msg("Аудиофил"), target: 15 };
  if (level < 30) return { name: msg("Маньяк"), target: 30 };
  if (level < 50) return { name: msg("Легенда"), target: 50 };
  if (level < 100) return { name: msg("Божество"), target: 100 };
  return null;
};
