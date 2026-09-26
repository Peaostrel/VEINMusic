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
