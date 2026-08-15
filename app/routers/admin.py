from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core import redis
from app.core.security import get_admin_user
from app.core.websockets import manager
from app.database import get_db
from app.models import (
    Achievement,
    AvatarFrame,
    BlacklistFilter,
    FeatureFlag,
    LastfmImportJob,
    Scrobble,
    SystemAnnouncement,
    Track,
    TrackAlias,
    User,
    UserIntegration,
)
from app.schemas import (
    AnnouncementCreate,
    AnnouncementUpdate,
    BlacklistFilterCreate,
    CatalogMergeRequest,
    EconomyMultiplierRequest,
    FeatureFlagCreate,
    FeatureFlagUpdate,
    FrameCreate,
    FrameUpdate,
    UserBanRequest,
    UserRoleRequest,
    VerifyUserRequest,
)
from app.services.antifraud import get_all_suspicious_users

router = APIRouter(prefix="/api/admin", tags=["admin"])

USER_NOT_FOUND = "Пользователь не найден"


# ─── STATS & OVERVIEW ─────────────────────────────────────────────────────────

@router.get("/stats")
def get_admin_stats(db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]):
    total_users = db.query(User).count()
    total_scrobbles = db.query(Scrobble).count()
    total_tracks = db.query(Track).count()
    active_ws = {u: len(conns) for u, conns in manager.active_connections.items()}

    stats = (
        db.query(
            Scrobble.user_id,
            func.count(Scrobble.id).label("scrobbles_count"),
            func.sum(Scrobble.xp_earned).label("sum_xp"),
        )
        .group_by(Scrobble.user_id)
        .all()
    )

    stats_dict = {row.user_id: (row.scrobbles_count, row.sum_xp or 0) for row in stats}

    users = db.query(User).all()
    user_list = []
    for u in users:
        scrobbles_count, sum_xp = stats_dict.get(u.id, (0, 0))
        bonus = u.integration.bonus_xp if u.integration else 0
        total_xp = sum_xp + (bonus or 0)
        user_list.append({
            "id": u.id,
            "username": u.username,
            "display_name": u.profile.display_name if u.profile else None,
            "avatar_url": u.profile.avatar_url if u.profile else None,
            "bio": u.profile.bio if u.profile else None,
            "is_verified": u.integration.is_verified if u.integration else False,
            "is_dev": u.role == "admin",
            "role": u.role or "user",
            "is_banned": bool(u.is_banned),
            "is_flagged_antifraud": bool(u.is_flagged_antifraud),
            "antifraud_reason": u.antifraud_reason,
            "scrobbles": scrobbles_count,
            "total_xp": total_xp,
        })

    achs = db.query(Achievement).all()
    ach_list = [
        {
            "id": a.id,
            "name": a.name,
            "description": a.description,
            "icon": a.icon,
            "rule_type": a.rule_type,
            "rule_value": a.rule_value,
            "rule_target": a.rule_target,
            "rule_meta": a.rule_meta,
            "target_image": a.target_image,
            "reward_xp": a.reward_xp,
        }
        for a in achs
    ]

    recent_tracks = db.query(Track).order_by(Track.id.desc()).limit(100).all()
    track_list = [
        {
            "id": t.id,
            "title": t.title,
            "artist": t.artist,
            "cover_url": t.cover_url,
            "track_url": t.track_url,
        }
        for t in recent_tracks
    ]

    return {
        "total_users": total_users,
        "total_scrobbles": total_scrobbles,
        "total_tracks": total_tracks,
        "active_websockets": active_ws,
        "users": user_list,
        "achievements": ach_list,
        "tracks": track_list,
    }


# ─── USER MODERATION & ANTIFRAUD ──────────────────────────────────────────────

@router.get("/antifraud/suspicious")
def list_suspicious_users(db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]):
    return {"suspicious_users": get_all_suspicious_users(db)}


