from pydantic import BaseModel, Field
from typing import Optional, List

class UserCreate(BaseModel): 
    username: str = Field(..., max_length=32)
    password: str = Field(..., max_length=128)

class ScrobbleData(BaseModel): 
    # api_key parameter is removed since we use cookies now, but we'll keep it optional for extension compatibility if needed
    api_key: Optional[str] = None
    title: str
    artist: str
    cover_url: Optional[str] = None
    track_url: Optional[str] = None
    album: Optional[str] = None
    source: str
    progress_sec: Optional[int] = 0
    is_playing: Optional[bool] = True
    duration: Optional[int] = 0

class ProfileUpdate(BaseModel):
    # api_key optional for compatibility, but we rely on cookies
    api_key: Optional[str] = None
    display_name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    cover_url: Optional[str] = None
    location: Optional[str] = None
    favorite_genre: Optional[str] = None
    equipment: Optional[str] = None
    social_links: Optional[str] = None
    theme: Optional[str] = None
    favorite_artist: Optional[str] = None
    favorite_artist_url: Optional[str] = None
    favorite_track: Optional[str] = None
    favorite_track_url: Optional[str] = None
    favorite_album: Optional[str] = None
    favorite_album_url: Optional[str] = None
    is_private: Optional[bool] = False
    hidden_artists: Optional[str] = ""
    lastfm_username: Optional[str] = None

class LevelUpdate(BaseModel): 
    api_key: Optional[str] = None
    new_level: int

class AchCreate(BaseModel): 
    api_key: Optional[str] = None
    name: str
    description: str
    icon: str
    rule_type: str = "manual"
    rule_value: int = 0
    rule_target: Optional[str] = None
    rule_meta: Optional[str] = None
    target_image: Optional[str] = None
    reward_xp: int = 0

class AchUpdate(BaseModel): 
    api_key: Optional[str] = None
    name: str
    description: str
    icon: str
    rule_type: str = "manual"
    rule_value: int = 0
    rule_target: Optional[str] = None
    rule_meta: Optional[str] = None
    target_image: Optional[str] = None
    reward_xp: int = 0

class AchAssign(BaseModel): 
    api_key: Optional[str] = None
    achievement_id: int

class ToggleAch(BaseModel): 
    api_key: Optional[str] = None
    achievement_id: int

class FollowAction(BaseModel): 
    api_key: Optional[str] = None

class VerifyUserRequest(BaseModel): 
    api_key: Optional[str] = None
    is_verified: bool

class MarkRead(BaseModel): 
    ua_ids: List[int]

class LikeRequest(BaseModel): 
    api_key: Optional[str] = None

class CommentRequest(BaseModel): 
    api_key: Optional[str] = None
    content: str = Field(..., max_length=1000)

class AdminUserUpdate(BaseModel): 
    api_key: Optional[str] = None
    display_name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None

class ApiKeyRequest(BaseModel): 
    api_key: Optional[str] = None
