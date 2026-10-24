"""User profiles, follows, notifications and comments."""

from typing import Annotated

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    Response,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.constants import USER_NOT_FOUND
from app.core.cover_urls import public_cover_url
from app.core.i18n import request_lang, tr
from app.core.rate_limit import HEAVY_READ_LIMIT, limiter
from app.core.security import get_current_user, get_current_user_optional
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
from app.routers.common import (
    _can_view_section,
    _check_privacy_and_owner,
    _get_visible_user,
)
from app.schemas import (
    FollowAction,
    MarkRead,
    ReorderAchievements,
    ToggleAch,
)
from app.services import notifications
from app.services.achievements import (
    achievement_name,
    achievement_texts,
    normalize_showcase_order,
)
from app.services.user_preferences import preferences_dict, public_preferences
from app.services.user_stats import (
    get_active_streak,
    get_levels_for_users,
    get_user_level_info,
)

router = APIRouter(tags=["users"])

# --- /api/user/mood ---


@router.get("/api/user/mood",
            responses={403: {"description": "Private profile"},
                       404: {"description": "User not found"}})
@limiter.limit(HEAVY_READ_LIMIT)
def get_user_mood(username: str, request: Request, db: Annotated[Session, Depends(get_db)]):
    user = _get_visible_user(username, request, db, "statistics")
    lang = request_lang(request)

    # Analyze last 10 tracks
    recent = db.query(
        Track.genre,
        Track.title).join(Scrobble).filter(
        Scrobble.user_id == user.id).order_by(
            Scrobble.played_at.desc(), Scrobble.id.desc()).limit(10).all()
    if not recent:
        return {"mood": tr(lang, "Тишина"), "emoji": "😶"}

    genres = [r[0].lower() if r[0] else "" for r in recent]
    titles = [r[1].lower() if r[1] else "" for r in recent]

    if any(g in ['rock', 'metal', 'phonk'] for g in genres):
        return {"mood": tr(lang, "Энергичный хайп"), "emoji": "🔥"}
    if any(g in ['lofi', 'jazz', 'ambient', 'classical'] for g in genres):
        return {"mood": tr(lang, "Фокус и чилл"), "emoji": "📚"}
    if any(g in ['pop', 'dance', 'electronic'] for g in genres):
        return {"mood": tr(lang, "Танцевальный вайб"), "emoji": "💃"}
    if any(w in titles for w in ['sad', 'lonely', 'rain', 'cry']):
        return {"mood": tr(lang, "Меланхолия"), "emoji": "🌧️"}

    return {"mood": tr(lang, "Меломан"), "emoji": "🎧"}


# --- /api/user/{username} ---


def _showcase_fields(profile, visible):
    fields = {}
    for kind in ("artist", "track", "album"):
        prefix = f"favorite_{kind}"
        for suffix in ("", "_url", "_cover"):
            fields[prefix + suffix] = getattr(profile, prefix + suffix) if visible else None
        updated = getattr(profile, prefix + "_updated_at")
        fields[prefix + "_updated_at"] = updated.isoformat() if updated else None
    return fields


def _visible_location(user: User, request: Request, db: Session, is_owner: bool) -> str | None:
    if not _can_view_section(user, request, db, "location"):
        return None
    location = user.profile.location
    privacy = preferences_dict(user.profile).get("privacy", {})
    if location and not is_owner and privacy.get("location_precision") == "country":
        return location.rsplit(",", 1)[-1].strip()
    return location


def _owner_fields(user: User, is_owner: bool) -> dict:
    """Account settings and connected services are the owner's business."""
    if not is_owner:
        return {"hidden_artists": "", "spotify_linked": False,
                "yandex_linked": False, "soundcloud_linked": False, "lastfm_username": None,
                "lastfm_verified": False, "last_sync": None, "has_api_key": False}
    integration = user.integration
    return {
        "hidden_artists": user.profile.hidden_artists,
        "spotify_linked": bool(integration.spotify_refresh_token),
        "yandex_linked": bool(integration.yandex_token),
        "soundcloud_linked": bool(integration.soundcloud_refresh_token),
        "lastfm_username": integration.lastfm_username,
        "lastfm_verified": bool(integration.lastfm_verified),
        "last_sync": integration.last_sync,
        "has_api_key": bool(user.api_key)}


