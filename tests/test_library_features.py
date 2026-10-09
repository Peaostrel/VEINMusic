"""Unified music search and self-service library maintenance."""

from datetime import UTC, datetime

from app.models import Scrobble, Track, TrackAlias, User, UserIntegration, UserProfile


def _register(client, username: str) -> User:
    response = client.post(
        "/auth/register",
        json={"username": username, "password": "library-test-password"},
    )
    assert response.status_code == 200, response.text
    from app.database import SessionLocal

    with SessionLocal() as session:
        user = session.query(User).filter_by(username=username).first()
        assert user is not None
        session.expunge(user)
        return user


def test_public_search_does_not_count_private_listening(client, db):
    public_user = _register(client, "public_listener")
    private_user = User(username="private_listener", hashed_password="x")
    private_user.profile = UserProfile(is_private=True)
    private_user.integration = UserIntegration()
    track = Track(title="Privacy Song", artist="Privacy Artist", duration=180)
    private_track = Track(
        title="Private Only Song", artist="Hidden Artist", duration=180
    )
    db.add_all([private_user, track, private_track])
    db.flush()
    db.add_all(
        [
            Scrobble(
                user_id=public_user.id,
                track_id=track.id,
                played_at=datetime.now(UTC),
                listened_sec=180,
                source="yandex",
            ),
            Scrobble(
                user_id=private_user.id,
                track_id=track.id,
                played_at=datetime.now(UTC),
                listened_sec=180,
                source="spotify",
            ),
            Scrobble(
                user_id=private_user.id,
                track_id=private_track.id,
                played_at=datetime.now(UTC),
                listened_sec=180,
                source="spotify",
            ),
        ]
    )
    db.commit()

    search = client.get("/api/search?q=Privacy").json()
    assert search["tracks"][0]["plays"] == 1
    assert search["artists"][0]["plays"] == 1
    assert all(user["username"] != "private_listener" for user in search["users"])

    detail = client.get(f"/api/music/track/{track.id}").json()
    assert detail["plays"] == 1
    assert detail["source_counts"] == {"yandex": 1}
    assert client.get("/api/search?q=Private%20Only").json()["tracks"] == []
    assert client.get(f"/api/music/track/{private_track.id}").status_code == 404


def test_user_can_merge_only_their_own_duplicate_tracks(client, db):
    user = _register(client, "library_owner")
    source = Track(title="Example (Remastered)", artist="The Band", duration=180)
    target = Track(title="Example", artist="The Band", duration=180)
    db.add_all([source, target])
    db.flush()
    db.add_all(
        [
            Scrobble(
                user_id=user.id,
                track_id=source.id,
                played_at=datetime.now(UTC),
                listened_sec=180,
                source="spotify",
            ),
            Scrobble(
                user_id=user.id,
                track_id=target.id,
                played_at=datetime.now(UTC),
                listened_sec=180,
                source="yandex",
            ),
        ]
    )
    db.commit()

    duplicates = client.get("/api/me/scrobbles/duplicates")
    assert duplicates.status_code == 200
    assert duplicates.json()["total"] == 1

    response = client.post(
        "/api/me/scrobbles/merge",
        json={"source_track_id": source.id, "target_track_id": target.id},
        headers={"Origin": "http://localhost:3000"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["reassigned_scrobbles"] == 1
    assert (
        db.query(Scrobble)
        .filter(Scrobble.user_id == user.id, Scrobble.track_id == target.id)
        .count()
        == 2
    )
    alias = db.query(TrackAlias).filter_by(user_id=user.id).one()
    assert alias.canonical_track_id == target.id

