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
    return "border border-line text-accent";
  }
  if (role === "moderator") {
    return "border border-line text-fg";
  }
  return "bg-surface-2 text-fg-2";
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
  showcase: {
    field: "artist" | "track" | "album";
    value: string | null;
    cover: string | null;
    locked_until: string | null;
  }[];
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

export interface LogEntry {
  id: string;
  ts: string;
  level: "WARNING" | "ERROR" | "CRITICAL";
  source: string;
  logger: string;
  message: string;
  trace: string | null;
}

export interface LogPage extends Paged<LogEntry> {
  shared: boolean;
  sources: string[];
  counts: Record<string, number>;
}

export interface AdminScrobble {
  id: number;
  username: string;
  track_id: number;
  title: string;
  artist: string;
  cover_url: string | null;
  duration: number;
  source: string | null;
  played_at: string | null;
  listened_sec: number;
  xp_earned: number;
  counted: boolean;
  is_imported: boolean;
}

export interface ScrobblePage extends Paged<AdminScrobble> {
  sources: string[];
}

export interface BulkDeleteResult {
  matched: number;
  xp: number;
  deleted: number;
}

export interface YandexLiveStatus {
  connected: boolean;
  since_ms: number | null;
  last_event_ms: number | null;
  track_id: string | null;
  playing: boolean;
  web: boolean;
  last_error: string | null;
  last_error_ms: number | null;
  connections: number;
}

export interface IntegrationRow {
  username: string;
  avatar_url: string | null;
  is_banned: boolean;
  yandex: boolean;
  yandex_live: YandexLiveStatus | null;
  spotify: boolean;
  lastfm_username: string | null;
  last_sync: string | null;
  last_scrobble: string | null;
}

export interface IntegrationPage extends Paged<IntegrationRow> {
  redis: boolean;
  worker_heartbeat_ms: number | null;
  now_ms: number;
}

export interface AdminReport {
  id: number;
  type: "user" | "comment";
  reporter: { username: string; is_banned: boolean } | null;
  target: { username: string; is_banned: boolean } | null;
  target_open_reports: number;
  comment: { id: number | null; text: string | null; exists: boolean } | null;
  reason: string;
  details: string | null;
  status: "open" | "resolved" | "dismissed";
  created_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution: string | null;
}

export interface ReportPage extends Paged<AdminReport> {
  open_count: number;
}
