import type { Metadata } from "next";
import { openGraph } from "@/app/lib/preview";

const title = "О проекте";
const description =
  "VEIN собирает прослушивания из Яндекс Музыки, Spotify, SoundCloud и браузера в одну историю: статистика, уровни, достижения и музыка с друзьями.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/about" },
  openGraph: openGraph(title, description, "/about"),
};

export default function AboutLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
