export const getRankInfo = (level: number) => {
  if (level >= 100) return { title: "Божество" };
  if (level >= 50) return { title: "Легенда" };
  if (level >= 30) return { title: "Маньяк" };
  if (level >= 15) return { title: "Аудиофил" };
  if (level >= 5) return { title: "Меломан" };
  return { title: "Турист" };
};

export const getNextRankInfo = (level: number) => {
  if (level < 5) return { name: "Меломан", target: 5 };
  if (level < 15) return { name: "Аудиофил", target: 15 };
  if (level < 30) return { name: "Маньяк", target: 30 };
  if (level < 50) return { name: "Легенда", target: 50 };
  if (level < 100) return { name: "Божество", target: 100 };
  return null;
};