def _earned_achievements(user: User, db: Session, lang: str = "ru") -> list[dict]:
    rows = db.query(Achievement, UserAchievement).join(
        UserAchievement, Achievement.id == UserAchievement.achievement_id).filter(
        UserAchievement.user_id == user.id).all()
    rows.sort(key=lambda row: (
        not bool(row[1].is_displayed),
        row[1].display_order is None,
        row[1].display_order if row[1].display_order is not None else 10**9,
        -int(row[1].id),
    ))
    return [{
        "id": a.id,
        **achievement_texts(a, lang),
        "icon": a.icon,
        "target_image": public_cover_url(a.target_image),
        "reward_xp": a.reward_xp,
        "rule_type": a.rule_type,
        "rule_target": a.rule_target,
        "rule_meta": a.rule_meta,
        "is_displayed": ua.is_displayed,
        "display_order": ua.display_order,
        "earned_at": ua.earned_at} for a, ua in rows]


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
            "can_view_private": False,
            "role": role}

    lvl, rnk, _, _ = get_user_level_info(user, db)
    rnk = tr(request_lang(request), rnk)
    can_showcase = _can_view_section(user, request, db, "showcase")
    can_social = _can_view_section(user, request, db, "social_links")
    return {
        "username": user.username,
        "display_name": user.profile.display_name or user.username,
        # Kept in Russian: the site compares it to spot an empty bio
        "bio": user.profile.bio or "Этот пользователь пока ничего о себе не рассказал.",
        "avatar_url": user.profile.avatar_url,
        "cover_url": user.profile.cover_url,
        "location": _visible_location(user, request, db, is_owner),
        "favorite_genre": user.profile.favorite_genre,
        "equipment": user.profile.equipment,
        "social_links": (user.profile.social_links or "[]") if can_social else "[]",
        "theme": user.profile.theme or "classic",
        "is_private": user.profile.is_private,
        "can_view_private": is_owner,
        "is_verified": user.integration.is_verified,
        **_showcase_fields(user.profile, can_showcase),
        "avatar_frame": user.profile.avatar_frame,
        "level": lvl,
        "rank": rnk,
        "has_imported_lastfm": user.integration.has_imported_lastfm,
        "role": role,
        "achievements": _earned_achievements(user, db, request_lang(request)),
        "streak": get_active_streak(user),
        "preferences": public_preferences(user.profile),
        **_owner_fields(user, is_owner)}


# --- /api/notifications/{username} ---
@router.get("/api/notifications/{username}",
            responses={403: {"description": "Forbidden"}})
def get_notifications(username: str, request: Request,
                      db: Annotated[Session, Depends(get_db)],
                      current_user: Annotated[User, Depends(get_current_user)]):
    if current_user.username != username:
        raise HTTPException(403)
    user = current_user
    if not preferences_dict(user.profile)["notifications"]["in_app"].get(
            "achievements", True):
        return []
    new_achs = db.query(Achievement, UserAchievement).join(UserAchievement).filter(
        UserAchievement.user_id == user.id, UserAchievement.notified.is_(False)).all()
    lang = request_lang(request, current_user)
    return [{"ua_id": ua.id,
             "name": achievement_name(a, lang),
             "icon": a.icon,
             "reward_xp": a.reward_xp,
             "target_image": public_cover_url(a.target_image)} for a,
            ua in new_achs]


# --- /api/scrobble/{scrobble_id}/comments ---
@router.get("/api/scrobble/{scrobble_id}/comments",
            responses={404: {"description": "Скроббл не найден"},
                       403: {"description": "Доступ запрещен (приватный профиль)"}})
def get_comments(scrobble_id: int, request: Request, db: Annotated[Session, Depends(get_db)]):
    scrobble = db.query(Scrobble).filter(
        Scrobble.id == scrobble_id, Scrobble.deleted_at.is_(None)).first()
    if not scrobble:
        raise HTTPException(404, "Скроббл не найден")

    # Comments belong to a play in the history, so they follow its visibility
    if not _can_view_section(scrobble.user, request, db, "history"):
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
def get_follow_stats(viewer: str, profile: str, request: Request,
                     db: Annotated[Session, Depends(get_db)],
                     current_user: Annotated[User | None, Depends(get_current_user_optional)]):
    target = db.query(User).filter(User.username == profile).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if not _can_view_section(target, request, db, "followers"):
        return {"followers": 0, "following": 0, "is_following": False}
    followers_count = db.query(Follow).filter(
        Follow.following_id == target.id).count()
    following_count = db.query(Follow).filter(
        Follow.follower_id == target.id).count()
    # `is_following` is only answered for the signed-in user: taking the
    # viewer from the URL would reveal who follows whom for any two accounts.
    is_following = False
    if current_user is not None and current_user.username == viewer:
        is_following = db.query(Follow).filter(
            Follow.follower_id == current_user.id,
            Follow.following_id == target.id).first() is not None
    return {
        "followers": followers_count,
        "following": following_count,
        "is_following": is_following}


@router.get("/api/follow-stats/{profile}",
            responses={404: {"description": "User not found"}})
def get_follow_stats_fallback(
        profile: str,
        request: Request,
        db: Annotated[Session, Depends(get_db)],
        current_user: Annotated[User | None, Depends(get_current_user_optional)] = None):
    return get_follow_stats("null", profile, request, db, current_user)


@router.get("/api/profile/{username}/snapshot",
            responses={404: {"description": "User not found"}})
