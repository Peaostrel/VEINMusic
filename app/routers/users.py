"""User profiles, follows, notifications and comments."""

from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.constants import USER_NOT_FOUND
from app.core.rate_limit import limiter
from app.core.security import get_current_user
from app.database import get_db
from app.models import (
    Achievement,
    Follow,
    Scrobble,
    ScrobbleComment,
    Track,
    User,
    UserAchievement,
    UserProfile,
)
from app.routers.common import _check_privacy_and_owner, _get_visible_user
from app.schemas import (
    FollowAction,
    MarkRead,
    ToggleAch,
)
from app.services.user_stats import get_active_streak, get_user_level_info

router = APIRouter(tags=["users"])

# --- /api/user/mood ---


@router.get("/api/user/mood",
            responses={403: {"description": "Private profile"},
                       404: {"description": "User not found"}})
def get_user_mood(username: str, request: Request, db: Annotated[Session, Depends(get_db)]):
    user = _get_visible_user(username, request, db)

    # Analyze last 10 tracks
    recent = db.query(
        Track.genre,
        Track.title).join(Scrobble).filter(
        Scrobble.user_id == user.id).order_by(
            Scrobble.id.desc()).limit(10).all()
    if not recent:
        return {"mood": "Тишина", "emoji": "😶"}

    genres = [r[0].lower() if r[0] else "" for r in recent]
    titles = [r[1].lower() if r[1] else "" for r in recent]

    if any(g in ['rock', 'metal', 'phonk'] for g in genres):
        return {"mood": "Энергичный хайп", "emoji": "🔥"}
    if any(g in ['lofi', 'jazz', 'ambient', 'classical'] for g in genres):
        return {"mood": "Фокус и чилл", "emoji": "📚"}
    if any(g in ['pop', 'dance', 'electronic'] for g in genres):
        return {"mood": "Танцевальный вайб", "emoji": "💃"}
    if any(w in titles for w in ['sad', 'lonely', 'rain', 'cry']):
        return {"mood": "Меланхолия", "emoji": "🌧️"}

    return {"mood": "Меломан", "emoji": "🎧"}


# --- /api/user/{username} ---


@router.get("/api/user/{username}",
            responses={404: {"description": "User not found"}})
def get_user_info(username: str, request: Request,
                  db: Annotated[Session, Depends(get_db)]):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(404, USER_NOT_FOUND)
    role = user.role or "user"

    is_hidden, is_owner = _check_privacy_and_owner(user, request, db)

    if is_hidden:
        return {
            "username": user.username,
            "display_name": user.profile.display_name or user.username,
            "avatar_url": user.profile.avatar_url,
            "is_private": True,
            "role": role}

    ach_data = db.query(
        Achievement,
        UserAchievement).join(
        UserAchievement,
        Achievement.id == UserAchievement.achievement_id).filter(
            UserAchievement.user_id == user.id).all()
    lvl, rnk, _, _ = get_user_level_info(user, db)
    return {
        "username": user.username,
        "display_name": user.profile.display_name or user.username,
        "bio": user.profile.bio or "Этот пользователь пока ничего о себе не рассказал.",
        "avatar_url": user.profile.avatar_url,
        "cover_url": user.profile.cover_url,
        "location": user.profile.location,
        "favorite_genre": user.profile.favorite_genre,
        "equipment": user.profile.equipment,
        "social_links": user.profile.social_links or "[]",
        "theme": user.profile.theme or "classic",
        "is_private": user.profile.is_private,
        "hidden_artists": user.profile.hidden_artists,
        "sync_privacy": user.profile.sync_privacy or "all",
        "is_verified": user.integration.is_verified,
        "favorite_artist": user.profile.favorite_artist,
        "favorite_artist_url": user.profile.favorite_artist_url,
        "favorite_artist_cover": user.profile.favorite_artist_cover,
        "favorite_artist_updated_at": user.profile.favorite_artist_updated_at.isoformat() if user.profile.favorite_artist_updated_at else None,
        "favorite_track": user.profile.favorite_track,
        "favorite_track_url": user.profile.favorite_track_url,
        "favorite_track_cover": user.profile.favorite_track_cover,
        "favorite_track_updated_at": user.profile.favorite_track_updated_at.isoformat() if user.profile.favorite_track_updated_at else None,
        "favorite_album": user.profile.favorite_album,
        "favorite_album_url": user.profile.favorite_album_url,
        "favorite_album_cover": user.profile.favorite_album_cover,
        "favorite_album_updated_at": user.profile.favorite_album_updated_at.isoformat() if user.profile.favorite_album_updated_at else None,
        "avatar_frame": user.profile.avatar_frame,
        "level": lvl,
        "rank": rnk,
        "spotify_linked": bool(
            user.integration.spotify_refresh_token),
        "yandex_linked": bool(
            user.integration.yandex_token),
        "lastfm_username": user.integration.lastfm_username,
        "has_imported_lastfm": user.integration.has_imported_lastfm,
        "last_sync": user.integration.last_sync,
        "role": role,
        "achievements": [
            {
                "id": a.id,
                "name": a.name,
                "description": a.description,
                "icon": a.icon,
                "target_image": a.target_image,
                "reward_xp": a.reward_xp,
                "is_displayed": ua.is_displayed,
                "earned_at": ua.earned_at} for a,
            ua in ach_data],
        "streak": get_active_streak(user),
        "has_api_key": bool(user.api_key) if is_owner else False}


