import { renderCard } from "@/app/_og/card";
import {
  clip,
  previewImage,
  previewJson,
  type TrackPreview,
} from "@/app/lib/preview";
import { formatNumber, plural } from "@/app/lib/plural";

export const alt = "Трек на VEINMusic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  const path = `/track/${encodeURIComponent(id)}`;
  const valid = /^\d+$/.test(id);
  const [t, image] = valid
    ? await Promise.all([previewJson<TrackPreview>(path), previewImage(path)])
    : [null, null];
  if (!t)
    return renderCard({
      kicker: "ТРЕК",
      title: "Трек на VEINMusic",
      logo: true,
    });
  return renderCard({
    kicker: "ТРЕК",
    title: clip(t.title, 40),
    subtitle: t.album
      ? `${clip(t.artist, 30)} · ${clip(t.album, 30)}`
      : clip(t.artist, 50),
    stats: [
      {
        value: formatNumber(t.plays),
        label: plural(
          t.plays,
          "прослушивание",
          "прослушивания",
          "прослушиваний",
        ),
      },
    ],
    image,
  });
}
