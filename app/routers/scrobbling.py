from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta

from app.database import get_db
from app.models import User, UserProfile, Scrobble, Track, ScrobbleLike, ScrobbleComment, Follow
from app.schemas import ScrobbleData, LikeRequest, CommentRequest
from app.core.security import get_current_user
from app.services.scrobble_processor import process_scrobble, format_history_item

router = APIRouter(prefix="/api", tags=["scrobbling"])

@router.post("/scrobble")
async def add_scrobble(data: ScrobbleData, background_tasks: BackgroundTasks, db: Annotated[Session, Depends(get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    try:
        user = current_user
        
        # Anti-Cheat: Max 40 scrobbles per hour
        hour_ago = datetime.utcnow() - timedelta(hours=1)
        scrobbles_h = db.query(Scrobble).filter(Scrobble.user_id == user.id, Scrobble.played_at >= hour_ago).count()
        if scrobbles_h > 40:
             return {"status": "flagged", "message": "Слишком много прослушиваний за час (Anti-Cheat)"}

        # Anti-Spam: Max 1 new scrobble per 10 seconds
        last_s = db.query(Scrobble).filter(Scrobble.user_id == user.id).order_by(Scrobble.id.desc()).first()
        if last_s and (datetime.utcnow() - last_s.played_at).total_seconds() < 10:
            track = db.query(Track).filter(Track.title == data.title, Track.artist == data.artist).first()
            if not track or last_s.track_id != track.id:
                return {"status": "rate_limited", "message": "Слишком частые скробблы"}

        res = await process_scrobble(db, user, data.title, data.artist, data.cover_url, data.track_url, data.source, data.progress_sec, data.is_playing, data.duration, data.album)
        
        from app.routers.extended import run_check_achievements_bg
        background_tasks.add_task(run_check_achievements_bg, user.id)
        
        return {"status": res}
    except Exception as e:
        import logging
        logging.error(f"Scrobble error: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")

@router.get("/history/{username}")
def get_history(username: str, db: Annotated[Session, Depends(get_db)]):
    user = db.query(User).filter(User.username == username).first()
    if not user: raise HTTPException(404)
    scrobbles = db.query(Scrobble, Track).join(Track).filter(Scrobble.user_id == user.id).order_by(Scrobble.id.desc()).limit(10).all()
    
    s_ids = [s.id for s, t in scrobbles]
    from sqlalchemy import func
    likes = db.query(ScrobbleLike.scrobble_id, func.count(ScrobbleLike.id)).filter(ScrobbleLike.scrobble_id.in_(s_ids)).group_by(ScrobbleLike.scrobble_id).all()
    comments = db.query(ScrobbleComment.scrobble_id, func.count(ScrobbleComment.id)).filter(ScrobbleComment.scrobble_id.in_(s_ids)).group_by(ScrobbleComment.scrobble_id).all()
    
    counters = {sid: {"likes": 0, "comments": 0} for sid in s_ids}
    for sid, count in likes: counters[sid]["likes"] = count
    for sid, count in comments: counters[sid]["comments"] = count
    
    return {"user": username, "history": [format_history_item(s, t, counters=counters) for s, t in scrobbles]}

@router.get("/global-history")
def get_global_history(db: Annotated[Session, Depends(get_db)]):
    scrobbles = db.query(Scrobble, Track).join(Track).join(User, Scrobble.user_id == User.id).join(UserProfile, User.id == UserProfile.user_id).filter(UserProfile.is_private == False).order_by(Scrobble.id.desc()).limit(20).all()
    
    s_ids = [s.id for s, t in scrobbles]
    from sqlalchemy import func
    likes = db.query(ScrobbleLike.scrobble_id, func.count(ScrobbleLike.id)).filter(ScrobbleLike.scrobble_id.in_(s_ids)).group_by(ScrobbleLike.scrobble_id).all()
    comments = db.query(ScrobbleComment.scrobble_id, func.count(ScrobbleComment.id)).filter(ScrobbleComment.scrobble_id.in_(s_ids)).group_by(ScrobbleComment.scrobble_id).all()
    
    counters = {sid: {"likes": 0, "comments": 0} for sid in s_ids}
    for sid, count in likes: counters[sid]["likes"] = count
    for sid, count in comments: counters[sid]["comments"] = count
    
    return [format_history_item(s, t, counters=counters) for s, t in scrobbles]

@router.get("/friends-history/{username}")
def get_friends_history(username: str, db: Annotated[Session, Depends(get_db)]):
    user = db.query(User).filter(User.username == username).first()
    if not user: raise HTTPException(404)
    
    follows = db.query(Follow.following_id).filter(Follow.follower_id == user.id).all()
    following_ids = [f[0] for f in follows]
    
    if not following_ids:
        return []
        
    scrobbles = db.query(Scrobble, Track).join(Track).filter(Scrobble.user_id.in_(following_ids)).order_by(Scrobble.id.desc()).limit(20).all()
    
    s_ids = [s.id for s, t in scrobbles]
    from sqlalchemy import func
    likes = db.query(ScrobbleLike.scrobble_id, func.count(ScrobbleLike.id)).filter(ScrobbleLike.scrobble_id.in_(s_ids)).group_by(ScrobbleLike.scrobble_id).all()
    comments = db.query(ScrobbleComment.scrobble_id, func.count(ScrobbleComment.id)).filter(ScrobbleComment.scrobble_id.in_(s_ids)).group_by(ScrobbleComment.scrobble_id).all()
    
    counters = {sid: {"likes": 0, "comments": 0} for sid in s_ids}
    for sid, count in likes: counters[sid]["likes"] = count
    for sid, count in comments: counters[sid]["comments"] = count
    
    return [format_history_item(s, t, counters=counters) for s, t in scrobbles]

@router.get("/discovery/taste-twins")
def api_get_taste_twins(username: str, db: Annotated[Session, Depends(get_db)]):
    from app.routers.extended import get_taste_twins
    return get_taste_twins(username, db)

@router.post("/scrobble/{scrobble_id}/like")
def toggle_like(scrobble_id: int, db: Annotated[Session, Depends(get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    user = current_user
    like = db.query(ScrobbleLike).filter_by(user_id=user.id, scrobble_id=scrobble_id).first()
    if like:
        db.delete(like); db.commit()
        return {"status": "unliked"}
    else:
        db.add(ScrobbleLike(user_id=user.id, scrobble_id=scrobble_id)); db.commit()
        return {"status": "liked"}

@router.post("/scrobble/{scrobble_id}/comment")
def add_comment(scrobble_id: int, data: CommentRequest, db: Annotated[Session, Depends(get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    from app.routers.profile import sanitize_text
    user = current_user
    clean_content = sanitize_text(data.content)
    db.add(ScrobbleComment(user_id=user.id, scrobble_id=scrobble_id, content=clean_content))
    db.commit()
    return {"status": "ok"}
