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
