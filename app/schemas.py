
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
    favorite_artist_review: str | None = None
    favorite_artist_rating: int | None = None
    favorite_track: str | None = None
    favorite_track_url: str | None = None
    favorite_track_review: str | None = None
    favorite_track_rating: int | None = None
    favorite_album: str | None = None
    favorite_album_url: str | None = None
    favorite_album_review: str | None = None
    favorite_album_rating: int | None = None
    avatar_frame: str | None = None
    is_private: bool | None = False
    hidden_artists: str | None = ""
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
