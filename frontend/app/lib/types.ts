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
