/** Typed shapes of backend API responses used by the frontend. */

export type ImportStatus =
  "none" | "pending" | "in_progress" | "completed" | "failed";

export interface LastfmImportJob {
  id?: number;
  status: ImportStatus;
  lastfm_username?: string;
  current_page?: number;
  total_pages?: number;
  progress?: number;
  imported_tracks?: number;
  total_tracks?: number;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  incremental?: boolean;
}

export interface StartImportResponse {
  status: "import_started" | "already_running";
  job: LastfmImportJob;
}

export interface DeveloperApiKey {
  id: number;
  name: string;
  prefix: string;
  scopes: string[];
  created_at: string | null;
  expires_at: string | null;
  last_used_at: string | null;
}

export interface DeviceCodeInfo {
  user_code: string;
  client_name: string;
  expires_at: string;
}

export interface VapidKeyResponse {
  enabled: boolean;
  vapid_public_key: string | null;
}

export type NotificationKind = "like" | "comment" | "follow";

export interface SocialNotification {
  id: number;
  kind: NotificationKind;
  text: string;
  message: string | null;
  actor: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
  track: { title: string; artist: string | null } | null;
  is_read: boolean;
  created_at: string | null;
}

export interface NotificationList {
  items: SocialNotification[];
  unread: number;
}

export interface WebhookInfo {
  id: number;
  url: string;
  events: string[];
  is_active: boolean;
  created_at: string | null;
}

export interface CreatedWebhook {
  id: number;
  url: string;
  secret: string;
  events: string[];
  message: string;
}

export interface ExportConfig {
  is_lastfm_enabled: boolean;
  is_listenbrainz_enabled: boolean;
  is_librefm_enabled: boolean;
  has_lastfm_session: boolean;
  has_listenbrainz_token: boolean;
  has_librefm_session: boolean;
}

/** Short user card (followers, leaderboard, search). */
export interface UserCard {
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified?: boolean | number;
  role?: string;
  level?: number;
  total_xp?: number;
  theme?: string;
}

export interface AchievementInfo {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  target_image: string | null;
  reward_xp: number;
  is_earned?: boolean;
  earned_at?: string | null;
  is_displayed?: boolean;
  /** Share of users who earned it, in percent. */
  rarity?: number;
  current_progress?: number;
  target_value?: number | string | null;
  rule_type?: string;
  rule_target?: string | null;
  rule_meta?: string | null;
}

/** GET /api/user/{username} */
export interface UserInfo {
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  cover_url: string | null;
  location: string | null;
  favorite_genre: string | null;
  equipment: string | null;
  social_links: string;
  theme: string;
  is_private: boolean;
  hidden_artists: string;
  sync_privacy: "all" | "followers" | "none";
  is_verified: boolean;
  favorite_artist: string | null;
  favorite_artist_url: string | null;
  favorite_artist_cover: string | null;
  favorite_artist_updated_at: string | null;
  favorite_track: string | null;
  favorite_track_url: string | null;
  favorite_track_cover: string | null;
  favorite_track_updated_at: string | null;
  favorite_album: string | null;
  favorite_album_url: string | null;
  favorite_album_cover: string | null;
  favorite_album_updated_at: string | null;
  avatar_frame: string;
  level: number;
  rank: string;
  spotify_linked: boolean;
  yandex_linked: boolean;
  lastfm_username: string | null;
  has_imported_lastfm: boolean;
  last_sync: string | null;
  role: string;
  achievements: AchievementInfo[];
  streak: number;
  has_api_key: boolean;
  /** Only present for the owner in some responses */
  api_key?: string;
  yandex_token?: string;
}

/** One scrobble in history / feeds. */
export interface HistoryEntry {
  id: number;
  username: string;
  avatar_url: string | null;
  artist: string;
  title: string;
  album?: string | null;
  cover_url: string;
  track_url: string;
  source: string;
  time: string;
  relative_time: string;
  duration: number;
  listened_sec: number;
  is_playing: boolean;
  updated_at: string;
  is_imported: boolean;
  likes_count: number;
  comments_count: number;
  is_liked?: boolean;
}

export interface TopTrack {
  title: string;
  artist: string;
  cover_url: string | null;
  track_url: string | null;
  plays: number;
  source: string;
}

/** GET /api/stats/{username} */
export interface UserStats {
  total_scrobbles: number;
  total_xp: number;
  top_tracks: TopTrack[];
  top_artists: { artist: string; plays: number; source: string }[];
}

/** GET /api/detailed-stats/{username} */
export interface DetailedStats {
  user: Pick<UserCard, "username" | "display_name" | "avatar_url">;
  total_time_min: number;
  total_scrobbles: number;
  unique_artists: number;
  unique_tracks: number;
  top_artists: { name: string; plays: number; source: string }[];
  top_tracks: TopTrack[];
  top_albums: {
    album: string;
    artist: string;
    cover_url: string | null;
    plays: number;
    source: string;
  }[];
  genre_counts: Record<string, number>;
  source_counts: Record<string, number>;
  activity_graph: Record<string, number>;
  hours_activity: Record<string, number>;
  days_activity: Record<string, number>;
}

export interface CompatibilityResult {
  user1: string;
  user2: string;
  score: number;
  tier: string;
  common_artists: {
    artist: string;
    user1_plays: number;
    user2_plays: number;
    total_plays: number;
  }[];
  common_genres: string[];
  summary?: string;
}

/** GET /api/recommendations?username= (artists liked by taste twins) */
export interface ArtistRecommendation {
  artist: string;
  cover_url: string | null;
  reason: string;
}

export interface MoodInfo {
  mood: string;
  emoji: string;
}

/** GET /api/discovery/taste-twins entry. */
export interface TasteTwin {
  username: string;
  display_name: string;
  avatar_url: string | null;
  match: number;
  common_artists: string[];
}

/** GET /api/leaderboard entry. */
export interface LeaderboardEntry {
  username: string;
  display_name: string;
  avatar_url: string | null;
  total_xp: number;
  total_scrobbles?: number;
  level: number;
  is_verified: boolean;
  role: string;
  theme: string;
}

export interface TasteMatch {
  match: number;
  common_artists: string[];
}

export interface WrappedStats {
  period: string;
  status: string;
  top_artist: string;
  total_minutes: number;
}

export interface FollowStats {
  followers: number;
  following: number;
  is_following: boolean;
}

export interface SocialLink {
  id: number | string;
  network: string;
  username: string;
}

export interface Country {
  name: string;
  code: string;
  flag: string;
}

/** Anything that can be turned into a link to a track on its service. */
export interface TrackLinkSource {
  artist?: string | null;
  title?: string | null;
  track_url?: string | null;
  source?: string | null;
}
