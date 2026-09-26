"""Achievements listing and admin achievement/user management."""

from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
)
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.constants import USER_NOT_FOUND
from app.core.security import get_admin_user
from app.database import get_db
from app.models import (
    Achievement,
    Scrobble,
    Track,
    User,
    UserAchievement,
)
from app.routers.common import _check_privacy_and_owner
from app.schemas import (
    AchAssign,
    AchCreate,
    AchUpdate,
    LevelUpdate,
)
from app.services import audit
from app.services.achievements import (
    _enrich_achievement_data,
    _format_achievement_data,
    check_auto_achievements,
)

router = APIRouter(tags=["achievements"])

# --- /api/achievements/all/{username} ---


@router.get("/api/achievements/all/{username}",
            responses={403: {"description": "Private profile"},
                       404: {"description": "User not found"}})
def get_all_achievements(
        username: str, request: Request, db: Annotated[Session, Depends(get_db)]):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(404, "User not found")
    is_hidden, is_owner = _check_privacy_and_owner(user, request, db)
    if is_hidden:
        raise HTTPException(403, "Это приватный профиль")

    # Re-checking awards writes to the DB, so only do it for the owner
    # instead of on every anonymous page view.
    if is_owner:
        check_auto_achievements(user, db)

    all_achs = db.query(Achievement).all()
    user_achs = {ua.achievement_id: ua for ua in db.query(
        UserAchievement).filter_by(user_id=user.id).all()}
    total_users = db.query(User).count()
    res = []

    for a in all_achs:
        res.append(_format_achievement_data(db, user, a, user_achs.get(a.id), total_users))

    earned = [x for x in res if x["is_earned"]]
    unearned = [x for x in res if not x["is_earned"]]
    earned.sort(key=lambda x: str(x["earned_at"]), reverse=True)
    res = earned + unearned

    return {
        "user": {
            "username": user.username,
            "display_name": user.profile.display_name or user.username,
            "avatar_url": user.profile.avatar_url},
        "achievements": res,
        "earned_count": len(user_achs),
        "total_count": len(all_achs)}


# --- POST /api/admin/achievements ---


@router.post("/api/admin/achievements")
# NOSONAR
async def create_achievement(data: AchCreate, db: Annotated[Session, Depends(
        get_db)], admin: Annotated[User, Depends(get_admin_user)]):
    target_val = data.rule_target or ""
    val = data.rule_value
    t_img = data.target_image or ""
    meta_text = data.rule_meta or ""
    target_val, val, t_img, meta_text = await _enrich_achievement_data(
        data.rule_type, target_val, val, t_img, meta_text
    )
    db.add(
        Achievement(
            name=data.name,
            description=data.description,
            icon=data.icon,
            rule_type=data.rule_type,
            rule_value=val,
            rule_target=target_val,
            target_image=t_img,
            reward_xp=data.reward_xp,
            rule_meta=meta_text))
    audit.record(db, admin, "achievement.create", data.name, rule=data.rule_type, value=val)
    db.commit()
    return {"status": "ok"}


# --- PUT /api/admin/achievements/{ach_id} ---
@router.put("/api/admin/achievements/{ach_id}",
            responses={404: {"description": "Achievement not found"}})
# NOSONAR
async def update_achievement(ach_id: int,
                             data: AchUpdate,
                             db: Annotated[Session,
                                           Depends(get_db)],
                             admin: Annotated[User,
                                              Depends(get_admin_user)]):
    ach = db.query(Achievement).filter(Achievement.id == ach_id).first()
    if not ach:
        raise HTTPException(404)
    target_val = data.rule_target or ""
    val = data.rule_value
    t_img = data.target_image or ""
    meta_text = data.rule_meta or ""
    target_val, val, t_img, meta_text = await _enrich_achievement_data(
        data.rule_type, target_val, val, t_img, meta_text
    )
    ach.name, ach.description, ach.icon, ach.rule_type, ach.rule_value, ach.rule_target, ach.target_image, ach.reward_xp, ach.rule_meta = data.name, data.description, data.icon, data.rule_type, val, target_val, t_img, data.reward_xp, meta_text  # type: ignore[assignment]
    audit.record(db, admin, "achievement.update", data.name, rule=data.rule_type, value=val)
    db.commit()
    return {"status": "ok"}


# --- DELETE /api/admin/achievements/{ach_id} ---
@router.delete("/api/admin/achievements/{ach_id}", responses={404: {"description": "Achievement not found"}})
def delete_achievement(ach_id: int, db: Annotated[Session, Depends(
        get_db)], admin: Annotated[User, Depends(get_admin_user)]):
    ach = db.query(Achievement).filter(Achievement.id == ach_id).first()
    if not ach:
        raise HTTPException(404, "Достижение не найдено")
    audit.record(db, admin, "achievement.delete", ach.name)
    db.query(UserAchievement).filter(
        UserAchievement.achievement_id == ach_id).delete()
    db.delete(ach)
    db.commit()
    return {"status": "ok"}


