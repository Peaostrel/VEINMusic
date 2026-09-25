from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
    text,
)
from sqlalchemy.orm import relationship

from app.core.crypto import EncryptedString
from app.database import Base

CASCADE_ALL_DELETE = "all, delete"
FK_USERS_ID = "users.id"


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    api_key = Column(String, unique=True, index=True)
    role = Column(String, default="user")
    is_banned = Column(Boolean, default=False, server_default=text("false"), nullable=False)
    is_flagged_antifraud = Column(Boolean, default=False, server_default=text("false"), nullable=False)
    # Bumped to revoke all session tokens ("log out everywhere", bans)
    session_version = Column(Integer, default=0, server_default=text("0"), nullable=False)
    antifraud_reason = Column(String, nullable=True)

    profile = relationship(
        "UserProfile",
        back_populates="user",
        uselist=False,
        cascade=CASCADE_ALL_DELETE,
        lazy="joined")
    integration = relationship(
        "UserIntegration",
        back_populates="user",
        uselist=False,
        cascade=CASCADE_ALL_DELETE,
        lazy="joined")
    scrobbles = relationship(
        "Scrobble",
        back_populates="user",
        cascade=CASCADE_ALL_DELETE)
    achievements = relationship(
        "UserAchievement",
        back_populates="user",
        cascade=CASCADE_ALL_DELETE)
    following = relationship(
        "Follow",
        foreign_keys="[Follow.follower_id]",
        backref="follower_user",
        cascade=CASCADE_ALL_DELETE)
    followers = relationship(
        "Follow",
        foreign_keys="[Follow.following_id]",
        backref="following_user",
        cascade=CASCADE_ALL_DELETE)
    likes = relationship(
        "ScrobbleLike",
        backref="user_ref",
        cascade=CASCADE_ALL_DELETE)
    comments = relationship(
        "ScrobbleComment",
        backref="user_ref",
        cascade=CASCADE_ALL_DELETE)


class UserProfile(Base):
    __tablename__ = "user_profiles"
    user_id = Column(
        Integer,
        ForeignKey(
            FK_USERS_ID,
            ondelete="CASCADE"),
        primary_key=True)
    display_name = Column(String, nullable=True)
    bio = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    cover_url = Column(String, nullable=True)
    location = Column(String, nullable=True)
    favorite_genre = Column(String, nullable=True)
    equipment = Column(String, nullable=True)
    social_links = Column(String, nullable=True)
    theme = Column(String, default="classic")
    is_private = Column(Boolean, default=False)
    hidden_artists = Column(String, default="")
    sync_privacy = Column(String, default="all")

    favorite_artist = Column(String, nullable=True)
    favorite_artist_url = Column(String, nullable=True)
    favorite_artist_cover = Column(String, nullable=True)
    favorite_artist_updated_at = Column(DateTime(timezone=True), nullable=True)

    favorite_track = Column(String, nullable=True)
    favorite_track_url = Column(String, nullable=True)
    favorite_track_cover = Column(String, nullable=True)
    favorite_track_updated_at = Column(DateTime(timezone=True), nullable=True)

    favorite_album = Column(String, nullable=True)
    favorite_album_url = Column(String, nullable=True)
    favorite_album_cover = Column(String, nullable=True)
    favorite_album_updated_at = Column(DateTime(timezone=True), nullable=True)

    avatar_frame = Column(String, default="")

    user = relationship("User", back_populates="profile")


class UserIntegration(Base):
    __tablename__ = "user_integrations"
    user_id = Column(
        Integer,
        ForeignKey(
            FK_USERS_ID,
            ondelete="CASCADE"),
        primary_key=True)
    bonus_xp = Column(Integer, default=0)
    current_streak = Column(Integer, default=0)
    last_streak_date = Column(String, nullable=True)
    is_verified = Column(Boolean, default=False)
    yandex_token = Column(EncryptedString, nullable=True)
    lastfm_username = Column(String, nullable=True)
    spotify_access_token = Column(EncryptedString, nullable=True)
    spotify_refresh_token = Column(EncryptedString, nullable=True)
    has_imported_lastfm = Column(Boolean, default=False)
    last_sync = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="integration")


class Track(Base):
    __tablename__ = "tracks"
    __table_args__ = (
        # Case-insensitive catalog lookup when processing scrobbles
        Index("ix_tracks_lower_title_artist", func.lower(text("title")), func.lower(text("artist"))),
    )
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    artist = Column(String, index=True)
    cover_url = Column(String, nullable=True)
    track_url = Column(String, nullable=True)
    album = Column(String, nullable=True, index=True)
    genre = Column(String, nullable=True, index=True)
    duration = Column(Integer, default=0)


