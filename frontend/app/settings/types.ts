import type { UserInfo, UserPreferences } from "@/app/lib/types";
import { DEFAULT_PREFERENCES, mergePreferences } from "@/app/lib/preferences";

export type { Country, SocialLink } from "@/app/lib/types";

/** Editable form state of the settings page. */
export interface SettingsData {
  displayName: string;
  bio: string;
  avatarUrl: string;
  coverUrl: string;
  location: string;
  favoriteGenre: string;
  equipment: string;
  favArtist: string;
  favArtistUpdatedAt: string | null;
  favTrack: string;
  favTrackUpdatedAt: string | null;
  favAlbum: string;
  favAlbumUpdatedAt: string | null;
  avatarFrame: string;
  theme: string;
  country: string;
  city: string;
  isPrivate: boolean;
  hiddenArtists: string;
  syncPrivacy: string;
  yandexToken: string;
  lastfmUsername: string;
  preferences: UserPreferences;
}

export type UpdateData = <K extends keyof SettingsData>(
  key: K,
  value: SettingsData[K],
) => void;

export type PreferenceSection = Exclude<keyof UserPreferences, "version">;
export type UpdatePreference = <S extends PreferenceSection>(
  section: S,
  value: UserPreferences[S],
) => void;

/** Fields of the form that take an uploaded image URL. */
export type ImageField = "avatarUrl" | "coverUrl";

export type SettingsProfile = UserInfo;

export const EMPTY_SETTINGS: SettingsData = {
  displayName: "",
  bio: "",
  avatarUrl: "",
  coverUrl: "",
  location: "",
  favoriteGenre: "",
  equipment: "",
  favArtist: "",
  favArtistUpdatedAt: null,
  favTrack: "",
  favTrackUpdatedAt: null,
  favAlbum: "",
  favAlbumUpdatedAt: null,
  avatarFrame: "",
  theme: "classic",
  country: "",
  city: "",
  isPrivate: false,
  hiddenArtists: "",
  syncPrivacy: "all",
  yandexToken: "",
  lastfmUsername: "",
  preferences: structuredClone(DEFAULT_PREFERENCES),
};

const DEFAULT_BIO = "Этот пользователь пока ничего о себе не рассказал.";

/** Form state from the profile returned by GET /api/user/{username}. */
export function settingsFromProfile(
  u: UserInfo,
  preferences?: Partial<UserPreferences> | null,
): SettingsData {
  const loc = u.location || "";
  const [country = "", city = ""] = loc.split(",").map((s) => s.trim());
  return {
    displayName: u.display_name === u.username ? "" : u.display_name,
    bio: u.bio === DEFAULT_BIO ? "" : u.bio,
    avatarUrl: u.avatar_url || "",
    coverUrl: u.cover_url || "",
    location: loc,
    country,
    city,
    favoriteGenre: u.favorite_genre || "",
    equipment: u.equipment || "",
    favArtist: u.favorite_artist || "",
    favArtistUpdatedAt: u.favorite_artist_updated_at || null,
    favTrack: u.favorite_track || "",
    favTrackUpdatedAt: u.favorite_track_updated_at || null,
    favAlbum: u.favorite_album || "",
    favAlbumUpdatedAt: u.favorite_album_updated_at || null,
    avatarFrame: u.avatar_frame || "",
    theme: u.theme || "classic",
    isPrivate: u.is_private || false,
    hiddenArtists: u.hidden_artists || "",
    syncPrivacy: u.sync_privacy || "all",
    yandexToken: u.yandex_token || "",
    lastfmUsername: u.lastfm_username || "",
    preferences: mergePreferences(preferences),
  };
}
