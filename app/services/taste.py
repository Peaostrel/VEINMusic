"""Taste matching between users."""


from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.models import (
    Scrobble,
    Track,
    User,
)

# Dummy taste match internal to prevent undefined errors


def get_taste_match_internal(viewer, profile, db):
    viewer_user = db.query(User).filter(User.username == viewer).first()
    profile_user = db.query(User).filter(User.username == profile).first()
    if not viewer_user or not profile_user or viewer == profile:
        return {"match": 0, "common_artists": []}
    sql = text("""
        SELECT DISTINCT t.artist
        FROM scrobbles s JOIN tracks t ON s.track_id = t.id
        WHERE s.user_id = :u1 AND s.listened_sec * 100 >= t.duration * 85
        INTERSECT
        SELECT DISTINCT t.artist
        FROM scrobbles s JOIN tracks t ON s.track_id = t.id
        WHERE s.user_id = :u2 AND s.listened_sec * 100 >= t.duration * 85
    """)
    common_rows = db.execute(
        sql, {"u1": viewer_user.id, "u2": profile_user.id}).fetchall()
    common_artists = list({a.strip()
                          for row in common_rows for a in row[0].split(',')})
    sql_total = text("""
        SELECT COUNT(DISTINCT t.artist)
        FROM scrobbles s JOIN tracks t ON s.track_id = t.id
        WHERE (s.user_id = :u1 OR s.user_id = :u2) AND s.listened_sec * 100 >= t.duration * 85
    """)
    total_unique = db.execute(
        sql_total, {
            "u1": viewer_user.id, "u2": profile_user.id}).scalar() or 1
    match_percent = int((len(common_artists) / total_unique) * 100)
    return {"match": min(match_percent, 100),
            "common_artists": common_artists[:5]}


# sanitize_text imported from app.utils

def get_taste_twins(username: str, db: Session):
    me = db.query(User).filter(User.username == username).first()
    if not me:
        return []

    sql = text("""
        SELECT u.id, u.username, p.display_name, p.avatar_url, COUNT(DISTINCT t.artist) as common_count
        FROM users u
        JOIN user_profiles p ON u.id = p.user_id
        JOIN scrobbles s ON u.id = s.user_id
        JOIN tracks t ON s.track_id = t.id
        WHERE u.id != :my_id
          AND (p.is_private IS NULL OR p.is_private = :not_private)
          AND (u.is_banned IS NULL OR u.is_banned = :not_private)
          AND s.listened_sec * 100 >= t.duration * 85
          AND t.artist IN (
              SELECT DISTINCT t2.artist
              FROM scrobbles s2
              JOIN tracks t2 ON s2.track_id = t2.id
              WHERE s2.user_id = :my_id AND s2.listened_sec * 100 >= t2.duration * 85
          )
        GROUP BY u.id, u.username, p.display_name, p.avatar_url
        HAVING COUNT(DISTINCT t.artist) > 0
        ORDER BY common_count DESC
        LIMIT 10
    """)

    rows = db.execute(sql, {"my_id": me.id, "not_private": False}).fetchall()
    if not rows:
        return []

    my_artist_count = db.query(
        func.count(
            func.distinct(
                Track.artist))).join(Scrobble).filter(
        Scrobble.user_id == me.id,
        Scrobble.listened_sec *
        100 >= func.coalesce(func.nullif(Track.duration, 0), 180) * 85).scalar() or 1

    results = []
    for row in rows:
        uid, uname, dname, avatar, common = row
        match = int((common / my_artist_count) * 100)

        common_sql = text("""
            SELECT DISTINCT t.artist FROM tracks t
            JOIN scrobbles s ON t.id = s.track_id
            WHERE s.user_id = :u1 AND s.listened_sec * 100 >= t.duration * 85
            INTERSECT
            SELECT DISTINCT t.artist FROM tracks t
            JOIN scrobbles s ON t.id = s.track_id
            WHERE s.user_id = :u2 AND s.listened_sec * 100 >= t.duration * 85
            LIMIT 3
        """)
        common_names = [
            r[0].split(',')[0].strip() for r in db.execute(
                common_sql, {
                    "u1": me.id, "u2": uid}).fetchall()]

        results.append({
            "username": uname,
            "display_name": dname or uname,
            "avatar_url": avatar,
            "match": min(match, 100),
            "common_artists": common_names
        })
    return results