# --- /api/notifications/{username} ---
@router.get("/api/notifications/{username}",
            responses={403: {"description": "Forbidden"}})
def get_notifications(username: str,
                      db: Annotated[Session, Depends(get_db)],
                      current_user: Annotated[User, Depends(get_current_user)]):
    if current_user.username != username:
        raise HTTPException(403)
    user = current_user
    new_achs = db.query(Achievement, UserAchievement).join(UserAchievement).filter(
        UserAchievement.user_id == user.id, UserAchievement.notified.is_(False)).all()
    return [{"ua_id": ua.id,
             "name": a.name,
             "icon": a.icon,
             "reward_xp": a.reward_xp,
             "target_image": a.target_image} for a,
            ua in new_achs]


# --- /api/scrobble/{scrobble_id}/comments ---
@router.get("/api/scrobble/{scrobble_id}/comments",
            responses={404: {"description": "Скроббл не найден"},
                       403: {"description": "Доступ запрещен (приватный профиль)"}})
def get_comments(scrobble_id: int, request: Request, db: Annotated[Session, Depends(get_db)]):
    scrobble = db.query(Scrobble).filter(Scrobble.id == scrobble_id).first()
    if not scrobble:
        raise HTTPException(404, "Скроббл не найден")

    is_hidden, _ = _check_privacy_and_owner(scrobble.user, request, db)
    if is_hidden:
        raise HTTPException(403, "Доступ запрещен (приватный профиль)")

    comments = db.query(
        ScrobbleComment,
        User.username,
        UserProfile.avatar_url).join(
        User,
        ScrobbleComment.user_id == User.id).join(
            UserProfile,
            User.id == UserProfile.user_id).filter(
                ScrobbleComment.scrobble_id == scrobble_id).all()
    return [{"id": c.ScrobbleComment.id,
             "content": c.ScrobbleComment.content,
             "username": c.username,
             "avatar_url": c.avatar_url,
             "created_at": c.ScrobbleComment.created_at} for c in comments]


# --- /api/follow-stats/{viewer}/{profile} ---
@router.get("/api/follow-stats/{viewer}/{profile}",
            responses={404: {"description": "User not found"}})
def get_follow_stats(viewer: str, profile: str,
                     db: Annotated[Session, Depends(get_db)]):
    target = db.query(User).filter(User.username == profile).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    followers_count = db.query(Follow).filter(
        Follow.following_id == target.id).count()
    following_count = db.query(Follow).filter(
        Follow.follower_id == target.id).count()
    is_following = False
    if viewer != 'null':
        viewer_user = db.query(User).filter(User.username == viewer).first()
        if viewer_user:
            is_following = db.query(Follow).filter(
                Follow.follower_id == viewer_user.id,
                Follow.following_id == target.id).first() is not None
    return {
        "followers": followers_count,
        "following": following_count,
        "is_following": is_following}


@router.get("/api/follow-stats/{profile}",
            responses={404: {"description": "User not found"}})
def get_follow_stats_fallback(
        profile: str, db: Annotated[Session, Depends(get_db)]):
    return get_follow_stats("null", profile, db)


# --- /api/followers/{username} ---
@router.get("/api/followers/{username}",
            responses={404: {"description": "User not found"}})
