import { renderCard } from "@/app/_og/card";
import { getT } from "@/app/lib/i18n/server";

export const alt = "VEINMusic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const t = await getT();
  return renderCard({
    kicker: t("МУЗЫКАЛЬНЫЙ ДНЕВНИК"),
    title: "VEINMusic",
    subtitle: t(
      "Вся музыка, что вы слушаете, — в одной истории: Яндекс Музыка, Spotify, SoundCloud, YouTube Music и плееры на компьютере",
    ),
    logo: true,
  });
}