class Scrobble(Base):
    __tablename__ = "scrobbles"
    __table_args__ = (
        # "latest scrobble of a user", per-user history and period stats
        Index("ix_scrobbles_user_id_id", "user_id", "id"),
        Index("ix_scrobbles_user_played_at", "user_id", "played_at"),
        # "online now" and activity queries
        Index("ix_scrobbles_updated_at", "updated_at"),
    )
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey(
            FK_USERS_ID,
            ondelete="CASCADE"),
        index=True)
    track_id = Column(
        Integer,
        ForeignKey(
            "tracks.id",
            ondelete="CASCADE"),
        index=True)
    played_at = Column(
        DateTime(
            timezone=True), default=lambda: datetime.now(
            UTC))
    source = Column(String)
    listened_sec = Column(Integer, default=0)
    is_playing = Column(Boolean, default=True)
    updated_at = Column(
        DateTime(
            timezone=True), default=lambda: datetime.now(
            UTC))
    xp_earned = Column(Integer, default=1)
    is_imported = Column(Boolean, default=False)

    user = relationship("User", back_populates="scrobbles", lazy="joined")
    track = relationship("Track")


class Achievement(Base):
    __tablename__ = "achievements"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    description = Column(String)
    icon = Column(String)
    rule_type = Column(String, default="manual")
    rule_value = Column(Integer, default=0)
    rule_target = Column(String, nullable=True)
    rule_meta = Column(String, nullable=True)
    target_image = Column(String, nullable=True)
    reward_xp = Column(Integer, default=0)


class UserAchievement(Base):
    __tablename__ = "user_achievements"
    __table_args__ = (
        Index("uq_user_achievements_user_achievement", "user_id", "achievement_id", unique=True),
    )
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey(
            FK_USERS_ID,
            ondelete="CASCADE"),
        index=True)
    achievement_id = Column(
        Integer,
        ForeignKey(
            "achievements.id",
            ondelete="CASCADE"),
        index=True)
    earned_at = Column(
        DateTime(
            timezone=True), default=lambda: datetime.now(
            UTC))
    is_displayed = Column(Boolean, default=True)
    notified = Column(Boolean, default=False)

    user = relationship("User", back_populates="achievements")
    achievement = relationship("Achievement")


class Follow(Base):
    __tablename__ = "follows"
    __table_args__ = (
        Index("uq_follows_follower_following", "follower_id", "following_id", unique=True),
    )
    id = Column(Integer, primary_key=True, index=True)
    follower_id = Column(
        Integer,
        ForeignKey(
            FK_USERS_ID,
            ondelete="CASCADE"),
        index=True)
    following_id = Column(
        Integer,
        ForeignKey(
            FK_USERS_ID,
            ondelete="CASCADE"),
        index=True)
    created_at = Column(
        DateTime(
            timezone=True), default=lambda: datetime.now(
            UTC))


class ScrobbleLike(Base):
    __tablename__ = "scrobble_likes"
    __table_args__ = (
        Index("uq_scrobble_likes_user_scrobble", "user_id", "scrobble_id", unique=True),
    )
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey(
            FK_USERS_ID,
            ondelete="CASCADE"),
        index=True)
    scrobble_id = Column(
        Integer,
        ForeignKey(
            "scrobbles.id",
            ondelete="CASCADE"),
        index=True)
    created_at = Column(
        DateTime(
            timezone=True), default=lambda: datetime.now(
            UTC))


class ScrobbleComment(Base):
    __tablename__ = "scrobble_comments"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey(
            FK_USERS_ID,
            ondelete="CASCADE"),
        index=True)
    scrobble_id = Column(
        Integer,
        ForeignKey(
            "scrobbles.id",
            ondelete="CASCADE"),
        index=True)
    content = Column(String)
    created_at = Column(
        DateTime(
            timezone=True), default=lambda: datetime.now(
            UTC))


class AvatarFrame(Base):
    __tablename__ = "avatar_frames"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    code = Column(String, unique=True, index=True, nullable=False)
    css_style = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    rarity = Column(String, default="common")
    required_level = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)
    created_at = Column(
        DateTime(
            timezone=True), default=lambda: datetime.now(
            UTC))


class SystemAnnouncement(Base):
    __tablename__ = "system_announcements"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    type = Column(String, default="info")
    is_active = Column(Boolean, default=True)
    created_at = Column(
        DateTime(
            timezone=True), default=lambda: datetime.now(
            UTC))
    expires_at = Column(DateTime(timezone=True), nullable=True)


class FeatureFlag(Base):
    __tablename__ = "feature_flags"
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=True)
    is_enabled = Column(Boolean, default=True)
    updated_at = Column(
        DateTime(
            timezone=True), default=lambda: datetime.now(
            UTC))


