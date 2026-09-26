const SOURCE_LABELS: [RegExp, string][] = [
  [/yandex/, "Яндекс"],
  [/spotify/, "Spotify"],
  [/vk/, "VK"],
  [/youtube/, "YouTube"],
  [/soundcloud/, "SoundCloud"],
  [/lastfm|last\.fm/, "Last.fm"],
  [/apple/, "Apple"],
  [/listenbrainz/, "ListenBrainz"],
  [/extension|web|browser/, "браузер"],
  [/discord/, "Discord"],
];

/** Short human name of a scrobble source for monospaced meta lines. */
export function sourceLabel(source?: string | null): string {
  const s = (source || "").toLowerCase();
  for (const [re, label] of SOURCE_LABELS) if (re.test(s)) return label;
  return source || "—";
}
