import type { Metadata } from "next";
import { openGraph } from "@/app/lib/preview";

const title = "Топ слушателей";
const description =
  "Рейтинг слушателей VEIN по опыту за неделю, месяц и всё время: уровни, ранги и серии прослушиваний.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/leaderboard" },
  openGraph: openGraph(title, description, "/leaderboard"),
};

export default function LeaderboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
