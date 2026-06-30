from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta

from app.database import get_db
from app.models import User, UserProfile, Scrobble, Track, ScrobbleLike, ScrobbleComment, Follow
from app.schemas import ScrobbleData, CommentRequest
from app.core.security import get_current_user, get_current_user_optional
from app.services.scrobble_processor import process_scrobble, format_history_item
from typing import Optional
from app.core.redis import redis_lock

router = APIRouter(prefix="/api", tags=["scrobbling"])


@router.post("/scrobble",
             responses={500: {"description": "Internal server error"}})
async def add_scrobble(data: ScrobbleData,
                       background_tasks: BackgroundTasks,
                       db: Annotated[Session,
                                     Depends(get_db)],
                       current_user: Annotated[User,
                                               Depends(get_current_user)]):
    user = current_user

    async with redis_lock(f"scrobble_lock:{user.id}", expire_sec=10):
        try:
            # Anti-Cheat: Max 40 scrobbles per hour
            now = datetime.now(timezone.utc)
            hour_ago = now - timedelta(hours=1)
            scrobbles_h = db.query(Scrobble).filter(
                Scrobble.user_id == user.id,
                Scrobble.played_at >= hour_ago).count()
            if scrobbles_h > 40:
                return {
                    "status": "flagged",
                    "message": "Слишком много прослушиваний за час (Anti-Cheat)"}

            # Anti-Spam: Max 1 new scrobble per 2 seconds (allows quick skips
            # which are handled by process_scrobble)
            last_s = db.query(Scrobble).filter(
                Scrobble.user_id == user.id).order_by(
                Scrobble.id.desc()).first()
            if last_s and (now - last_s.updated_at).total_seconds() < 2:
                # Case-insensitive track query for spam check
                from sqlalchemy import func
                track = db.query(Track).filter(
                    func.lower(
                        Track.title) == func.lower(
                        data.title),
                    func.lower(
                        Track.artist) == func.lower(
                        data.artist)).first()
                if not track or last_s.track_id != track.id:
                    return {
                        "status": "rate_limited",
                        "message": "Слишком частые скробблы"}

            res = await process_scrobble(db, user, data.title, data.artist, data.cover_url, data.track_url, data.source, data.progress_sec, data.is_playing, data.duration, data.album)

            from app.core.redis import enqueue_background_task
            await enqueue_background_task('check_achievements', user.id, background_tasks=background_tasks)

            return {"status": res}
        except Exception:
            import logging
            logging.exception("Scrobble error")
            raise HTTPException(
                status_code=500,
                detail="Internal Server Error")


@router.get("/history/{username}",
            responses={403: {"description": "Private profile"},
                       404: {"description": "User not found"}})
def get_history(username: str,
                request: Request,
                db: Annotated[Session,
                              Depends(get_db)],
                current_user: Annotated[Optional[User],
                                        Depends(get_current_user_optional)] = None):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(404)

    # Privacy check: if user is private, only the user themselves can view
    # their history
    if user.profile.is_private:
        is_owner = current_user and current_user.id == user.id
        if not is_owner:
            raise HTTPException(
                status_code=403,
                detail="Это приватный профиль")

    scrobbles = db.query(
        Scrobble,
        Track).join(Track).filter(
        Scrobble.user_id == user.id).order_by(
            Scrobble.id.desc()).limit(10).all()

    s_ids = [s.id for s, t in scrobbles]
    from sqlalchemy import func
    likes = db.query(
        ScrobbleLike.scrobble_id,
        func.count(
            ScrobbleLike.id)).filter(
        ScrobbleLike.scrobble_id.in_(s_ids)).group_by(
                ScrobbleLike.scrobble_id).all()
    comments = db.query(
        ScrobbleComment.scrobble_id,
        func.count(
            ScrobbleComment.id)).filter(
        ScrobbleComment.scrobble_id.in_(s_ids)).group_by(
                ScrobbleComment.scrobble_id).all()

    counters = {sid: {"likes": 0, "comments": 0} for sid in s_ids}
    for sid, count in likes:
        counters[sid]["likes"] = count
    for sid, count in comments:
        counters[sid]["comments"] = count

    return {
        "user": username,
        "history": [
            format_history_item(
                s,
                t,
                counters=counters) for s,
            t in scrobbles]}