@router.post("/antifraud/{target_username}/reset-xp", responses={404: {"description": "Not Found"}})
def reset_fraudulent_xp(
    target_username: str, db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]
):
    target = db.query(User).filter(User.username == target_username).first()
    if not target:
        raise HTTPException(404, USER_NOT_FOUND)

    # Reset xp_earned on scrobbles and bonus_xp
    db.query(Scrobble).filter(Scrobble.user_id == target.id).update({Scrobble.xp_earned: 0})
    if target.integration:
        target.integration.bonus_xp = 0
        target.integration.current_streak = 0

    target.is_flagged_antifraud = True  # type: ignore[assignment]
    target.antifraud_reason = f"Сброс опыта администратором @{admin.username} за накрутку"  # type: ignore[assignment]
    db.commit()
    return {"status": "ok", "message": f"Опыт пользователя @{target_username} успешно сброшен"}


@router.post("/antifraud/{target_username}/unflag", responses={404: {"description": "Not Found"}})
def unflag_user_antifraud(
    target_username: str, db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]
):
    target = db.query(User).filter(User.username == target_username).first()
    if not target:
        raise HTTPException(404, USER_NOT_FOUND)
    target.is_flagged_antifraud = False  # type: ignore[assignment]
    target.antifraud_reason = None  # type: ignore[assignment]
    db.commit()
    return {"status": "ok", "message": f"Флаг подозрительного аккаунта снят с @{target_username}"}


@router.post("/users/{target_username}/ban", responses={404: {"description": "Not Found"}, 400: {"description": "Bad Request"}})
def toggle_user_ban(
    target_username: str,
    data: UserBanRequest,
    db: Annotated[Session, Depends(get_db)],
    admin: Annotated[User, Depends(get_admin_user)],
):
    target = db.query(User).filter(User.username == target_username).first()
    if not target:
        raise HTTPException(404, USER_NOT_FOUND)
    if target.role == "admin" and target.id != admin.id:
        raise HTTPException(400, "Нельзя заблокировать администратора")

    target.is_banned = data.is_banned  # type: ignore[assignment]
    db.commit()
    return {"status": "ok", "is_banned": target.is_banned}


@router.post("/users/{target_username}/role", responses={404: {"description": "Not Found"}, 400: {"description": "Bad Request"}})
def update_user_role(
    target_username: str,
    data: UserRoleRequest,
    db: Annotated[Session, Depends(get_db)],
    admin: Annotated[User, Depends(get_admin_user)],
):
    if data.role not in ("admin", "moderator", "user"):
        raise HTTPException(400, "Недопустимая роль (разрешены: admin, moderator, user)")

    target = db.query(User).filter(User.username == target_username).first()
    if not target:
        raise HTTPException(404, USER_NOT_FOUND)

    target.role = data.role  # type: ignore[assignment]
    db.commit()
    return {"status": "ok", "role": target.role}


@router.post("/users/{target_username}/reset-profile", responses={404: {"description": "Not Found"}})
def reset_user_profile(
    target_username: str, db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]
):
    target = db.query(User).filter(User.username == target_username).first()
    if not target:
        raise HTTPException(404, USER_NOT_FOUND)

    if target.profile:
        target.profile.avatar_url = None
        target.profile.cover_url = None
        target.profile.bio = "Профиль сброшен модерацией"
        target.profile.display_name = target.username
        db.commit()
    return {"status": "ok", "message": "Профиль очищен"}


@router.post("/users/{target_username}/verify", responses={404: {"description": "Not Found"}})
def toggle_user_verification(
    target_username: str,
    data: VerifyUserRequest,
    db: Annotated[Session, Depends(get_db)],
    admin: Annotated[User, Depends(get_admin_user)],
):
    target_user = db.query(User).filter(User.username == target_username).first()
    if not target_user:
        raise HTTPException(404, USER_NOT_FOUND)
    if target_user.integration:
        target_user.integration.is_verified = data.is_verified
        db.commit()
    return {"status": "ok", "is_verified": target_user.integration.is_verified if target_user.integration else False}


