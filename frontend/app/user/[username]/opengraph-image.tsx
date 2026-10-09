import { renderCard } from "@/app/_og/card";
import {
  clip,
  previewImage,
  previewJson,
  type UserPreview,
} from "@/app/lib/preview";
import { formatNumber, plural } from "@/app/lib/plural";

export const alt = "Профиль на VEINMusic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: Readonly<{ params: Promise<{ username: string }> }>) {
  const { username } = await params;
  const path = `/user/${encodeURIComponent(username)}`;
  const [p, image] = await Promise.all([
    previewJson<UserPreview>(path),
    previewImage(path),
  ]);
  if (!p)
    return renderCard({
      kicker: "ПРОФИЛЬ",
      title: `@${username}`,
      round: true,
    });
  const stats = [];
  if (p.scrobbles !== null)
    stats.push({
      value: formatNumber(p.scrobbles),
      label: plural(
        p.scrobbles,
        "прослушивание",
        "прослушивания",
        "прослушиваний",
      ),
    });
  if (p.level !== null)
    stats.push({
      value: String(p.level),
      label: p.rank ? `уровень · ${p.rank}` : "уровень",
    });
  let subtitle = `@${p.username}`;
  if (p.is_private) subtitle += " · закрытый профиль";
  else if (p.top_artist)
    subtitle += ` · любимый исполнитель — ${clip(p.top_artist, 28)}`;
  return renderCard({
    kicker: "ПРОФИЛЬ",
    title: clip(p.display_name || p.username, 40),
    subtitle,
    stats,
    image,
    round: true,
  });
}
