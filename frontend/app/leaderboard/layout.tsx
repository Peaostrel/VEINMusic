import { getT } from "@/app/lib/i18n/server";
import { pageMetadata } from "@/app/lib/preview";

export async function generateMetadata() {
  const t = await getT();
  return pageMetadata(
    t("Топ слушателей"),
    t(
      "Рейтинг слушателей VEIN по опыту за неделю, месяц и всё время: уровни, ранги и серии прослушиваний.",
    ),
    "/leaderboard",
    t.lang,
  );
}

export default function LeaderboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
