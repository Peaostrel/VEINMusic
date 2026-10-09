import { OG_SIZE, OG_TYPE, renderCard } from "@/app/_og/card";
import {
  clip,
  previewImage,
  previewJson,
  type ArtistPreview,
} from "@/app/lib/preview";
import { formatNumber, plural } from "@/app/lib/plural";

export const alt = "Исполнитель на VEINMusic";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default async function Image({
  params,
}: Readonly<{ params: Promise<{ name: string }> }>) {
  const { name } = await params;
  const path = `/artist/${encodeURIComponent(name)}`;
  const [a, image] = await Promise.all([
    previewJson<ArtistPreview>(path),
    previewImage(path),
  ]);
  if (!a) return renderCard({ kicker: "ИСПОЛНИТЕЛЬ", title: clip(name, 40) });
  return renderCard({
    kicker: "ИСПОЛНИТЕЛЬ",
    title: clip(a.name, 40),
    subtitle: a.top_track
      ? `Самый популярный трек — «${clip(a.top_track, 36)}»`
      : null,
    stats: [
      {
        value: formatNumber(a.plays),
        label: plural(
          a.plays,
          "прослушивание",
          "прослушивания",
          "прослушиваний",
        ),
      },
      {
        value: formatNumber(a.tracks),
        label: plural(a.tracks, "трек", "трека", "треков"),
      },
    ],
    image,
  });
}