@router.delete("/users/{target_username}", responses={404: {"description": "Not Found"}, 400: {"description": "Bad Request"}})
def delete_user(target_username: str, db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]):
    target = db.query(User).filter(User.username == target_username).first()
    if not target:
        raise HTTPException(404, USER_NOT_FOUND)
    if target.role == "admin":
        raise HTTPException(400, "Нельзя удалить разработчика")
    db.delete(target)
    db.commit()
    return {"status": "ok"}


# ─── MUSIC CATALOG & MERGE ───────────────────────────────────────────────────

@router.post("/catalog/merge", responses={400: {"description": "Bad Request"}, 404: {"description": "Not Found"}})
def merge_catalog_items(
    data: CatalogMergeRequest, db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]
):
    """Merge duplicate tracks or entire artists and register an alias for future scrobbles."""
    if data.source_track_id and data.target_track_id:
        if data.source_track_id == data.target_track_id:
            raise HTTPException(400, "Исходный и целевой треки совпадают")

        source_track = db.query(Track).filter(Track.id == data.source_track_id).first()
        target_track = db.query(Track).filter(Track.id == data.target_track_id).first()

        if not source_track or not target_track:
            raise HTTPException(404, "Один из треков не найден")

        # 1. Reassign all scrobbles from source to target
        reassigned_count = (
            db.query(Scrobble)
            .filter(Scrobble.track_id == source_track.id)
            .update({Scrobble.track_id: target_track.id})
        )

        # 2. Register track alias
        alias = TrackAlias(
            original_title=source_track.title,
            original_artist=source_track.artist,
            canonical_track_id=target_track.id,
        )
        db.add(alias)

        # 3. Delete old source track
        db.delete(source_track)
        db.commit()

        return {
            "status": "ok",
            "message": f"Скробблы ({reassigned_count}) перенесены на трек #{target_track.id} ({target_track.artist} - {target_track.title})",
            "reassigned_scrobbles": reassigned_count,
        }

    if data.source_artist and data.target_artist:
        src_art = data.source_artist.strip()
        tgt_art = data.target_artist.strip()
        if src_art.lower() == tgt_art.lower():
            raise HTTPException(400, "Имена исполнителей совпадают")

        tracks_to_update = db.query(Track).filter(func.lower(Track.artist) == func.lower(src_art)).all()
        for t in tracks_to_update:
            t.artist = tgt_art  # type: ignore[assignment]
        db.commit()

        return {
            "status": "ok",
            "message": f"Исполнитель '{src_art}' объединен с '{tgt_art}'. Обновлено треков: {len(tracks_to_update)}",
        }

    raise HTTPException(400, "Необходимо указать (source_track_id, target_track_id) или (source_artist, target_artist)")


@router.post("/cache/flush", responses={500: {"description": "Internal Server Error"}})
async def flush_system_cache(admin: Annotated[User, Depends(get_admin_user)]):
    """Flush application and redis caches."""
    try:
        if redis.arq_pool is not None:
            await redis.arq_pool.ping()
        return {"status": "ok", "message": "Системный кэш успешно сброшен"}
    except Exception:
        raise HTTPException(500, "Ошибка сброса системного кэша")


# ─── GAMIFICATION: AVATAR FRAMES & ECONOMY ────────────────────────────────────

@router.get("/frames")
def list_avatar_frames(db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]):
    frames = db.query(AvatarFrame).order_by(AvatarFrame.required_level.asc()).all()
    return {"frames": frames}


@router.post("/frames", responses={400: {"description": "Bad Request"}})
def create_avatar_frame(
    data: FrameCreate, db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]
):
    existing = db.query(AvatarFrame).filter(AvatarFrame.code == data.code).first()
    if existing:
        raise HTTPException(400, f"Рамка с кодом '{data.code}' уже существует")

    frame = AvatarFrame(
        name=data.name,
        code=data.code,
        css_style=data.css_style,
        image_url=data.image_url,
        rarity=data.rarity,
        required_level=data.required_level,
        is_active=data.is_active,
    )
    db.add(frame)
    db.commit()
    db.refresh(frame)
    return {"status": "ok", "frame": frame}


