/** Texts of link previews, shared by `generateMetadata` and the card pictures. */
import {
  clip,
  plays,
  tracksCount,
  type ArtistPreview,
  type TrackPreview,
  type UserPreview,
} from "@/app/lib/preview";

export function userTitle(p: UserPreview): string {
  return p.display_name && p.display_name !== p.username
    ? `${p.display_name} (@${p.username})`
    : `@${p.username}`;
}

export function userDescription(p: UserPreview): string {
  if (p.is_private) return "Закрытый профиль на VEINMusic.";
  const facts: string[] = [];
  if (p.scrobbles !== null) facts.push(plays(p.scrobbles));
  if (p.top_artist) facts.push(`любимый исполнитель — ${p.top_artist}`);
  if (p.level !== null) {
    const rank = p.rank ? ` (${p.rank})` : "";
    facts.push(`уровень ${p.level}${rank}`);
  }
  const name = p.display_name || p.username;
  const head = facts.length
    ? `${name} на VEINMusic: ${facts.join(", ")}.`
    : `${name} на VEINMusic — вся музыка, что слушает, в одной истории.`;
  return p.bio ? `${head} ${clip(p.bio, 120)}` : head;
}

export function artistDescription(a: ArtistPreview): string {
  const top = a.top_track ? ` Самый популярный трек — «${a.top_track}».` : "";
  return `${a.name} на VEINMusic: ${plays(a.plays)}, ${tracksCount(a.tracks)}.${top}`;
}

export function trackTitle(t: TrackPreview): string {
  return `${t.title} — ${t.artist}`;
}

export function trackDescription(t: TrackPreview): string {
  const album = t.album ? ` Альбом «${t.album}».` : "";
  return `«${t.title}», ${t.artist}: ${plays(t.plays)} на VEINMusic.${album}`;
}