class TrackAlias(Base):
    __tablename__ = "track_aliases"
    id = Column(Integer, primary_key=True, index=True)
    original_title = Column(String, index=True)
    original_artist = Column(String, index=True)
    canonical_track_id = Column(
        Integer,
        ForeignKey(
            "tracks.id",
            ondelete="CASCADE"),
        index=True)
    created_at = Column(
        DateTime(
            timezone=True), default=lambda: datetime.now(
            UTC))

    canonical_track = relationship("Track")


class ApiKey(Base):
    __tablename__ = "api_keys"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey(
            FK_USERS_ID,
            ondelete="CASCADE"),
        index=True)
    key_hash = Column(String, unique=True, index=True)
    prefix = Column(String, index=True)
    name = Column(String, default="Default API Key")
    scopes = Column(String, default="scrobble:write,profile:read")
    is_active = Column(Boolean, default=True)
    created_at = Column(
        DateTime(
            timezone=True), default=lambda: datetime.now(
            UTC))
    expires_at = Column(DateTime(timezone=True), nullable=True)
    last_used_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User")


class Webhook(Base):
    __tablename__ = "webhooks"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey(
            FK_USERS_ID,
            ondelete="CASCADE"),
        index=True)
    url = Column(String, nullable=False)
    secret = Column(EncryptedString, nullable=False)
    events = Column(String, default="scrobble.created,achievement.unlocked")
    is_active = Column(Boolean, default=True)
    created_at = Column(
        DateTime(
            timezone=True), default=lambda: datetime.now(
            UTC))

    user = relationship("User")


class ExternalSyncConfig(Base):
    __tablename__ = "external_sync_configs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey(
            FK_USERS_ID,
            ondelete="CASCADE"),
        unique=True,
        index=True)
    lastfm_session_key = Column(EncryptedString, nullable=True)
    listenbrainz_token = Column(EncryptedString, nullable=True)
    librefm_session_key = Column(EncryptedString, nullable=True)
    is_lastfm_enabled = Column(Boolean, default=False)
    is_listenbrainz_enabled = Column(Boolean, default=False)
    is_librefm_enabled = Column(Boolean, default=False)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User")


class BlacklistFilter(Base):
    __tablename__ = "blacklist_filters"
    id = Column(Integer, primary_key=True, index=True)
    pattern = Column(String, nullable=False, index=True)
    filter_type = Column(String, default="keyword")  # keyword, regex, artist, album
    reason = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(
        DateTime(
            timezone=True), default=lambda: datetime.now(
            UTC))


class LastfmImportJob(Base):
    __tablename__ = "lastfm_import_jobs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey(
            FK_USERS_ID,
            ondelete="CASCADE"),
        index=True)
    lastfm_username = Column(String, nullable=False)
    status = Column(String, default="pending")  # pending, in_progress, completed, failed
    progress = Column(Integer, default=0)
    total_tracks = Column(Integer, default=0)
    imported_tracks = Column(Integer, default=0)
    error_log = Column(String, nullable=True)
    started_at = Column(
        DateTime(
            timezone=True), default=lambda: datetime.now(
            UTC))
    finished_at = Column(DateTime(timezone=True), nullable=True)
    # Incremental, resumable import: the job imports scrobbles played in
    # (window_from, window_to] page by page and records where it stopped.
    window_from = Column(Integer, nullable=True)
    window_to = Column(Integer, nullable=True)
    current_page = Column(Integer, default=0, server_default=text("0"), nullable=False)
    total_pages = Column(Integer, default=0, server_default=text("0"), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User")


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey(
            FK_USERS_ID,
            ondelete="CASCADE"),
        index=True)
    endpoint = Column(String, nullable=False, unique=True)
    p256dh = Column(String, nullable=False)
    auth = Column(String, nullable=False)
    created_at = Column(
        DateTime(
            timezone=True), default=lambda: datetime.now(
            UTC))

    user = relationship("User")


class DeviceAuthorization(Base):
    """Device-code pairing (e.g. the browser extension): the device shows a
    short user code, the signed-in user approves it on the website and the
    device receives its own revocable API key."""
    __tablename__ = "device_authorizations"
    id = Column(Integer, primary_key=True, index=True)
    device_code_hash = Column(String, nullable=False, unique=True, index=True)
    user_code = Column(String, nullable=False, unique=True, index=True)
    client_name = Column(String, nullable=False, default="VEIN Music Extension")
    status = Column(String, nullable=False, default="pending")  # pending, approved, denied, consumed
    user_id = Column(Integer, ForeignKey(FK_USERS_ID, ondelete="CASCADE"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    expires_at = Column(DateTime(timezone=True), nullable=False)
