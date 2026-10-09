import { OG_SIZE, OG_TYPE, renderCard } from "@/app/_og/card";
import {
  clip,
  previewImage,
  previewJson,
  type UserPreview,
} from "@/app/lib/preview";
import { formatNumber, plural } from "@/app/lib/plural";

export const alt = "Профиль на VEINMusic";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

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
  const subtitle = p.is_private
    ? `@${p.username} · закрытый профиль`
    : p.top_artist
      ? `@${p.username} · любимый исполнитель — ${clip(p.top_artist, 28)}`
      : `@${p.username}`;
  return renderCard({
    kicker: "ПРОФИЛЬ",
    title: clip(p.display_name || p.username, 40),
    subtitle,
    stats,
    image,
    round: true,
  });
}
