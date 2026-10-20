import { renderCard } from "@/app/_og/card";
import {
  clip,
  previewImage,
  previewJson,
  type ArtistPreview,
} from "@/app/lib/preview";
import { getT } from "@/app/lib/i18n/server";

export const alt = "Исполнитель на VEINMusic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: Readonly<{ params: Promise<{ name: string }> }>) {
  const { name } = await params;
  const t = await getT();
  const path = `/artist/${encodeURIComponent(name)}`;
  const [a, image] = await Promise.all([
    previewJson<ArtistPreview>(path),
    previewImage(path),
  ]);
  if (!a)
    return renderCard({
      kicker: t("ИСПОЛНИТЕЛЬ"),
      title: t("Исполнитель на VEINMusic"),
      logo: true,
    });
  return renderCard({
    kicker: t("ИСПОЛНИТЕЛЬ"),
    title: clip(a.name, 40),
    subtitle: a.top_track
      ? t("Самый популярный трек — «{title}»", { title: clip(a.top_track, 36) })
      : null,
    stats: [
      {
        value: t.number(a.plays),
        label: t.plural(
          a.plays,
          "прослушивание",
          "прослушивания",
          "прослушиваний",
        ),
      },
      {
        value: t.number(a.tracks),
        label: t.plural(a.tracks, "трек", "трека", "треков"),
      },
    ],
    image,
  });
}
