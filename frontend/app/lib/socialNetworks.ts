export const SOCIAL_NETWORKS = [
  {
    id: "telegram",
    label: "Telegram",
    group: "Социальные сети",
    placeholder: "Никнейм",
  },
  {
    id: "vk",
    label: "VK",
    group: "Социальные сети",
    placeholder: "Никнейм или ID",
  },
  {
    id: "instagram",
    label: "Instagram",
    group: "Социальные сети",
    placeholder: "Никнейм",
  },
  {
    id: "x",
    label: "X (Twitter)",
    group: "Социальные сети",
    placeholder: "Никнейм",
  },
  {
    id: "threads",
    label: "Threads",
    group: "Социальные сети",
    placeholder: "Никнейм",
  },
  {
    id: "bluesky",
    label: "Bluesky",
    group: "Социальные сети",
    placeholder: "Хэндл, например name.bsky.social",
  },
  {
    id: "reddit",
    label: "Reddit",
    group: "Социальные сети",
    placeholder: "Никнейм",
  },
  {
    id: "discord",
    label: "Discord",
    group: "Социальные сети",
    placeholder: "Числовой ID пользователя",
  },
  {
    id: "github",
    label: "GitHub",
    group: "Социальные сети",
    placeholder: "Никнейм",
  },
  {
    id: "steam",
    label: "Steam",
    group: "Социальные сети",
    placeholder: "Персональный ID профиля",
  },
  {
    id: "youtube",
    label: "YouTube",
    group: "Видео и стримы",
    placeholder: "Хэндл канала",
  },
  {
    id: "tiktok",
    label: "TikTok",
    group: "Видео и стримы",
    placeholder: "Никнейм",
  },
  {
    id: "twitch",
    label: "Twitch",
    group: "Видео и стримы",
    placeholder: "Никнейм",
  },
  {
    id: "spotify",
    label: "Spotify",
    group: "Музыкальные сервисы",
    placeholder: "ID пользователя Spotify",
  },
  {
    id: "lastfm",
    label: "Last.fm",
    group: "Музыкальные сервисы",
    placeholder: "Никнейм",
  },
  {
    id: "soundcloud",
    label: "SoundCloud",
    group: "Музыкальные сервисы",
    placeholder: "Никнейм",
  },
  {
    id: "bandcamp",
    label: "Bandcamp",
    group: "Музыкальные сервисы",
    placeholder: "Никнейм поклонника",
  },
] as const;

export type SocialNetworkId = (typeof SOCIAL_NETWORKS)[number]["id"];

const SOCIAL_NETWORK_MAP = new Map(
  SOCIAL_NETWORKS.map((network) => [network.id, network]),
);

export function getSocialNetwork(network: string) {
  return SOCIAL_NETWORK_MAP.get(network.toLowerCase() as SocialNetworkId);
}

export function getSocialUrl(
  network: string,
  rawUsername: string,
): string | null {
  const id = network.toLowerCase() as SocialNetworkId;
  if (!SOCIAL_NETWORK_MAP.has(id)) return null;

  const username = rawUsername.trim().replace(/^@/, "");
  if (!username) return null;
  const encoded = encodeURIComponent(username);

  switch (id) {
    case "telegram":
      return `https://t.me/${encoded}`;
    case "vk":
      return `https://vk.com/${encoded}`;
    case "steam":
      return `https://steamcommunity.com/id/${encoded}`;
    case "github":
      return `https://github.com/${encoded}`;
    case "instagram":
      return `https://instagram.com/${encoded}`;
    case "x":
      return `https://x.com/${encoded}`;
    case "threads":
      return `https://www.threads.net/@${encoded}`;
    case "bluesky":
      return `https://bsky.app/profile/${encoded}`;
    case "reddit":
      return `https://www.reddit.com/user/${encoded}`;
    case "discord":
      return /^\d{17,20}$/.test(username)
        ? `https://discord.com/users/${encoded}`
        : null;
    case "youtube":
      return `https://www.youtube.com/@${encoded}`;
    case "tiktok":
      return `https://www.tiktok.com/@${encoded}`;
    case "twitch":
      return `https://www.twitch.tv/${encoded}`;
    case "spotify":
      return `https://open.spotify.com/user/${encoded}`;
    case "lastfm":
      return `https://www.last.fm/user/${encoded}`;
    case "soundcloud":
      return `https://soundcloud.com/${encoded}`;
    case "bandcamp":
      return `https://bandcamp.com/${encoded}`;
  }
}
