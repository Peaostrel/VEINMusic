from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
import os

from app.database import get_db
from app.models import User, Scrobble, Track, Achievement, UserAchievement, Follow
from app.schemas import VerifyUserRequest, LevelUpdate, AdminUserUpdate, AchCreate, AchUpdate, AchAssign
from app.core.security import get_current_user
from app.core.websockets import manager

DEVELOPERS = set(os.getenv("DEVELOPERS", "peaostrel").split(","))

router = APIRouter(prefix="/api/admin", tags=["admin"])

def get_admin_user(current_user: User = Depends(get_current_user)):
    if current_user.username not in DEVELOPERS:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    return current_user

@router.get("/stats")
def get_admin_stats(db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    total_users = db.query(User).count()
    total_scrobbles = db.query(Scrobble).count()
    total_tracks = db.query(Track).count()
    active_ws = {u: len(conns) for u, conns in manager.active_connections.items()}
    
    users = db.query(User).all()
    user_list = []
    for u in users:
        scrobbles_count = db.query(Scrobble).filter(Scrobble.user_id == u.id).count()
        txp = db.query(func.sum(Scrobble.xp_earned)).filter(Scrobble.user_id == u.id).scalar() or 0
        total_xp = txp + (u.integration.bonus_xp or 0)
        user_list.append({
            "id": u.id, "username": u.username, "display_name": u.profile.display_name,
            "avatar_url": u.profile.avatar_url, "bio": u.profile.bio, "is_verified": u.integration.is_verified,
            "is_dev": u.username in DEVELOPERS, "scrobbles": scrobbles_count,
            "total_xp": total_xp
        })
        
    achs = db.query(Achievement).all()
    ach_list = [{"id": a.id, "name": a.name, "description": a.description, "icon": a.icon, "rule_type": a.rule_type, "rule_value": a.rule_value, "rule_target": a.rule_target, "rule_meta": a.rule_meta, "target_image": a.target_image, "reward_xp": a.reward_xp} for a in achs]
    
    recent_tracks = db.query(Track).order_by(Track.id.desc()).limit(100).all()
    track_list = [{"id": t.id, "title": t.title, "artist": t.artist, "cover_url": t.cover_url, "track_url": t.track_url} for t in recent_tracks]
    
    return {
        "total_users": total_users,
        "total_scrobbles": total_scrobbles,
        "total_tracks": total_tracks,
        "active_websockets": active_ws,
        "users": user_list,
        "achievements": ach_list,
        "tracks": track_list
    }

@router.post("/users/{target_username}/verify")
def toggle_user_verification(target_username: str, data: VerifyUserRequest, db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    target_user = db.query(User).filter(User.username == target_username).first()
    if not target_user: raise HTTPException(404, "Юзер не найден")
    target_user.integration.is_verified = data.is_verified
    db.commit()
    return {"status": "ok", "is_verified": target_user.integration.is_verified}

@router.delete("/users/{target_username}")
def delete_user(target_username: str, db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    target = db.query(User).filter(User.username == target_username).first()
    if not target: raise HTTPException(404, "Юзер не найден")
    if target.username in DEVELOPERS: raise HTTPException(400, "Нельзя удалить разработчика")
    db.query(Follow).filter((Follow.follower_id == target.id) | (Follow.following_id == target.id)).delete()
    db.delete(target); db.commit()
    return {"status": "ok"}
