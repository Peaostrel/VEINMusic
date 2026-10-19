import { pageMetadata } from "@/app/lib/preview";

export const metadata = pageMetadata(
  "О проекте",
  "VEIN собирает прослушивания из Яндекс Музыки, Spotify, SoundCloud и браузера в одну историю: статистика, уровни, достижения и музыка с друзьями.",
  "/about",
);

export default function AboutLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