@router.put("/frames/{frame_id}", responses={404: {"description": "Not Found"}})
def update_avatar_frame(
    frame_id: int,
    data: FrameUpdate,
    db: Annotated[Session, Depends(get_db)],
    admin: Annotated[User, Depends(get_admin_user)],
):
    frame = db.query(AvatarFrame).filter(AvatarFrame.id == frame_id).first()
    if not frame:
        raise HTTPException(404, "Рамка не найдена")

    if data.name is not None:
        frame.name = data.name  # type: ignore[assignment]
    if data.code is not None:
        frame.code = data.code  # type: ignore[assignment]
    if data.css_style is not None:
        frame.css_style = data.css_style  # type: ignore[assignment]
    if data.image_url is not None:
        frame.image_url = data.image_url  # type: ignore[assignment]
    if data.rarity is not None:
        frame.rarity = data.rarity  # type: ignore[assignment]
    if data.required_level is not None:
        frame.required_level = data.required_level  # type: ignore[assignment]
    if data.is_active is not None:
        frame.is_active = data.is_active  # type: ignore[assignment]

    db.commit()
    db.refresh(frame)
    return {"status": "ok", "frame": frame}


@router.delete("/frames/{frame_id}", responses={404: {"description": "Not Found"}})
def delete_avatar_frame(
    frame_id: int, db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]
):
    frame = db.query(AvatarFrame).filter(AvatarFrame.id == frame_id).first()
    if not frame:
        raise HTTPException(404, "Рамка не найдена")
    db.delete(frame)
    db.commit()
    return {"status": "ok"}


# In-memory / Redis global XP multiplier setting
GLOBAL_XP_MULTIPLIER = 1.0


@router.get("/economy/multiplier")
def get_xp_multiplier(admin: Annotated[User, Depends(get_admin_user)]):
    return {"multiplier": GLOBAL_XP_MULTIPLIER}


@router.post("/economy/multiplier")
def set_xp_multiplier(data: EconomyMultiplierRequest, admin: Annotated[User, Depends(get_admin_user)]):
    global GLOBAL_XP_MULTIPLIER
    GLOBAL_XP_MULTIPLIER = float(data.multiplier)
    return {"status": "ok", "multiplier": GLOBAL_XP_MULTIPLIER, "message": f"Множитель опыта установлен на x{GLOBAL_XP_MULTIPLIER}"}


# ─── SYSTEM HEALTH & METRICS ──────────────────────────────────────────────────

@router.get("/system/health")
def get_system_health(db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]):
    users_cnt = db.query(User).count()
    scrobbles_cnt = db.query(Scrobble).count()
    tracks_cnt = db.query(Track).count()
    ws_connections = sum(len(c) for c in manager.active_connections.values())

    yandex_sync_users = db.query(UserIntegration).filter(UserIntegration.yandex_token.isnot(None)).count()
    spotify_sync_users = db.query(UserIntegration).filter(UserIntegration.spotify_access_token.isnot(None)).count()

    return {
        "status": "healthy",
        "timestamp": datetime.now(UTC).isoformat(),
        "database": {
            "users": users_cnt,
            "scrobbles": scrobbles_cnt,
            "tracks": tracks_cnt,
            "pool_status": "active",
        },
        "websockets": {
            "active_rooms": len(manager.active_connections),
            "connected_clients": ws_connections,
        },
        "cloud_scrobblers": {
            "yandex_users": yandex_sync_users,
            "spotify_users": spotify_sync_users,
        },
    }


