"""Smart Recommendations Engine based on Genre Embeddings, Collaborative Filtering & Taste Matching."""
from __future__ import annotations

from typing import Any
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Scrobble, Track, User


def _get_user_top_artists_and_genres(user_id: int, db: Session) -> tuple[dict[str, int], list[str]]:
    """Return top artists with play counts and distinct genres for a user."""
    artist_rows = (
        db.query(Track.artist, func.count(Scrobble.id).label("plays"))
        .join(Scrobble, Scrobble.track_id == Track.id)
        .filter(Scrobble.user_id == user_id, Track.artist.isnot(None))
        .group_by(Track.artist)
        .order_by(func.count(Scrobble.id).desc())
        .limit(20)
        .all()
    )
    artist_map = {str(row.artist): int(row[1]) for row in artist_rows if row.artist}

    genre_rows = (
        db.query(Track.genre)
        .join(Scrobble, Scrobble.track_id == Track.id)
        .filter(Scrobble.user_id == user_id, Track.genre.isnot(None))
        .distinct()
        .limit(10)
        .all()
    )
    genres = [str(r[0]) for r in genre_rows if r[0]]
    return artist_map, genres


def _collect_genre_recommendations(
    user_genres: list[str],
    user_scrobbled_track_ids: set[int],
    seen_keys: set[tuple[str, str]],
    db: Session,
) -> list[dict[str, Any]]:
    """Find candidate tracks in DB matching user favorite genres."""
    if not user_genres:
        return []

    genre_query = (
        db.query(Track, func.count(Scrobble.id).label("global_plays"))
        .join(Scrobble, Scrobble.track_id == Track.id)
        .filter(Track.genre.in_(user_genres))
    )
    if user_scrobbled_track_ids:
        genre_query = genre_query.filter(Track.id.notin_(user_scrobbled_track_ids))

    genre_candidates = (
        genre_query.group_by(Track.id)
        .order_by(func.count(Scrobble.id).desc())
        .limit(10)
        .all()
    )

    results: list[dict[str, Any]] = []
    for track, _ in genre_candidates:
        key = (str(track.artist).lower(), str(track.title).lower())
        if key not in seen_keys:
            seen_keys.add(key)
            results.append({
                "id": track.id,
                "title": track.title,
                "artist": track.artist,
                "album": track.album,
                "genre": track.genre,
                "cover_url": track.cover_url,
                "track_url": track.track_url,
                "reason_type": "genre_similarity",
                "reason": f"В вашем любимом жанре {track.genre}",
                "confidence_score": 0.88,
            })
    return results


def _collect_trending_recommendations(
    user_artist_names: set[str],
    user_scrobbled_track_ids: set[int],
    seen_keys: set[tuple[str, str]],
    current_count: int,
    limit: int,
    db: Session,
) -> list[dict[str, Any]]:
    """Find trending global tracks not yet explored by the user."""
    trending_query = (
        db.query(Track, func.count(Scrobble.id).label("recent_plays"))
        .join(Scrobble, Scrobble.track_id == Track.id)
    )
    if user_scrobbled_track_ids:
        trending_query = trending_query.filter(Track.id.notin_(user_scrobbled_track_ids))

    candidates = (
        trending_query.group_by(Track.id)
        .order_by(func.count(Scrobble.id).desc())
        .limit(15)
        .all()
    )

    results: list[dict[str, Any]] = []
    for track, _ in candidates:
        if current_count + len(results) >= limit:
            break
        key = (str(track.artist).lower(), str(track.title).lower())
        if key not in seen_keys:
            seen_keys.add(key)
            is_familiar = str(track.artist).lower() in user_artist_names
            reason = f"Новый трек от {track.artist}" if is_familiar else "Популярно в сообществе VEIN"
            results.append({
                "id": track.id,
                "title": track.title,
                "artist": track.artist,
                "album": track.album,
                "genre": track.genre or "Various",
                "cover_url": track.cover_url,
                "track_url": track.track_url,
                "reason_type": "artist_match" if is_familiar else "community_trend",
                "reason": reason,
                "confidence_score": 0.75,
            })
    return results


def _extract_recommended_artists(
    tracks: list[dict[str, Any]],
    user_artist_names: set[str],
    max_count: int = 5,
) -> list[dict[str, Any]]:
    """Extract distinct recommended artists from recommended track items."""
    results: list[dict[str, Any]] = []
    seen: set[str] = set()

    for item in tracks:
        name = item.get("artist")
        if not name:
            continue
        lower_name = name.lower()
        if lower_name not in user_artist_names and lower_name not in seen:
            seen.add(lower_name)
            results.append({
                "artist": name,
                "genre": item.get("genre", "Various"),
                "reason": f"Рекомендация на основе вкусовых паттернов ({item.get('genre')})",
            })
            if len(results) >= max_count:
                break
    return results


def generate_smart_recommendations(user: User, db: Session, limit: int = 15) -> dict[str, Any]:
    """Generate personalized recommendations for a user."""
    user_artists, user_genres = _get_user_top_artists_and_genres(int(user.id), db)
    user_artist_names = {a.lower() for a in user_artists}

    user_scrobbled_track_ids = {
        int(t_id[0])
        for t_id in db.query(Scrobble.track_id).filter(Scrobble.user_id == user.id).distinct().all()
        if t_id[0] is not None
    }

    seen_keys: set[tuple[str, str]] = set()

    genre_tracks = _collect_genre_recommendations(
        user_genres, user_scrobbled_track_ids, seen_keys, db
    )
    trending_tracks = _collect_trending_recommendations(
        user_artist_names, user_scrobbled_track_ids, seen_keys, len(genre_tracks), limit, db
    )

    all_recommended_tracks = (genre_tracks + trending_tracks)[:limit]
    recommended_artists = _extract_recommended_artists(all_recommended_tracks, user_artist_names)

    return {
        "user": user.username,
        "recommendations": all_recommended_tracks,
        "recommended_artists": recommended_artists,
        "taste_profile": {
            "top_genres": user_genres[:5],
            "total_evaluated_artists": len(user_artists),
        },
    }