def get_followers(username: str, request: Request,
                  db: Annotated[Session, Depends(get_db)]):
    target = db.query(User).filter(User.username == username).first()
    if not target:
        raise HTTPException(404)

    # Privacy check: the owner (authenticated via session/API key) can
    # always see their own list
    is_hidden, _ = _check_privacy_and_owner(target, request, db)
    if is_hidden:
        return []

    followers = db.query(User).join(
        Follow, Follow.follower_id == User.id).filter(
        Follow.following_id == target.id).all()
    res = []
    for u in followers:
        lvl, _rank, _, _theme = get_user_level_info(u, db)
        res.append({"username": u.username,
                    "display_name": u.profile.display_name or u.username,
                    "avatar_url": u.profile.avatar_url,
                    "is_verified": u.integration.is_verified,
                    "role": u.role or "user",
                    "level": lvl})
    return res


# --- /api/following/{username} ---
@router.get("/api/following/{username}",
            responses={404: {"description": "User not found"}})
def get_following(username: str, request: Request,
                  db: Annotated[Session, Depends(get_db)]):
    target = db.query(User).filter(User.username == username).first()
    if not target:
        raise HTTPException(404)

    # Privacy check: the owner (authenticated via session/API key) can
    # always see their own list
    is_hidden, _ = _check_privacy_and_owner(target, request, db)
    if is_hidden:
        return []

    following = db.query(User).join(
        Follow, Follow.following_id == User.id).filter(
        Follow.follower_id == target.id).all()
    res = []
    for u in following:
        lvl, _rank, _, _theme = get_user_level_info(u, db)
        res.append({"username": u.username,
                    "display_name": u.profile.display_name or u.username,
                    "avatar_url": u.profile.avatar_url,
                    "is_verified": u.integration.is_verified,
                    "role": u.role or "user",
                    "level": lvl})
    return res


# --- /api/search/users ---
@router.get("/api/search/users")
def search_users(q: str, db: Annotated[Session, Depends(get_db)]):
    if not q or len(q) < 2:
        return []
    users = db.query(User).join(UserProfile).filter(
        (User.username.ilike(f"%{q}%")) | (
            UserProfile.display_name.ilike(f"%{q}%"))).limit(10).all()
    res = []
    for u in users:
        lvl, _rank, _, _theme = get_user_level_info(u, db)
        res.append({"username": u.username,
                    "display_name": u.profile.display_name or u.username,
                    "avatar_url": u.profile.avatar_url,
                    "is_verified": u.integration.is_verified,
                    "role": u.role or "user",
                    "level": lvl})
    return res

# Removed duplicate get_admin_stats endpoint


# --- /api/follow/{target_username} ---
@router.post("/api/follow/{target_username}",
             responses={400: {"description": "Bad request"}})
@limiter.limit("30/minute")
def toggle_follow(target_username: str,
                  request: Request,
                  data: FollowAction,
                  db: Annotated[Session,
                                Depends(get_db)],
                  current_user: Annotated[User,
                                          Depends(get_current_user)]):
    follower = current_user
    target = db.query(User).filter(User.username == target_username).first()
    if not follower or not target or follower.id == target.id:
        raise HTTPException(400)
    existing = db.query(Follow).filter(
        Follow.follower_id == follower.id,
        Follow.following_id == target.id).first()
    if existing:
        db.delete(existing)
        db.commit()
        return {"status": "unfollowed"}
    else:
        db.add(Follow(follower_id=follower.id, following_id=target.id))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()  # concurrent duplicate request
        return {"status": "followed"}


# --- POST /api/notifications/{username}/read ---
@router.post("/api/notifications/{username}/read",
             responses={403: {"description": "Forbidden"}})
def mark_notifications_read(username: str,
                            data: MarkRead,
                            db: Annotated[Session,
                                          Depends(get_db)],
                            current_user: Annotated[User,
                                                    Depends(get_current_user)]):
    if current_user.username != username:
        raise HTTPException(403)
    user = db.query(User).filter(User.username == username).first()
    if not user:
        return {"status": "error"}
    db.query(UserAchievement).filter(UserAchievement.id.in_(data.ua_ids),
                                     UserAchievement.user_id == user.id).update({"notified": True},
                                                                                synchronize_session=False)
    db.commit()
    return {"status": "ok"}


# --- POST /api/profile/achievements/toggle ---
@router.post("/api/profile/achievements/toggle",
             responses={404: {"description": "Achievement not found"}})
def toggle_achievement(data: ToggleAch, db: Annotated[Session, Depends(
        get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    user = current_user

    ua = db.query(UserAchievement).filter_by(
        user_id=user.id, achievement_id=data.achievement_id).first()
    if not ua:
        raise HTTPException(404)
    ua.is_displayed = not ua.is_displayed  # type: ignore[assignment]
    db.commit()
    return {"status": "ok", "is_displayed": ua.is_displayed}