# --- DELETE /api/admin/tracks/{track_id} ---
@router.delete("/api/admin/tracks/{track_id}", responses={404: {"description": "Track not found"}})
def delete_track(track_id: int, db: Annotated[Session, Depends(
        get_db)], admin: Annotated[User, Depends(get_admin_user)]):
    track = db.query(Track).filter(Track.id == track_id).first()
    if not track:
        raise HTTPException(404, "Трек не найден")
    scrobbles = db.query(Scrobble).filter(Scrobble.track_id == track_id).delete()
    audit.record(db, admin, "catalog.delete_track", f"#{track_id}",
                 track=f"{track.artist} — {track.title}", scrobbles=scrobbles)
    db.delete(track)
    db.commit()
    return {"status": "ok"}


# --- POST /api/admin/users/{target_username}/achievements ---
@router.post("/api/admin/users/{target_username}/achievements",
             responses={404: {"description": "User not found"}})
def assign_achievement(target_username: str,
                       data: AchAssign,
                       db: Annotated[Session,
                                     Depends(get_db)],
                       admin: Annotated[User,
                                        Depends(get_admin_user)]):
    user = db.query(User).filter(User.username == target_username).first()
    if not user:
        raise HTTPException(404, USER_NOT_FOUND)
    ach = db.query(Achievement).filter_by(id=data.achievement_id).first()
    if not ach:
        raise HTTPException(404, "Достижение не найдено")
    if not db.query(UserAchievement).filter_by(user_id=user.id,
                                               achievement_id=data.achievement_id).first():
        db.add(
            UserAchievement(
                user_id=user.id,
                achievement_id=data.achievement_id))
        user.integration.bonus_xp = int(
            user.integration.bonus_xp or 0) + int(ach.reward_xp or 0)
        audit.record(db, admin, "achievement.grant", target_username, achievement=ach.name)
        db.commit()
    return {"status": "ok"}


# --- DELETE /api/admin/users/{target_username}/achievements/{achievement_id} ---
@router.delete(
    "/api/admin/users/{target_username}/achievements/{achievement_id}",
    responses={
        404: {
            "description": "User not found"}})
def remove_achievement_from_user(target_username: str,
                                 achievement_id: int,
                                 db: Annotated[Session,
                                               Depends(get_db)],
                                 admin: Annotated[User,
                                                  Depends(get_admin_user)]):
    target = db.query(User).filter(User.username == target_username).first()
    if not target:
        raise HTTPException(404, USER_NOT_FOUND)
    ua = db.query(UserAchievement).filter_by(
        user_id=target.id, achievement_id=achievement_id).first()
    if ua:
        ach = db.query(Achievement).filter_by(id=achievement_id).first()
        if ach:
            target.integration.bonus_xp = (
                target.integration.bonus_xp or 0) - (ach.reward_xp or 0)
        audit.record(db, admin, "achievement.revoke", target_username,
                     achievement=ach.name if ach else achievement_id)
        db.delete(ua)
        db.commit()
    return {"status": "ok"}


# --- POST /api/admin/users/{target_username}/level ---
@router.post("/api/admin/users/{target_username}/level",
             responses={404: {"description": "User not found"},
                        400: {"description": "Invalid level"}})
def update_user_level(target_username: str,
                      data: LevelUpdate,
                      db: Annotated[Session,
                                    Depends(get_db)],
                      admin: Annotated[User,
                                       Depends(get_admin_user)]):
    target = db.query(User).filter(User.username == target_username).first()
    if not target:
        raise HTTPException(404, USER_NOT_FOUND)
    if data.new_level <= 0 or data.new_level > 10000:
        raise HTTPException(status_code=400,
                            detail="Уровень должен быть от 1 до 10000")
    # The level comes from total XP (earned per play + bonus), so the bonus
    # makes up the difference to the requested level
    earned_xp = db.query(func.coalesce(func.sum(Scrobble.xp_earned), 0)).join(Track).filter(
        Scrobble.user_id == target.id,
        Scrobble.listened_sec * 100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85).scalar() or 0
    target.integration.bonus_xp = max(
        0, ((data.new_level - 1) * 100) - int(earned_xp))
    audit.record(db, admin, "user.level", target_username, level=data.new_level)
    db.commit()
    return {"status": "ok"}


# --- DELETE /api/admin/users/{target_username}/scrobbles ---
@router.delete("/api/admin/users/{target_username}/scrobbles",
               responses={404: {"description": "User not found"}})
def wipe_user_scrobbles(target_username: str, db: Annotated[Session, Depends(
        get_db)], admin: Annotated[User, Depends(get_admin_user)]):
    target = db.query(User).filter(User.username == target_username).first()
    if not target:
        raise HTTPException(404, USER_NOT_FOUND)
    removed = db.query(Scrobble).filter(Scrobble.user_id == target.id).delete()
    audit.record(db, admin, "user.wipe_scrobbles", target_username, scrobbles=removed)
    db.commit()
    return {"status": "ok"}
