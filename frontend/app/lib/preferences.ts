import type { UserPreferences } from "./types";

type PartialPreferences = {
  version?: 1;
} & {
  [Section in Exclude<keyof UserPreferences, "version">]?: Partial<
    UserPreferences[Section]
  >;
};

const CHANNELS = {
  likes: true,
  comments: true,
  follows: true,
  achievements: true,
  system: true,
  weekly_digest: true,
  new_releases: false,
  room_invites: true,
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  version: 1,
  appearance: {
    color_mode: "dark",
    density: "comfortable",
    font_scale: "normal",
    reduce_motion: false,
    high_contrast: false,
    background_blur: true,
  },
  profile: {
    section_order: [
      "showcase",
      "recommendations",
      "history",
      "wrapped",
      "top_tracks",
      "top_artists",
    ],
    hidden_sections: [],
    show_online_status: true,
  },
  privacy: {
    history: "all",
    statistics: "all",
    current_track: "all",
    showcase: "all",
    followers: "all",
    location: "all",
    location_precision: "city",
    social_links: "all",
    show_listening_source: true,
  },
  listening: {
    ignored_artists: [],
    ignored_tracks: [],
    ignored_sources: [],
    ignore_short_tracks: false,
    short_track_seconds: 30,
    private_session_until: null,
    auto_metadata: true,
  },
  feed: {
    share_scrobbles: true,
    share_achievements: true,
    allow_comments: true,
    allow_likes: true,
    default_scope: "all",
    hidden_sources: [],
  },
  notifications: {
    in_app: { ...CHANNELS },
    push: { ...CHANNELS },
    quiet_hours_enabled: false,
    quiet_from: "23:00",
    quiet_to: "08:00",
  },
  wrapped: {
    default_period: "30d",
    show_minutes: true,
    show_artists: true,
    show_tracks: true,
    show_new_artists: true,
    identity: "username",
    card_style: "classic",
    auto_weekly: false,
    auto_monthly: true,
  },
  integrations: {
    spotify_enabled: true,
    yandex_enabled: true,
    youtube_music_enabled: true,
    soundcloud_enabled: true,
    lastfm_enabled: true,
    auto_sync: true,
  },
  experiments: {
    smart_recommendations: true,
    taste_passport: false,
    new_profile_layout: false,
    diagnostics: false,
  },
  goals: {
    items: [],
  },
};

export function mergePreferences(
  value?: PartialPreferences | null,
): UserPreferences {
  if (!value) return structuredClone(DEFAULT_PREFERENCES);
  return {
    ...structuredClone(DEFAULT_PREFERENCES),
    ...value,
    appearance: { ...DEFAULT_PREFERENCES.appearance, ...value.appearance },
    profile: { ...DEFAULT_PREFERENCES.profile, ...value.profile },
    privacy: { ...DEFAULT_PREFERENCES.privacy, ...value.privacy },
    listening: { ...DEFAULT_PREFERENCES.listening, ...value.listening },
    feed: { ...DEFAULT_PREFERENCES.feed, ...value.feed },
    notifications: {
      ...DEFAULT_PREFERENCES.notifications,
      ...value.notifications,
      in_app: {
        ...DEFAULT_PREFERENCES.notifications.in_app,
        ...value.notifications?.in_app,
      },
      push: {
        ...DEFAULT_PREFERENCES.notifications.push,
        ...value.notifications?.push,
      },
    },
    wrapped: { ...DEFAULT_PREFERENCES.wrapped, ...value.wrapped },
    integrations: {
      ...DEFAULT_PREFERENCES.integrations,
      ...value.integrations,
    },
    experiments: {
      ...DEFAULT_PREFERENCES.experiments,
      ...value.experiments,
    },
    goals: { ...DEFAULT_PREFERENCES.goals, ...value.goals },
  };
}

export function applyAppearance(appearance: UserPreferences["appearance"]) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const systemLight = globalThis.matchMedia?.(
    "(prefers-color-scheme: light)",
  ).matches;
  const mode =
    appearance.color_mode === "system"
      ? systemLight
        ? "light"
        : "dark"
      : appearance.color_mode;
  root.dataset.colorMode = mode;
  root.dataset.density = appearance.density;
  root.dataset.fontScale = appearance.font_scale;
  root.dataset.reduceMotion = appearance.reduce_motion ? "1" : "0";
  root.dataset.highContrast = appearance.high_contrast ? "1" : "0";
  root.dataset.backgroundBlur = appearance.background_blur ? "1" : "0";
}

export function storePreferences(preferences: UserPreferences) {
  localStorage.setItem("vein_preferences", JSON.stringify(preferences));
  applyAppearance(preferences.appearance);
  globalThis.dispatchEvent(new Event("preferences_update"));
}

export function storedPreferences(): UserPreferences {
  if (typeof localStorage === "undefined") return mergePreferences();
  try {
    return mergePreferences(
      JSON.parse(localStorage.getItem("vein_preferences") || "null"),
    );
  } catch {
    return mergePreferences();
  }
}