@router.get("/global-history")
def get_global_history(db: Annotated[Session, Depends(get_db)]):
    scrobbles = db.query(
        Scrobble,
        Track).join(Track).join(
        User,
        Scrobble.user_id == User.id).join(
            UserProfile,
            User.id == UserProfile.user_id).filter(
                not UserProfile.is_private).order_by(
                    Scrobble.id.desc()).limit(20).all()

    s_ids = [s.id for s, t in scrobbles]
    from sqlalchemy import func
    likes = db.query(
        ScrobbleLike.scrobble_id,
        func.count(
            ScrobbleLike.id)).filter(
        ScrobbleLike.scrobble_id.in_(s_ids)).group_by(
                ScrobbleLike.scrobble_id).all()
    comments = db.query(
        ScrobbleComment.scrobble_id,
        func.count(
            ScrobbleComment.id)).filter(
        ScrobbleComment.scrobble_id.in_(s_ids)).group_by(
                ScrobbleComment.scrobble_id).all()

    counters = {sid: {"likes": 0, "comments": 0} for sid in s_ids}
    for sid, count in likes:
        counters[sid]["likes"] = count
    for sid, count in comments:
        counters[sid]["comments"] = count

    return [format_history_item(s, t, counters=counters) for s, t in scrobbles]


@router.get("/friends-history/{username}",
            responses={403: {"description": "Access denied"},
                       404: {"description": "User not found"}})
def get_friends_history(username: str,
                        request: Request,
                        db: Annotated[Session,
                                      Depends(get_db)],
                        current_user: Annotated[User,
                                                Depends(get_current_user)]):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(404)

    # Only the user themselves can see their friends' history
    if current_user.id != user.id:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    follows = db.query(
        Follow.following_id).filter(
        Follow.follower_id == user.id).all()
    following_ids = [f[0] for f in follows]

    if not following_ids:
        return []

    scrobbles = db.query(
        Scrobble,
        Track).join(Track).filter(
        Scrobble.user_id.in_(following_ids)).order_by(
            Scrobble.id.desc()).limit(20).all()

    s_ids = [s.id for s, t in scrobbles]
    from sqlalchemy import func
    likes = db.query(
        ScrobbleLike.scrobble_id,
        func.count(
            ScrobbleLike.id)).filter(
        ScrobbleLike.scrobble_id.in_(s_ids)).group_by(
                ScrobbleLike.scrobble_id).all()
    comments = db.query(
        ScrobbleComment.scrobble_id,
        func.count(
            ScrobbleComment.id)).filter(
        ScrobbleComment.scrobble_id.in_(s_ids)).group_by(
                ScrobbleComment.scrobble_id).all()

    counters = {sid: {"likes": 0, "comments": 0} for sid in s_ids}
    for sid, count in likes:
        counters[sid]["likes"] = count
    for sid, count in comments:
        counters[sid]["comments"] = count

    return [format_history_item(s, t, counters=counters) for s, t in scrobbles]


@router.get("/discovery/taste-twins")
def api_get_taste_twins(
        username: str, db: Annotated[Session, Depends(get_db)]):
    from app.routers.extended import get_taste_twins
    return get_taste_twins(username, db)


@router.post("/scrobble/{scrobble_id}/like",
             responses={404: {"description": "Scrobble not found"}})
def toggle_like(scrobble_id: int, db: Annotated[Session, Depends(
        get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    user = current_user
    # Verify scrobble exists
    scrobble = db.query(Scrobble).filter(Scrobble.id == scrobble_id).first()
    if not scrobble:
        raise HTTPException(status_code=404, detail="Скроббл не найден")

    like = db.query(ScrobbleLike).filter_by(
        user_id=user.id, scrobble_id=scrobble_id).first()
    if like:
        db.delete(like)
        db.commit()
        return {"status": "unliked"}
    else:
        db.add(ScrobbleLike(user_id=user.id, scrobble_id=scrobble_id))
        db.commit()
        return {"status": "liked"}


@router.post("/scrobble/{scrobble_id}/comment",
             responses={404: {"description": "Scrobble not found"}})
def add_comment(scrobble_id: int,
                data: CommentRequest,
                db: Annotated[Session,
                              Depends(get_db)],
                current_user: Annotated[User,
                                        Depends(get_current_user)]):
    from app.utils import sanitize_text
    user = current_user
    # Verify scrobble exists
    scrobble = db.query(Scrobble).filter(Scrobble.id == scrobble_id).first()
    if not scrobble:
        raise HTTPException(status_code=404, detail="Скроббл не найден")

    clean_content = sanitize_text(data.content)
    db.add(
        ScrobbleComment(
            user_id=user.id,
            scrobble_id=scrobble_id,
            content=clean_content))
    db.commit()
    return {"status": "ok"}