@limiter.limit(HEAVY_READ_LIMIT)
def get_profile_snapshot(
        username: str,
        request: Request,
        response: Response,
        db: Annotated[Session, Depends(get_db)],
        current_user: Annotated[User | None, Depends(get_current_user_optional)] = None):
    """Fresh data needed for the first profile paint in one round trip."""
    from app.routers.scrobbling import get_history
    from app.routers.stats import get_stats

    viewer = str(current_user.username) if current_user else "null"
    response.headers["Cache-Control"] = "private, no-store"
    user_info = get_user_info(username, request, db)
    try:
        history = get_history(username, request, db, current_user)
    except HTTPException as exc:
        if exc.status_code != 403:
            raise
        history = {"history": []}
    try:
        stats = get_stats.__wrapped__(username, request, db)
    except HTTPException as exc:
        if exc.status_code != 403:
            raise
        stats = {}
    return {
        "history": history.get("history", []),
        "stats": stats,
        "user": user_info,
        "followStats": get_follow_stats(viewer, username, request, db, current_user),
    }


def _user_cards(users: list[User], db: Session) -> list[dict]:
    levels = get_levels_for_users(users, db)
    return [{"username": u.username,
             "display_name": u.profile.display_name or u.username,
             "avatar_url": u.profile.avatar_url,
             "is_verified": u.integration.is_verified,
             "role": u.role or "user",
             "level": levels.get(int(u.id), 1)} for u in users]


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
    if not _can_view_section(target, request, db, "followers"):
        return []

    followers = db.query(User).join(
        Follow, Follow.follower_id == User.id).filter(
        Follow.following_id == target.id).all()
    return _user_cards(followers, db)


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
    if not _can_view_section(target, request, db, "followers"):
        return []

    following = db.query(User).join(
        Follow, Follow.following_id == User.id).filter(
        Follow.follower_id == target.id).all()
    return _user_cards(following, db)


# --- /api/search/users ---
@router.get("/api/search/users")
@limiter.limit(HEAVY_READ_LIMIT)
def search_users(request: Request, q: Annotated[str, Query(max_length=100)],
                 db: Annotated[Session, Depends(get_db)]):
    if not q or len(q) < 2:
        return []
    # Escape LIKE wildcards so "%"/"_" in the query match literally
    pattern = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    # Same audience as /api/search: private and banned profiles stay hidden
    users = db.query(User).join(UserProfile).filter(
        UserProfile.is_private.isnot(True), User.is_banned.isnot(True),
        (User.username.ilike(pattern, escape="\\")) | (
            UserProfile.display_name.ilike(pattern, escape="\\"))).limit(10).all()
    return _user_cards(users, db)

# Removed duplicate get_admin_stats endpoint


# --- /api/follow/{target_username} ---
@router.post("/api/follow/{target_username}",
             responses={400: {"description": "Bad request"}})
@limiter.limit("30/minute")
def toggle_follow(target_username: str,
                  request: Request,
                  data: FollowAction,
                  background_tasks: BackgroundTasks,
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
        notifications.remove_unread(db, recipient_id=int(target.id), actor_id=int(follower.id),
                                    kind=notifications.KIND_FOLLOW)
        db.commit()
        return {"status": "unfollowed"}
    db.add(Follow(follower_id=follower.id, following_id=target.id))
    try:
        db.flush()
    except IntegrityError:
        db.rollback()  # concurrent duplicate request
        return {"status": "followed"}
    notification = notifications.create(db, recipient_id=int(target.id), actor_id=int(follower.id),
                                        kind=notifications.KIND_FOLLOW)
    db.commit()
    notifications.schedule_push(background_tasks, notification)
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
             responses={
                 404: {"description": "Achievement not found"},
                 409: {"description": "Showcase limit reached"},
             })
def toggle_achievement(data: ToggleAch, db: Annotated[Session, Depends(
        get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    user = current_user

    ua = db.query(UserAchievement).filter_by(
        user_id=user.id, achievement_id=data.achievement_id).first()
    if not ua:
        raise HTTPException(404)
    if ua.is_displayed:
        ua.is_displayed = False  # type: ignore[assignment]
        ua.display_order = None  # type: ignore[assignment]
        db.flush()
        normalize_showcase_order(db, int(user.id))
    else:
        displayed = normalize_showcase_order(db, int(user.id))
        if len(displayed) >= 6:
            raise HTTPException(409, "В профиле можно показать не больше 6 достижений")
        ua.is_displayed = True  # type: ignore[assignment]
        ua.display_order = len(displayed)  # type: ignore[assignment]
    db.commit()
    return {"status": "ok", "is_displayed": ua.is_displayed,
            "display_order": ua.display_order}


@router.post("/api/profile/achievements/reorder",
             responses={400: {"description": "Invalid showcase order"}})
def reorder_achievements(
        data: ReorderAchievements,
        db: Annotated[Session, Depends(get_db)],
        current_user: Annotated[User, Depends(get_current_user)]):
    ids = data.achievement_ids
    if len(ids) != len(set(ids)):
        raise HTTPException(400, "Достижения не должны повторяться")
    rows = db.query(UserAchievement).filter_by(
        user_id=current_user.id, is_displayed=True).all()
    if set(ids) != {int(row.achievement_id) for row in rows}:
        raise HTTPException(400, "Передайте все показанные достижения")
    order = {achievement_id: index for index, achievement_id in enumerate(ids)}
    for row in rows:
        row.display_order = order[int(row.achievement_id)]  # type: ignore[assignment]
    db.commit()
    return {"status": "ok", "achievement_ids": ids}
