
from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    username: str = Field(..., max_length=32)
    password: str = Field(..., max_length=128)


class ScrobbleData(BaseModel):
    # api_key parameter is removed since we use cookies now, but we'll keep it
    # optional for extension compatibility if needed
    api_key: str | None = None
    title: str
    artist: str
    cover_url: str | None = None
    track_url: str | None = None
    album: str | None = None
    source: str
    progress_sec: int | None = 0
    is_playing: bool | None = True
    duration: int | None = 0


class ProfileUpdate(BaseModel):
    # api_key optional for compatibility, but we rely on cookies
    api_key: str | None = None
    display_name: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    cover_url: str | None = None
    location: str | None = None
    favorite_genre: str | None = None
    equipment: str | None = None
    social_links: str | None = None
    theme: str | None = None
    favorite_artist: str | None = None
    favorite_artist_url: str | None = None
    favorite_track: str | None = None
    favorite_track_url: str | None = None
    favorite_album: str | None = None
    favorite_album_url: str | None = None
    avatar_frame: str | None = None
    is_private: bool | None = False
    hidden_artists: str | None = ""
    sync_privacy: str | None = "all"
    lastfm_username: str | None = None


class LevelUpdate(BaseModel):
    api_key: str | None = None
    new_level: int


class AchCreate(BaseModel):
    api_key: str | None = None
    name: str
    description: str
    icon: str
    rule_type: str = "manual"
    rule_value: int = 0
    rule_target: str | None = None
    rule_meta: str | None = None
    target_image: str | None = None
    reward_xp: int = 0


class AchUpdate(BaseModel):
    api_key: str | None = None
    name: str
    description: str
    icon: str
    rule_type: str = "manual"
    rule_value: int = 0
    rule_target: str | None = None
    rule_meta: str | None = None
    target_image: str | None = None
    reward_xp: int = 0


class AchAssign(BaseModel):
    api_key: str | None = None
    achievement_id: int


class ToggleAch(BaseModel):
    api_key: str | None = None
    achievement_id: int


class FollowAction(BaseModel):
    api_key: str | None = None


class VerifyUserRequest(BaseModel):
    api_key: str | None = None
    is_verified: bool


class MarkRead(BaseModel):
    ua_ids: list[int]


class LikeRequest(BaseModel):
    api_key: str | None = None


class CommentRequest(BaseModel):
    api_key: str | None = None
    content: str = Field(..., max_length=1000)


class AdminUserUpdate(BaseModel):
    api_key: str | None = None
    display_name: str | None = None
    bio: str | None = None
    avatar_url: str | None = None


class ApiKeyRequest(BaseModel):
    api_key: str | None = None


class PrivacyUpdate(BaseModel):
    is_private: bool | None = None
    hidden_artists: str | None = None
    sync_privacy: str | None = None


class UserBanRequest(BaseModel):
    is_banned: bool


class UserRoleRequest(BaseModel):
    role: str


class CatalogMergeRequest(BaseModel):
    source_track_id: int | None = None
    target_track_id: int | None = None
    source_artist: str | None = None
    target_artist: str | None = None


class FrameCreate(BaseModel):
    name: str
    code: str
    css_style: str | None = None
    image_url: str | None = None
    rarity: str = "common"
    required_level: int = 1
    is_active: bool = True


class FrameUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    css_style: str | None = None
    image_url: str | None = None
    rarity: str | None = None
    required_level: int | None = None
    is_active: bool | None = None


class AnnouncementCreate(BaseModel):
    title: str
    message: str
    type: str = "info"
    is_active: bool = True


class AnnouncementUpdate(BaseModel):
    title: str | None = None
    message: str | None = None
    type: str | None = None
    is_active: bool | None = None


class FeatureFlagCreate(BaseModel):
    key: str
    description: str | None = None
    is_enabled: bool = True


class FeatureFlagUpdate(BaseModel):
    is_enabled: bool
    description: str | None = None


class EconomyMultiplierRequest(BaseModel):
    multiplier: float = Field(..., ge=0.1, le=10.0)


class ApiKeyCreate(BaseModel):
    name: str = Field("Default API Key", max_length=64)
    scopes: str = Field("scrobble:write,profile:read", max_length=128)
    expires_in_days: int | None = Field(None, ge=1, le=365)


class WebhookCreate(BaseModel):
    url: str = Field(..., max_length=512)
    events: str = Field("scrobble.created,achievement.unlocked", max_length=256)


class ExternalSyncUpdate(BaseModel):
    lastfm_session_key: str | None = None
    listenbrainz_token: str | None = None
    librefm_session_key: str | None = None
    is_lastfm_enabled: bool | None = None
    is_listenbrainz_enabled: bool | None = None
    is_librefm_enabled: bool | None = None


class BlacklistFilterCreate(BaseModel):
    pattern: str = Field(..., max_length=256)
    filter_type: str = Field("keyword", max_length=32)
    reason: str | None = None


class PushSubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str
