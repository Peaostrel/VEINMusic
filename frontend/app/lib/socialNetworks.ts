const SOCIAL = "Социальные сети";
const VIDEO = "Видео и стримы";
const MUSIC = "Музыкальные сервисы";
const USERNAME = "Никнейм";
const SLOT = "{username}";

const NETWORK_DEFINITIONS = [
  ["telegram", "Telegram", SOCIAL, USERNAME, `https://t.me/${SLOT}`],
  ["vk", "VK", SOCIAL, "Никнейм или ID", `https://vk.com/${SLOT}`],
  ["instagram", "Instagram", SOCIAL, USERNAME, `https://instagram.com/${SLOT}`],
  ["x", "X (Twitter)", SOCIAL, USERNAME, `https://x.com/${SLOT}`],
  ["threads", "Threads", SOCIAL, USERNAME, `https://www.threads.net/@${SLOT}`],
  [
    "bluesky",
    "Bluesky",
    SOCIAL,
    "Хэндл, например name.bsky.social",
    `https://bsky.app/profile/${SLOT}`,
  ],
  ["reddit", "Reddit", SOCIAL, USERNAME, `https://www.reddit.com/user/${SLOT}`],
  [
    "discord",
    "Discord",
    SOCIAL,
    "Числовой ID пользователя",
    `https://discord.com/users/${SLOT}`,
  ],
  ["github", "GitHub", SOCIAL, USERNAME, `https://github.com/${SLOT}`],
  [
    "steam",
    "Steam",
    SOCIAL,
    "Персональный ID профиля",
    `https://steamcommunity.com/id/${SLOT}`,
  ],
  [
    "youtube",
    "YouTube",
    VIDEO,
    "Хэндл канала",
    `https://www.youtube.com/@${SLOT}`,
  ],
  ["tiktok", "TikTok", VIDEO, USERNAME, `https://www.tiktok.com/@${SLOT}`],
  ["twitch", "Twitch", VIDEO, USERNAME, `https://www.twitch.tv/${SLOT}`],
  [
    "spotify",
    "Spotify",
    MUSIC,
    "ID пользователя Spotify",
    `https://open.spotify.com/user/${SLOT}`,
  ],
  ["lastfm", "Last.fm", MUSIC, USERNAME, `https://www.last.fm/user/${SLOT}`],
  [
    "soundcloud",
    "SoundCloud",
    MUSIC,
    USERNAME,
    `https://soundcloud.com/${SLOT}`,
  ],
  [
    "bandcamp",
    "Bandcamp",
    MUSIC,
    "Никнейм поклонника",
    `https://bandcamp.com/${SLOT}`,
  ],
] as const;

export type SocialNetworkId = (typeof NETWORK_DEFINITIONS)[number][0];

export const SOCIAL_NETWORKS = NETWORK_DEFINITIONS.map(
  ([id, label, group, placeholder]) => ({ id, label, group, placeholder }),
);

const SOCIAL_NETWORK_MAP = new Map(
  NETWORK_DEFINITIONS.map(([id, label, group, placeholder, url]) => [
    id,
    { id, label, group, placeholder, url },
  ]),
);

export function getSocialNetwork(network: string) {
  return SOCIAL_NETWORK_MAP.get(network.toLowerCase() as SocialNetworkId);
}

export function getSocialUrl(
  network: string,
  rawUsername: string,
): string | null {
  const definition = getSocialNetwork(network);
  if (!definition) return null;

  const username = rawUsername.trim().replace(/^@/, "");
  if (
    !username ||
    (definition.id === "discord" && !/^\d{17,20}$/.test(username))
  ) {
    return null;
  }

  return definition.url.replace(SLOT, encodeURIComponent(username));
}
