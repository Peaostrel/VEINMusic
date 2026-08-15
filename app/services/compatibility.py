import math
from typing import Any, cast

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Scrobble, Track, User


def _get_artist_map(user_id: int, db: Session) -> dict[str, int]:
    query = (
        db.query(Track.artist, func.count(Scrobble.id).label("count"))
        .join(Scrobble, Scrobble.track_id == Track.id)
        .filter(Scrobble.user_id == user_id)
        .group_by(Track.artist)
        .order_by(func.count(Scrobble.id).desc())
        .limit(100)
        .all()
    )
    return {str(row.artist): int(row[1]) for row in query if row.artist}


def _calculate_artist_similarity(
    u1_artist_map: dict[str, int],
    u2_artist_map: dict[str, int],
    common_artists: set[str],
) -> float:
    if not common_artists:
        return 0.0
    dot_product = sum(u1_artist_map[a] * u2_artist_map[a] for a in common_artists)
    mag1 = math.sqrt(sum(v * v for v in u1_artist_map.values()))
    mag2 = math.sqrt(sum(v * v for v in u2_artist_map.values()))
    if mag1 > 0 and mag2 > 0:
        return dot_product / (mag1 * mag2)
    return 0.0


def _get_genre_set(user_id: int, db: Session) -> set[str]:
    genres = (
        db.query(Track.genre)
        .join(Scrobble, Scrobble.track_id == Track.id)
        .filter(Scrobble.user_id == user_id, Track.genre.isnot(None), Track.genre != "")
        .group_by(Track.genre)
        .all()
    )
    return {str(row.genre).strip().lower() for row in genres if row.genre}


def _calculate_profile_bonus(u1: User | None, u2: User | None) -> float:
    if not (u1 and u2 and u1.profile and u2.profile):
        return 0.0
    bonus = 0.0
    fav_art1 = (u1.profile.favorite_artist or "").strip().lower()
    fav_art2 = (u2.profile.favorite_artist or "").strip().lower()
    if fav_art1 and fav_art2 and fav_art1 == fav_art2:
        bonus += 0.1

    fav_gen1 = (u1.profile.favorite_genre or "").strip().lower()
    fav_gen2 = (u2.profile.favorite_genre or "").strip().lower()
    if fav_gen1 and fav_gen2 and fav_gen1 == fav_gen2:
        bonus += 0.05
    return bonus


def _get_tier(final_score: int) -> str:
    if final_score >= 85:
        return "Космическая связь"
    if final_score >= 65:
        return "Высокая совместимость"
    if final_score >= 40:
        return "Умеренная совместимость"
    if final_score >= 15:
        return "Низкая совместимость"
    return "Разные галактики"


def calculate_compatibility(user1_id: int, user2_id: int, db: Session) -> dict[str, Any]:
    """Calculate musical compatibility score (0-100%) and common interests between two users."""
    if user1_id == user2_id:
        return {
            "score": 100,
            "tier": "Идеальное совпадение (Self)",
            "common_artists": [],
            "common_genres": [],
            "summary": "Вы слушаете точно такую же музыку!",
        }

    u1_artist_map = _get_artist_map(user1_id, db)
    u2_artist_map = _get_artist_map(user2_id, db)
    common_artists_names = set(u1_artist_map) & set(u2_artist_map)
    artist_sim = _calculate_artist_similarity(u1_artist_map, u2_artist_map, common_artists_names)

    g1_set = _get_genre_set(user1_id, db)
    g2_set = _get_genre_set(user2_id, db)
    common_genre_set = g1_set & g2_set
    common_genres = sorted(common_genre_set)

    genre_sim = 0.0
    if g1_set or g2_set:
        genre_sim = len(common_genre_set) / len(g1_set | g2_set)

    u1 = db.query(User).filter(User.id == user1_id).first()
    u2 = db.query(User).filter(User.id == user2_id).first()
    bonus = _calculate_profile_bonus(u1, u2)

    raw_score = (artist_sim * 0.65) + (genre_sim * 0.25) + bonus
    final_score = min(100, max(0, int(round(raw_score * 100))))
    tier = _get_tier(final_score)

    common_artist_list: list[dict[str, Any]] = [
        {
            "artist": a,
            "user1_plays": u1_artist_map[a],
            "user2_plays": u2_artist_map[a],
            "total_plays": u1_artist_map[a] + u2_artist_map[a],
        }
        for a in common_artists_names
    ]
    common_artist_list.sort(key=lambda x: cast(int, x["total_plays"]), reverse=True)

    return {
        "score": final_score,
        "tier": tier,
        "common_artists": common_artist_list[:10],
        "common_genres": common_genres[:10],
    }
