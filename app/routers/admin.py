from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import get_admin_user
from app.core.websockets import manager
from app.database import get_db
from app.models import Achievement, Follow, Scrobble, Track, User
from app.schemas import VerifyUserRequest

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/stats")
def get_admin_stats(db: Annotated[Session, Depends(
        get_db)], admin: Annotated[User, Depends(get_admin_user)]):
    total_users = db.query(User).count()
    total_scrobbles = db.query(Scrobble).count()
    total_tracks = db.query(Track).count()
    active_ws = {u: len(conns)
                 for u, conns in manager.active_connections.items()}

    # Optimize N+1 queries by grouping scrobbles statistics by user_id
    stats = db.query(
        Scrobble.user_id,
        func.count(Scrobble.id).label("scrobbles_count"),
        func.sum(Scrobble.xp_earned).label("sum_xp")
    ).group_by(Scrobble.user_id).all()

    stats_dict = {
        row.user_id: (
            row.scrobbles_count,
            row.sum_xp or 0) for row in stats}

    users = db.query(User).all()
    user_list = []
    for u in users:
        scrobbles_count, sum_xp = stats_dict.get(u.id, (0, 0))
        total_xp = sum_xp + (u.integration.bonus_xp or 0)
        user_list.append({"id": u.id,
                          "username": u.username,
                          "display_name": u.profile.display_name,
                          "avatar_url": u.profile.avatar_url,
                          "bio": u.profile.bio,
                          "is_verified": u.integration.is_verified,
                          "is_dev": u.role == "admin",
                          "scrobbles": scrobbles_count,
                          "total_xp": total_xp})

    achs = db.query(Achievement).all()
    ach_list = [{"id": a.id,
                 "name": a.name,
                 "description": a.description,
                 "icon": a.icon,
                 "rule_type": a.rule_type,
                 "rule_value": a.rule_value,
                 "rule_target": a.rule_target,
                 "rule_meta": a.rule_meta,
                 "target_image": a.target_image,
                 "reward_xp": a.reward_xp} for a in achs]

    recent_tracks = db.query(Track).order_by(Track.id.desc()).limit(100).all()
    track_list = [{"id": t.id,
                   "title": t.title,
                   "artist": t.artist,
                   "cover_url": t.cover_url,
                   "track_url": t.track_url} for t in recent_tracks]

    return {
        "total_users": total_users,
        "total_scrobbles": total_scrobbles,
        "total_tracks": total_tracks,
        "active_websockets": active_ws,
        "users": user_list,
        "achievements": ach_list,
        "tracks": track_list
    }


@router.post("/users/{target_username}/verify",
             responses={404: {"description": "Not Found"}})
def toggle_user_verification(target_username: str,
                             data: VerifyUserRequest,
                             db: Annotated[Session,
                                           Depends(get_db)],
                             admin: Annotated[User,
                                              Depends(get_admin_user)]):
    target_user = db.query(User).filter(
        User.username == target_username).first()
    if not target_user:
        raise HTTPException(404, "Юзер не найден")
    target_user.integration.is_verified = data.is_verified
    db.commit()
    return {"status": "ok", "is_verified": target_user.integration.is_verified}


@router.delete("/users/{target_username}",
               responses={404: {"description": "Not Found"},
                          400: {"description": "Bad Request"}})
def delete_user(target_username: str, db: Annotated[Session, Depends(
        get_db)], admin: Annotated[User, Depends(get_admin_user)]):
    target = db.query(User).filter(User.username == target_username).first()
    if not target:
        raise HTTPException(404, "Юзер не найден")
    if target.role == "admin":
        raise HTTPException(400, "Нельзя удалить разработчика")
    db.query(Follow).filter(
        (Follow.follower_id == target.id) | (
            Follow.following_id == target.id)).delete()
    db.delete(target)
    db.commit()
    return {"status": "ok"}
