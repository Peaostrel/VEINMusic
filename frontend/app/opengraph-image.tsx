import { OG_SIZE, OG_TYPE, renderCard } from "@/app/_og/card";

export const alt = "VEINMusic";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default function Image() {
  return renderCard({
    kicker: "МУЗЫКАЛЬНЫЙ ДНЕВНИК",
    title: "VEINMusic",
    subtitle:
      "Вся музыка, что вы слушаете, — в одной истории: Яндекс Музыка, Spotify, SoundCloud, YouTube Music и плееры на компьютере",
    logo: true,
  });
}
