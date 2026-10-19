import { pageMetadata } from "@/app/lib/preview";

export const metadata = pageMetadata(
  "Топ слушателей",
  "Рейтинг слушателей VEIN по опыту за неделю, месяц и всё время: уровни, ранги и серии прослушиваний.",
  "/leaderboard",
);

export default function LeaderboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
