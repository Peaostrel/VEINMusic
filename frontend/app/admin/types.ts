// Types shared by the admin panel and its tabs

export interface User {
  id: number;
  username: string;
  display_name: string;
  avatar_url?: string;
  bio?: string;
  is_verified?: boolean;
  is_dev?: boolean;
  role?: string;
  is_banned?: boolean;
  is_flagged_antifraud?: boolean;
  antifraud_reason?: string;
  scrobbles: number;
  total_xp: number;
}

export interface SuspiciousUser {
  user_id: number;
  username: string;
  display_name?: string;
  avatar_url?: string;
  risk_score: number;
  is_banned: boolean;
  is_flagged: boolean;
  antifraud_reason?: string;
  reasons: string[];
  total_scrobbles: number;
  total_xp: number;
}

export interface Achievement {
  id: number;
  name: string;
  description: string;
  icon: string;
  rule_type: string;
  rule_value: number;
  rule_target: string | null;
  rule_meta: string | null;
  target_image: string | null;
  reward_xp: number;
}

export interface AvatarFrame {
  id: number;
  name: string;
  code: string;
  css_style?: string;
  image_url?: string;
  rarity: string;
  required_level: number;
  is_active: boolean;
}

export interface SystemAnnouncement {
  id: number;
  title: string;
  message: string;
  type: string;
  is_active: boolean;
  created_at?: string;
}

export interface FeatureFlag {
  id: number;
  key: string;
  description?: string;
  is_enabled: boolean;
}

export interface Track {
  id: number;
  title: string;
  artist: string;
  cover_url?: string;
  track_url?: string;
}

export interface SystemHealth {
  status: string;
  timestamp: string;
  database: {
    users: number;
    scrobbles: number;
    tracks: number;
    pool_status: string;
  };
  websockets: {
    active_rooms: number;
    connected_clients: number;
  };
  cloud_scrobblers: {
    yandex_users: number;
    spotify_users: number;
  };
}

export interface SystemAnalytics {
  dau: number;
  mau: number;
  scrobbles_24h: number;
  source_distribution: Record<string, number>;
}

export const getUserRoleBadge = (role?: string) => {
  if (role === "admin") {
    return "bg-red-950/60 border border-red-500/40 text-red-400";
  }
  if (role === "moderator") {
    return "bg-purple-950/60 border border-purple-500/40 text-purple-400";
  }
  return "bg-white/5 text-gray-400";
};

// --- Admin tools (audit, moderation, user card, catalog, system) -----------

export interface Paged<T> {
  total: number;
  items: T[];
}

export interface AuditEntry {
  id: number;
  admin: string;
  action: string;
  target: string | null;
  details: Record<string, unknown> | string | null;
  created_at: string | null;
}

export interface AuditPage extends Paged<AuditEntry> {
  actions: string[];
}

export interface AdminComment {
  id: number;
  content: string;
  created_at: string | null;
  author: { username: string; is_banned: boolean; avatar_url: string | null };
  scrobble: { id: number; title: string; artist: string; owner: string } | null;
}

export interface CatalogTrack {
  id: number;
  title: string;
  artist: string;
  album: string | null;
  genre: string | null;
  cover_url: string | null;
  track_url: string | null;
  duration: number | null;
  plays: number;
}

export interface UserDetails {
  user: {
    id: number;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    role: string;
    is_banned: boolean;
    is_flagged: boolean;
    antifraud_reason: string | null;
    is_private: boolean;
    location: string | null;
    created_at: string | null;
    session_version: number;
  };
  integration: {
    is_verified: boolean;
    bonus_xp: number;
    current_streak: number;
    spotify_linked: boolean;
    yandex_linked: boolean;
    lastfm_username: string | null;
    last_sync: string | null;
  };
  export: { lastfm: boolean; listenbrainz: boolean; librefm: boolean };
  stats: {
    scrobbles: number;
    counted: number;
    xp: number;
    followers: number;
    following: number;
    comments: number;
    likes: number;
  };
  api_keys: {
    id: number;
    name: string;
    prefix: string;
    scopes: string;
    is_active: boolean;
    created_at: string | null;
    last_used_at: string | null;
    expires_at: string | null;
  }[];
  webhooks: { id: number; url: string; events: string; is_active: boolean }[];
  push_subscriptions: number;
  recent_scrobbles: {
    id: number;
    title: string;
    artist: string;
    source: string;
    listened_sec: number;
    duration: number;
    xp: number;
    played_at: string | null;
  }[];
  achievements: {
    id: number;
    name: string | null;
    icon: string | null;
    earned_at: string | null;
  }[];
  imports: {
    id: number;
    status: string;
    lastfm_username: string;
    imported_tracks: number;
    total_tracks: number;
    error: string | null;
  }[];
}

export interface Timeseries {
  days: string[];
  registrations: number[];
  scrobbles: number[];
  active_users: number[];
  since: string;
}

export interface SystemStatus {
  worker: {
    redis: boolean;
    queued_jobs: number | null;
    cron: Record<string, string | null>;
  };
  database: { dialect: string; bytes: number | null };
  uploads: { available: boolean; files: number; bytes: number };
  backups: {
    available: boolean;
    count: number;
    bytes: number;
    latest: {
      name: string;
      bytes: number;
      created_at: string;
      age_hours: number;
    } | null;
  };
}

export interface LastfmJob {
  id: number;
  user_id: number;
  lastfm_username: string;
  status: string;
  progress: number;
  total_tracks: number;
  imported_tracks: number;
  error_log: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface TogetherRoom {
  room_id: string;
  name: string;
  host_username: string;
  listeners_count: number;
  listeners: string[];
  current_track: { title?: string; artist?: string } | null;
}

export interface BlacklistFilter {
  id: number;
  pattern: string;
  filter_type: string;
  reason: string | null;
  is_active: boolean;
}
