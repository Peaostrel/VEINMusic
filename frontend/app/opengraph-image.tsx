import { renderCard } from "@/app/_og/card";

export const alt = "VEINMusic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderCard({
    kicker: "МУЗЫКАЛЬНЫЙ ДНЕВНИК",
    title: "VEINMusic",
    subtitle:
      "Вся музыка, что вы слушаете, — в одной истории: Яндекс Музыка, Spotify, SoundCloud, YouTube Music и плееры на компьютере",
    logo: true,
  });
}
