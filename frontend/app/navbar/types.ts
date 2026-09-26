/** User as returned by GET /api/user/{username} and /api/search/users. */
export interface NavUser {
  username: string;
  display_name?: string;
  avatar_url?: string | null;
  avatar_frame?: string | null;
  role?: string;
  is_verified?: boolean;
  level?: number;
  theme?: string;
}
