import { renderCard } from "@/app/_og/card";
import {
  clip,
  previewImage,
  previewJson,
  type UserPreview,
} from "@/app/lib/preview";
import { getT } from "@/app/lib/i18n/server";

export const alt = "Профиль на VEINMusic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: Readonly<{ params: Promise<{ username: string }> }>) {
  const { username } = await params;
  const t = await getT();
  const path = `/user/${encodeURIComponent(username)}`;
  const [p, image] = await Promise.all([
    previewJson<UserPreview>(path),
    previewImage(path),
  ]);
  // Unknown names get one shared card: the picture never repeats text from
  // the address, and it is drawn only once however many names are tried
  if (!p)
    return renderCard({
      kicker: t("ПРОФИЛЬ"),
      title: t("Профиль на VEINMusic"),
      logo: true,
    });
  const stats = [];
  if (p.scrobbles !== null)
    stats.push({
      value: t.number(p.scrobbles),
      label: t.plural(
        p.scrobbles,
        "прослушивание",
        "прослушивания",
        "прослушиваний",
      ),
    });
  if (p.level !== null)
    stats.push({
      value: String(p.level),
      label: p.rank ? t("уровень · {rank}", { rank: t(p.rank) }) : t("уровень"),
    });
  let subtitle = `@${p.username}`;
  if (p.is_private) subtitle += ` · ${t("закрытый профиль")}`;
  else if (p.top_artist)
    subtitle += ` · ${t("любимый исполнитель — {artist}", { artist: clip(p.top_artist, 28) })}`;
  return renderCard({
    kicker: t("ПРОФИЛЬ"),
    title: clip(p.display_name || p.username, 40),
    subtitle,
    stats,
    image,
    round: true,
  });
}