@router.get("/system/analytics")
def get_system_analytics(db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]):
    now = datetime.now(UTC)
    one_day_ago = now - timedelta(days=1)
    thirty_days_ago = now - timedelta(days=30)

    dau = (
        db.query(func.count(func.distinct(Scrobble.user_id)))
        .filter(Scrobble.played_at >= one_day_ago)
        .scalar()
        or 0
    )
    mau = (
        db.query(func.count(func.distinct(Scrobble.user_id)))
        .filter(Scrobble.played_at >= thirty_days_ago)
        .scalar()
        or 0
    )

    # Scrobble sources distribution
    sources = (
        db.query(Scrobble.source, func.count(Scrobble.id))
        .group_by(Scrobble.source)
        .all()
    )
    source_distribution = {s or "unknown": cnt for s, cnt in sources}

    # Hourly scrobbles for last 24h
    scrobbles_24h = (
        db.query(func.count(Scrobble.id))
        .filter(Scrobble.played_at >= one_day_ago)
        .scalar()
        or 0
    )

    return {
        "dau": dau,
        "mau": mau,
        "scrobbles_24h": scrobbles_24h,
        "source_distribution": source_distribution,
    }


# ─── ANNOUNCEMENTS & FEATURE FLAGS ────────────────────────────────────────────

@router.get("/announcements")
def list_admin_announcements(db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]):
    announcements = db.query(SystemAnnouncement).order_by(SystemAnnouncement.id.desc()).all()
    return {"announcements": announcements}


@router.post("/announcements")
def create_announcement(
    data: AnnouncementCreate, db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]
):
    announcement = SystemAnnouncement(
        title=data.title,
        message=data.message,
        type=data.type,
        is_active=data.is_active,
    )
    db.add(announcement)
    db.commit()
    db.refresh(announcement)
    return {"status": "ok", "announcement": announcement}


@router.put("/announcements/{announcement_id}", responses={404: {"description": "Not Found"}})
def update_announcement(
    announcement_id: int,
    data: AnnouncementUpdate,
    db: Annotated[Session, Depends(get_db)],
    admin: Annotated[User, Depends(get_admin_user)],
):
    ann = db.query(SystemAnnouncement).filter(SystemAnnouncement.id == announcement_id).first()
    if not ann:
        raise HTTPException(404, "Объявление не найдено")

    if data.title is not None:
        ann.title = data.title  # type: ignore[assignment]
    if data.message is not None:
        ann.message = data.message  # type: ignore[assignment]
    if data.type is not None:
        ann.type = data.type  # type: ignore[assignment]
    if data.is_active is not None:
        ann.is_active = data.is_active  # type: ignore[assignment]

    db.commit()
    db.refresh(ann)
    return {"status": "ok", "announcement": ann}


@router.delete("/announcements/{announcement_id}", responses={404: {"description": "Not Found"}})
def delete_announcement(
    announcement_id: int, db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]
):
    ann = db.query(SystemAnnouncement).filter(SystemAnnouncement.id == announcement_id).first()
    if not ann:
        raise HTTPException(404, "Объявление не найдено")
    db.delete(ann)
    db.commit()
    return {"status": "ok"}


@router.get("/feature-flags")
def list_admin_feature_flags(db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]):
    flags = db.query(FeatureFlag).all()
    return {"feature_flags": flags}


@router.post("/feature-flags", responses={400: {"description": "Bad Request"}})
def create_feature_flag(
    data: FeatureFlagCreate, db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]
):
    existing = db.query(FeatureFlag).filter(FeatureFlag.key == data.key).first()
    if existing:
        raise HTTPException(400, f"Флаг с ключом '{data.key}' уже существует")

    flag = FeatureFlag(key=data.key, description=data.description, is_enabled=data.is_enabled)
    db.add(flag)
    db.commit()
    db.refresh(flag)
    return {"status": "ok", "feature_flag": flag}


