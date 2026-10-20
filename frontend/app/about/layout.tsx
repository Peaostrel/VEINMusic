import { getT } from "@/app/lib/i18n/server";
import { pageMetadata } from "@/app/lib/preview";

export async function generateMetadata() {
  const t = await getT();
  return pageMetadata(
    t("О проекте"),
    t(
      "VEIN собирает прослушивания из Яндекс Музыки, Spotify, SoundCloud и браузера в одну историю: статистика, уровни, достижения и музыка с друзьями.",
    ),
    "/about",
    t.lang,
  );
}

export default function AboutLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
