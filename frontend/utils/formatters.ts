import { tr } from "@/app/lib/i18n/active";
import { msg } from "@/app/lib/i18n/core";

const SOURCE_LABELS: [RegExp, string][] = [
  [/^plat(?:[_ -]?music)?(?:$|[_ -])/, "Plat Music"],
  [/yandex/, msg("Яндекс")],
  [/spotify/, "Spotify"],
  [/vk/, "VK"],
  [/youtube/, "YouTube"],
  [/soundcloud/, "SoundCloud"],
  [/lastfm|last\.fm/, "Last.fm"],
  [/apple/, "Apple"],
  [/listenbrainz/, "ListenBrainz"],
  [/extension|web|browser/, msg("браузер")],
  [/discord/, "Discord"],
];

/** Short human name of a scrobble source for monospaced meta lines. */
export function sourceLabel(source?: string | null): string {
  const s = (source || "").toLowerCase();
  for (const [re, label] of SOURCE_LABELS) if (re.test(s)) return tr(label);
  return source || "—";
}