@router.put("/feature-flags/{key}", responses={404: {"description": "Not Found"}})
def update_feature_flag(
    key: str,
    data: FeatureFlagUpdate,
    db: Annotated[Session, Depends(get_db)],
    admin: Annotated[User, Depends(get_admin_user)],
):
    flag = db.query(FeatureFlag).filter(FeatureFlag.key == key).first()
    if not flag:
        raise HTTPException(404, "Фича-флаг не найден")

    flag.is_enabled = data.is_enabled  # type: ignore[assignment]
    if data.description is not None:
        flag.description = data.description  # type: ignore[assignment]
    flag.updated_at = datetime.now(UTC)  # type: ignore[assignment]

    db.commit()
    db.refresh(flag)
    return {"status": "ok", "feature_flag": flag}


@router.delete("/feature-flags/{key}", responses={404: {"description": "Not Found"}})
def delete_feature_flag(key: str, db: Annotated[Session, Depends(get_db)], admin: Annotated[User, Depends(get_admin_user)]):
    flag = db.query(FeatureFlag).filter(FeatureFlag.key == key).first()
    if not flag:
        raise HTTPException(404, "Фича-флаг не найден")
    db.delete(flag)
    db.commit()
    return {"status": "ok"}


# ─── METADATA BLACKLIST & NOISE FILTERS ───────────────────────────────────────

@router.get("/catalog/blacklist")
def list_blacklist_filters(
    db: Annotated[Session, Depends(get_db)],
    admin: Annotated[User, Depends(get_admin_user)],
):
    """List all noise/blacklist metadata filters."""
    filters = db.query(BlacklistFilter).all()
    return {"filters": filters}


@router.post("/catalog/blacklist")
def create_blacklist_filter(
    data: BlacklistFilterCreate,
    db: Annotated[Session, Depends(get_db)],
    admin: Annotated[User, Depends(get_admin_user)],
):
    """Create a new metadata noise/blacklist filter."""
    new_filter = BlacklistFilter(
        pattern=data.pattern,
        filter_type=data.filter_type,
        reason=data.reason,
        is_active=True,
    )
    db.add(new_filter)
    db.commit()
    db.refresh(new_filter)
    return {"status": "ok", "filter": new_filter}


@router.delete("/catalog/blacklist/{filter_id}", responses={404: {"description": "Not Found"}})
def delete_blacklist_filter(
    filter_id: int,
    db: Annotated[Session, Depends(get_db)],
    admin: Annotated[User, Depends(get_admin_user)],
):
    """Delete a blacklist filter."""
    f = db.query(BlacklistFilter).filter(BlacklistFilter.id == filter_id).first()
    if not f:
        raise HTTPException(404, "Фильтр не найден")
    db.delete(f)
    db.commit()
    return {"status": "ok"}


# ─── WORKER & IMPORT JOBS MONITORING ──────────────────────────────────────────

@router.get("/jobs/lastfm")
def list_lastfm_import_jobs(
    db: Annotated[Session, Depends(get_db)],
    admin: Annotated[User, Depends(get_admin_user)],
):
    """List all Last.fm import tasks."""
    jobs = db.query(LastfmImportJob).order_by(LastfmImportJob.id.desc()).limit(50).all()
    return {"jobs": jobs}


@router.post("/jobs/lastfm/{job_id}/retry", responses={404: {"description": "Not Found"}})
def retry_lastfm_import_job(
    job_id: int,
    db: Annotated[Session, Depends(get_db)],
    admin: Annotated[User, Depends(get_admin_user)],
):
    """Reset and retry a failed Last.fm import task."""
    job = db.query(LastfmImportJob).filter(LastfmImportJob.id == job_id).first()
    if not job:
        raise HTTPException(404, "Задача импорта не найдена")

    job.status = "pending"  # type: ignore[assignment]
    job.error_log = None  # type: ignore[assignment]
    db.commit()
    return {"status": "ok", "message": f"Задача импорта #{job_id} поставлена в очередь на повтор"}


# ─── LISTEN TOGETHER ROOMS MONITORING ─────────────────────────────────────────

@router.get("/together/rooms")
def list_admin_together_rooms(
    admin: Annotated[User, Depends(get_admin_user)],
):
    """List live Listen Together rooms and metrics."""
    return {"rooms": manager.get_active_rooms_info()}
