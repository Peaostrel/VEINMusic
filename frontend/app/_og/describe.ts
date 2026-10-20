/**
 * Texts of link previews, shared by `generateMetadata` and the card pictures.
 * Each takes the visitor's translator (`await getT()`); without one the text
 * is Russian.
 */
import { makeTranslator, type Translator } from "@/app/lib/i18n/core";
import {
  clip,
  plays,
  tracksCount,
  type ArtistPreview,
  type TrackPreview,
  type UserPreview,
} from "@/app/lib/preview";

const RU = makeTranslator("ru", null);

export function userTitle(p: UserPreview): string {
  return p.display_name && p.display_name !== p.username
    ? `${p.display_name} (@${p.username})`
    : `@${p.username}`;
}

export function userDescription(p: UserPreview, t: Translator = RU): string {
  if (p.is_private) return t("Закрытый профиль на VEINMusic.");
  const facts: string[] = [];
  if (p.scrobbles !== null) facts.push(plays(p.scrobbles, t));
  if (p.top_artist)
    facts.push(t("любимый исполнитель — {artist}", { artist: p.top_artist }));
  if (p.level !== null) {
    facts.push(
      p.rank
        ? t("уровень {level} ({rank})", { level: p.level, rank: t(p.rank) })
        : t("уровень {level}", { level: p.level }),
    );
  }
  const name = p.display_name || p.username;
  const head = facts.length
    ? t("{name} на VEINMusic: {facts}.", { name, facts: facts.join(", ") })
    : t("{name} на VEINMusic — вся музыка, что слушает, в одной истории.", {
        name,
      });
  return p.bio ? `${head} ${clip(p.bio, 120)}` : head;
}

export function artistDescription(
  a: ArtistPreview,
  t: Translator = RU,
): string {
  const head = t("{name} на VEINMusic: {plays}, {tracks}.", {
    name: a.name,
    plays: plays(a.plays, t),
    tracks: tracksCount(a.tracks, t),
  });
  return a.top_track
    ? `${head} ${t("Самый популярный трек — «{track}».", { track: a.top_track })}`
    : head;
}

export function trackTitle(t: TrackPreview): string {
  return `${t.title} — ${t.artist}`;
}

export function trackDescription(
  track: TrackPreview,
  t: Translator = RU,
): string {
  const head = t("«{title}», {artist}: {plays} на VEINMusic.", {
    title: track.title,
    artist: track.artist,
    plays: plays(track.plays, t),
  });
  return track.album
    ? `${head} ${t("Альбом «{album}».", { album: track.album })}`
    : head;
}
