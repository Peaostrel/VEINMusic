"""Smart Recommendations Engine based on Genre Embeddings, Collaborative Filtering & Taste Matching."""
from __future__ import annotations

from typing import Any
from datetime import UTC, datetime, timedelta

from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from app.models import RecommendationFeedback, RecommendationImpression, Scrobble, Track, User, UserProfile
from app.services.user_preferences import preferences_dict


def _get_user_top_artists_and_genres(user_id: int, db: Session) -> tuple[dict[str, int], list[str]]:
    """Return top artists with play counts and distinct genres for a user."""
    # Aggregate listen counts before joining the catalog: a 500k-listen
    # account should join hundreds of distinct tracks, not every listen.
    own_tracks = db.query(Scrobble.track_id.label("track_id"), func.count(Scrobble.id).label("plays")).filter(
        Scrobble.user_id == user_id).group_by(Scrobble.track_id).subquery()
    artist_rows = db.query(Track.artist, func.sum(own_tracks.c.plays).label("plays")).join(
        own_tracks, own_tracks.c.track_id == Track.id).filter(Track.artist.isnot(None)).group_by(
        Track.artist).order_by(func.sum(own_tracks.c.plays).desc()).limit(20).all()
    artist_map = {str(row.artist): int(row[1]) for row in artist_rows if row.artist}
    genre_rows = db.query(Track.genre).join(own_tracks, own_tracks.c.track_id == Track.id).filter(
        Track.genre.isnot(None)).distinct().limit(10).all()
    genres = [str(r[0]) for r in genre_rows if r[0]]
    return artist_map, genres


def _collect_genre_recommendations(
    user_genres: list[str],
    user_scrobbled_track_ids: Any,
    seen_keys: set[tuple[str, str]],
    db: Session,
    public_listener_ids: list[int],
    liked_artists: set[str],
) -> list[dict[str, Any]]:
    """Find candidate tracks matching favorite genres or explicitly liked artists."""
    if not user_genres and not liked_artists:
        return []

    genre_query = (
        db.query(Track, func.count(Scrobble.id).label("global_plays"))
        .join(Scrobble, Scrobble.track_id == Track.id)
        .filter(Scrobble.user_id.in_(public_listener_ids),
                or_(Track.genre.in_(user_genres), Track.artist.in_(liked_artists)))
    )
    genre_query = genre_query.filter(Track.id.notin_(user_scrobbled_track_ids))

    genre_candidates = (
        genre_query.group_by(Track.id)
        .order_by(case((Track.artist.in_(liked_artists), 1), else_=0).desc(), func.count(Scrobble.id).desc())
        .limit(100)
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
    user_scrobbled_track_ids: Any,
    seen_keys: set[tuple[str, str]],
    db: Session,
    public_listener_ids: list[int],
) -> list[dict[str, Any]]:
    """Find trending global tracks not yet explored by the user."""
    trending_query = (
        db.query(Track, func.count(Scrobble.id).label("recent_plays"))
        .join(Scrobble, Scrobble.track_id == Track.id)
        .filter(Scrobble.user_id.in_(public_listener_ids))
    )
    trending_query = trending_query.filter(Track.id.notin_(user_scrobbled_track_ids))

    candidates = (
        trending_query.group_by(Track.id)
        .order_by(func.count(Scrobble.id).desc())
        .limit(100)
        .all()
    )

    results: list[dict[str, Any]] = []
    for track, _ in candidates:
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


