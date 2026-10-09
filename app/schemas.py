
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, field_validator

SyncPrivacy = Literal["all", "followers", "none"]
Visibility = Literal["all", "followers", "private"]
ProfileSection = Literal[
    "showcase", "recommendations", "history", "wrapped",
    "top_tracks", "top_artists",
]


def _default_profile_section_order() -> list[ProfileSection]:
    return [
        "showcase", "recommendations", "history", "wrapped",
        "top_tracks", "top_artists",
    ]


def _truncate(limit: int):
    """Cut over-long strings instead of rejecting them: a real track with a
    very long name should still be scrobbled, just not stored in full."""
    def cut(value: Any) -> Any:
        return value[:limit] if isinstance(value, str) else value
    return BeforeValidator(cut)


def _clamp_seconds(value: Any) -> Any:
    """Keep playback positions/durations within 0..24h (players occasionally
    report negative or absurd values; the scrobble is still worth keeping)."""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return int(min(max(value, 0), 86400))
    return value


Seconds = Annotated[int | None, BeforeValidator(_clamp_seconds)]

# Scrobbles feed a catalog shared by all users, so their text is bounded
TrackText = Annotated[str, _truncate(300)]
OptionalTrackText = Annotated[str | None, _truncate(300)]
OptionalUrl = Annotated[str | None, _truncate(2048)]


class UserCreate(BaseModel):
    username: str = Field(..., max_length=32)
    password: str = Field(..., max_length=128)


class ScrobbleData(BaseModel):
    # api_key parameter is removed since we use cookies now, but we'll keep it
    # optional for extension compatibility if needed
    api_key: str | None = None
    title: TrackText
    artist: TrackText
    cover_url: OptionalUrl = None
    track_url: OptionalUrl = None
    album: OptionalTrackText = None
    source: Annotated[str, _truncate(32)]
    progress_sec: Seconds = 0
    is_playing: bool | None = True
    duration: Seconds = 0


class ProfileUpdate(BaseModel):
    # api_key optional for compatibility, but we rely on cookies.
    # All fields default to None so that omitted fields are left untouched
    # (in particular, privacy settings must never be reset implicitly).
    api_key: str | None = None
    display_name: str | None = Field(None, max_length=64)
    bio: str | None = Field(None, max_length=1000)
    avatar_url: str | None = Field(None, max_length=2048)
    cover_url: str | None = Field(None, max_length=2048)
    location: str | None = Field(None, max_length=128)
    favorite_genre: str | None = Field(None, max_length=128)
    equipment: str | None = Field(None, max_length=256)
    social_links: str | None = Field(None, max_length=4096)
    theme: str | None = Field(None, max_length=64)
    favorite_artist: str | None = Field(None, max_length=256)
    favorite_artist_url: str | None = None
    favorite_track: str | None = Field(None, max_length=256)
    favorite_track_url: str | None = None
    favorite_album: str | None = Field(None, max_length=256)
    favorite_album_url: str | None = None
    avatar_frame: str | None = Field(None, max_length=64)
    is_private: bool | None = None
    hidden_artists: str | None = Field(None, max_length=4096)
    sync_privacy: SyncPrivacy | None = None
    lastfm_username: str | None = Field(None, max_length=64)


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
    artist_targets: list[str] | None = None
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
    artist_targets: list[str] | None = None
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


class ScrobbleMergeRequest(BaseModel):
    source_track_id: int = Field(..., gt=0)
    target_track_id: int = Field(..., gt=0)


class IntegrationSyncRequest(BaseModel):
    service: Literal["all", "spotify", "yandex", "soundcloud"] = "all"


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
    hidden_artists: str | None = Field(None, max_length=4096)
    sync_privacy: SyncPrivacy | None = None


class AppearancePreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    color_mode: Literal["dark", "light", "system"] = "dark"
    density: Literal["comfortable", "compact"] = "comfortable"
    font_scale: Literal["small", "normal", "large"] = "normal"
    reduce_motion: bool = False
    high_contrast: bool = False
    background_blur: bool = True


class ProfilePreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    section_order: list[ProfileSection] = Field(
        default_factory=_default_profile_section_order,
        min_length=6,
        max_length=6,
    )
    hidden_sections: list[ProfileSection] = Field(
        default_factory=list,
        max_length=6,
    )
    show_online_status: bool = True

    @field_validator("section_order")
    @classmethod
    def unique_sections(cls, value):
        if len(set(value)) != len(value):
            raise ValueError("Разделы профиля не должны повторяться")
        return value


class PrivacyPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    history: Visibility = "all"
    statistics: Visibility = "all"
    current_track: Visibility = "all"
    showcase: Visibility = "all"
    followers: Visibility = "all"
    location: Visibility = "all"
    location_precision: Literal["city", "country"] = "city"
    social_links: Visibility = "all"
    show_listening_source: bool = True


class ListeningPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ignored_artists: list[str] = Field(default_factory=list, max_length=50)
    ignored_tracks: list[str] = Field(default_factory=list, max_length=100)
    ignored_sources: list[Literal[
        "yandex", "spotify", "vk", "youtube", "apple", "soundcloud", "desktop",
    ]] = Field(default_factory=list, max_length=7)
    ignore_short_tracks: bool = False
    short_track_seconds: int = Field(30, ge=15, le=120)
    private_session_until: datetime | None = None
    auto_metadata: bool = True

    @field_validator("ignored_artists", "ignored_tracks")
    @classmethod
    def clean_ignore_list(cls, values):
        clean = []
        for value in values:
            item = str(value).strip()[:300]
            if item and item.casefold() not in {entry.casefold() for entry in clean}:
                clean.append(item)
        return clean


class FeedPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    share_scrobbles: bool = True
    share_achievements: bool = True
    allow_comments: bool = True
    allow_likes: bool = True
    default_scope: Literal["all", "following"] = "all"
    hidden_sources: list[Literal[
        "yandex", "spotify", "vk", "youtube", "apple", "soundcloud", "desktop",
    ]] = Field(default_factory=list, max_length=7)


class NotificationChannelPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    likes: bool = True
    comments: bool = True
    follows: bool = True
    achievements: bool = True
    system: bool = True
    weekly_digest: bool = True
    new_releases: bool = False
    room_invites: bool = True


class NotificationPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    in_app: NotificationChannelPreferences = Field(default_factory=NotificationChannelPreferences)
    push: NotificationChannelPreferences = Field(default_factory=NotificationChannelPreferences)
    quiet_hours_enabled: bool = False
    quiet_from: str = Field("23:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    quiet_to: str = Field("08:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class WrappedPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    default_period: Literal["7d", "30d", "90d", "year", "all"] = "30d"
    show_minutes: bool = True
    show_artists: bool = True
    show_tracks: bool = True
    show_new_artists: bool = True
    identity: Literal["username", "display_name"] = "username"
    card_style: Literal["classic", "minimal", "vivid"] = "classic"
    auto_weekly: bool = False
    auto_monthly: bool = True


class IntegrationPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    spotify_enabled: bool = True
    yandex_enabled: bool = True
    youtube_music_enabled: bool = True
    soundcloud_enabled: bool = True
    lastfm_enabled: bool = True
    auto_sync: bool = True


class ExperimentPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    smart_recommendations: bool = True
    taste_passport: bool = False
    new_profile_layout: bool = False
    diagnostics: bool = False


class MusicGoal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(..., min_length=1, max_length=64)
    type: Literal["weekly_scrobbles", "monthly_minutes", "new_artists", "streak"]
    title: str = Field(..., min_length=1, max_length=100)
    target: int = Field(..., ge=1, le=100000)
    active: bool = True


class GoalsPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[MusicGoal] = Field(default_factory=list, max_length=10)


def _default_listening_preferences() -> ListeningPreferences:
    # Pydantic treats constrained Field defaults as optional at runtime, while
    # its static typing metadata still requires them in the constructor.
    return ListeningPreferences(short_track_seconds=30)


def _default_notification_preferences() -> NotificationPreferences:
    return NotificationPreferences(quiet_from="23:00", quiet_to="08:00")


class UserPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = 1
    appearance: AppearancePreferences = Field(default_factory=AppearancePreferences)
    profile: ProfilePreferences = Field(default_factory=ProfilePreferences)
    privacy: PrivacyPreferences = Field(default_factory=PrivacyPreferences)
    listening: ListeningPreferences = Field(
        default_factory=_default_listening_preferences,
    )
    feed: FeedPreferences = Field(default_factory=FeedPreferences)
    notifications: NotificationPreferences = Field(
        default_factory=_default_notification_preferences,
    )
    wrapped: WrappedPreferences = Field(default_factory=WrappedPreferences)
    integrations: IntegrationPreferences = Field(default_factory=IntegrationPreferences)
    experiments: ExperimentPreferences = Field(default_factory=ExperimentPreferences)
    goals: GoalsPreferences = Field(default_factory=GoalsPreferences)


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
    endpoint: str = Field(..., max_length=2048)
    p256dh: str = Field(..., max_length=256)
    auth: str = Field(..., max_length=256)


class PushUnsubscribeRequest(BaseModel):
    endpoint: str = Field(..., max_length=2048)


class YandexTokenUpdate(BaseModel):
    token: str = Field(..., max_length=512)