def generate_smart_recommendations(user: User, db: Session, limit: int = 15, use_feedback: bool = True, novelty: int = 50, avoid_recent: bool = False) -> dict[str, Any]:
    """Generate personalized recommendations for a user."""
    user_artists, user_genres = _get_user_top_artists_and_genres(int(user.id), db)
    signals = db.query(RecommendationFeedback, Track).join(Track, Track.id == RecommendationFeedback.track_id).filter(
        RecommendationFeedback.user_id == user.id).all() if use_feedback else []
    liked_genres = {track.genre for signal, track in signals if signal.value == "like" and track.genre}
    liked_artists = {track.artist for signal, track in signals if signal.value == "like" and track.artist}
    user_genres = list(dict.fromkeys(sorted(liked_genres) + user_genres))
    user_artist_names = {a.lower() for a in user_artists}

    # Keep large histories inside the database, rather than constructing a
    # potentially enormous Python set / SQL IN parameter list.
    user_scrobbled_track_ids = db.query(Scrobble.track_id).filter(Scrobble.user_id == user.id).distinct()
    if use_feedback:
        user_scrobbled_track_ids = user_scrobbled_track_ids.union(db.query(RecommendationFeedback.track_id).filter(
            RecommendationFeedback.user_id == user.id, RecommendationFeedback.value.in_(["known", "dislike"])))
    if use_feedback and avoid_recent:
        user_scrobbled_track_ids = user_scrobbled_track_ids.union(db.query(RecommendationImpression.track_id).filter(
            RecommendationImpression.user_id == user.id, RecommendationImpression.shown_at >= datetime.now(UTC) - timedelta(days=7)))
    seen_keys: set[tuple[str, str]] = set()

    public_listener_ids = [user_id for user_id in _public_listener_ids(db) if user_id != int(user.id)]
    genre_tracks = _collect_genre_recommendations(
        user_genres, user_scrobbled_track_ids, seen_keys, db, public_listener_ids, liked_artists
    )
    trending_tracks = _collect_trending_recommendations(
        user_artist_names, user_scrobbled_track_ids, seen_keys, db, public_listener_ids
    )

    candidates = genre_tracks + trending_tracks
    _apply_feedback_weights(candidates, liked_genres, liked_artists)

    def score(item):
        familiar = str(item["artist"]).lower() in user_artist_names
        preference = (50 - novelty) / 100 if familiar else (novelty - 50) / 100
        return -float(item["confidence_score"]) - preference

    all_recommended_tracks = []
    artist_counts: dict[str, int] = {}
    for item in sorted(candidates, key=lambda item: (score(item), int(item["id"]))):
        artist = str(item["artist"]).casefold()
        if artist_counts.get(artist, 0) >= 2:
            continue
        artist_counts[artist] = artist_counts.get(artist, 0) + 1
        all_recommended_tracks.append(item)
        if len(all_recommended_tracks) >= limit:
            break
    recommended_artists = _extract_recommended_artists(all_recommended_tracks, user_artist_names)

    return {
        "user": user.username,
        "novelty": novelty,
        "avoid_recent": avoid_recent,
        "artist_limit": 2,
        "recommendations": all_recommended_tracks,
        "recommended_artists": recommended_artists,
        "taste_profile": {
            "top_genres": user_genres[:5],
            "total_evaluated_artists": len(user_artists),
        },
    }


def _apply_feedback_weights(candidates, liked_genres, liked_artists):
    for candidate in candidates:
        if candidate["artist"] in liked_artists:
            candidate["reason"] = f"На основе вашего выбора: {candidate['artist']}"
            candidate["reason_type"] = "feedback_similarity"
            candidate["confidence_score"] = 0.96
        elif candidate["genre"] in liked_genres:
            candidate["reason"] = f"Больше музыки в жанре {candidate['genre']}, который вы отметили"
            candidate["reason_type"] = "feedback_similarity"
            candidate["confidence_score"] = 0.95


def _public_listener_ids(db):
    rows = db.query(User.id, UserProfile).join(UserProfile, UserProfile.user_id == User.id).filter(
        UserProfile.is_private.isnot(True), User.is_banned.isnot(True)).all()
    ids = []
    for user_id, profile in rows:
        privacy = preferences_dict(profile)["privacy"]
        if all(privacy.get(section, "all") == "all" for section in ("history", "statistics")):
            ids.append(int(user_id))
    return ids
