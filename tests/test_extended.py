import datetime
import pytest
from app.database import SessionLocal
from app.models import Scrobble, Track, User


@pytest.fixture
def auth_client(client):
    client.post(
        "/auth/register",
        json={
            "username": "extendeduser",
            "password": "password"})
    client.headers["Origin"] = "http://localhost:3000"
    return client


@pytest.fixture
def auth_user(db, auth_client):
    db.close()
    db = SessionLocal()
    return db.query(User).filter(User.username == "extendeduser").first()


def test_user_mood_empty(client, db, auth_user):
    resp = client.get(f"/api/user/mood?username={auth_user.username}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["mood"] == "Тишина"


def test_user_mood_rock(auth_client, db, auth_user):
    track = Track(
        title="Rock Song",
        artist="Rock Band",
        genre="rock",
        duration=150)
    db.add(track)
    db.commit()
    scrobble = Scrobble(
        user_id=auth_user.id,
        track_id=track.id,
        played_at=datetime.datetime.now(datetime.timezone.utc),
        listened_sec=150,
        source="yandex"
    )
    db.add(scrobble)
    db.commit()

    resp = auth_client.get(f"/api/user/mood?username={auth_user.username}")
    assert resp.status_code == 200
    assert resp.json()["mood"] == "Энергичный хайп"


def test_get_wrapped_stats(auth_client, db, auth_user):
    # Setup some scrobbles
    track = Track(title="Song 1", artist="Artist 1", duration=200)
    db.add(track)
    db.commit()
    scrobble = Scrobble(
        user_id=auth_user.id,
        track_id=track.id,
        played_at=datetime.datetime.now(datetime.timezone.utc),
        listened_sec=200,
        source="yandex"
    )
    db.add(scrobble)
    db.commit()

    resp = auth_client.get(f"/api/stats/wrapped?username={auth_user.username}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["top_artist"] == "Artist 1"
    assert data["total_minutes"] == 3


def test_get_detailed_stats(auth_client, db, auth_user):
    track = Track(title="Detailed", artist="DetailArtist", duration=120)
    db.add(track)
    db.commit()
    scrobble = Scrobble(
        user_id=auth_user.id,
        track_id=track.id,
        played_at=datetime.datetime.now(datetime.timezone.utc),
        listened_sec=120,
        source="yandex"
    )
    db.add(scrobble)
    db.commit()

    resp = auth_client.get(
        f"/api/detailed-stats/{auth_user.username}?period=all")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_scrobbles"] == 1
    assert data["unique_artists"] == 1
    assert data["unique_tracks"] == 1
    assert data["top_artists"][0]["name"] == "DetailArtist"


def test_top_albums_show_an_album_once(auth_client, db, auth_user):
    # Tracks of one album from Last.fm and the player: other covers, other case
    tracks = [Track(title="One", artist="Band", album="Spirit", duration=120, cover_url="https://img/a.jpg"),
              Track(title="Two", artist="Band", album="SPIRIT", duration=120, cover_url=""),
              Track(title="Three", artist="Band", album="Spirit", duration=120, cover_url="https://img/b.jpg")]
    db.add_all(tracks)
    db.flush()
    now = datetime.datetime.now(datetime.timezone.utc)
    db.add_all([Scrobble(user_id=auth_user.id, track_id=t.id, played_at=now, listened_sec=120, source=source)
                for t, source in zip(tracks, ("yandex", "transfer", "lastfm"))])
    db.commit()

    albums = auth_client.get(f"/api/detailed-stats/{auth_user.username}?period=all").json()["top_albums"]
    assert len(albums) == 1
    assert albums[0]["plays"] == 3
    assert albums[0]["album"] in ("Spirit", "SPIRIT")
    assert albums[0]["cover_url"]
    assert albums[0]["source"] == "yandex"  # the one with a link, not max() of the names


def test_calendar_and_custom_wrapped_use_local_days(auth_client, db, auth_user):
    year = datetime.datetime.now(datetime.timezone.utc).year
    first = Track(title="First", artist="Calendar Artist", duration=120)
    second = Track(title="Second", artist="New Artist", duration=180)
    db.add_all([first, second])
    db.flush()
    db.add_all([
        # Default profile timezone is UTC+3, so this belongs to January 2.
        Scrobble(user_id=auth_user.id, track_id=first.id,
                 played_at=datetime.datetime(year, 1, 1, 21, 30, tzinfo=datetime.timezone.utc),
                 listened_sec=120, source="yandex"),
        Scrobble(user_id=auth_user.id, track_id=first.id,
                 played_at=datetime.datetime(year, 1, 2, 10, 0, tzinfo=datetime.timezone.utc),
                 listened_sec=120, source="yandex"),
        Scrobble(user_id=auth_user.id, track_id=second.id,
                 played_at=datetime.datetime(year, 1, 3, 10, 0, tzinfo=datetime.timezone.utc),
                 listened_sec=180, source="spotify"),
    ])
    db.commit()

    calendar = auth_client.get(
        f"/api/stats/calendar/{auth_user.username}?year={year}")
    assert calendar.status_code == 200
    body = calendar.json()
    assert [day["date"] for day in body["days"]] == [
        f"{year}-01-02", f"{year}-01-03"]
    assert body["days"][0]["scrobbles"] == 2
    assert body["days"][0]["top_track"]["title"] == "First"
    assert body["summary"]["active_days"] == 2
    assert body["summary"]["longest_streak"] == 2

    query = f"period=custom&date_from={year}-01-02&date_to={year}-01-03"
    detailed = auth_client.get(
        f"/api/detailed-stats/{auth_user.username}?{query}")
    assert detailed.status_code == 200
    stats = detailed.json()
    assert stats["total_scrobbles"] == 3
    assert stats["new_artists"] == 2
    assert stats["peak_day"] == {
        "date": f"{year}-01-02", "scrobbles": 2}
    # Growth from an empty previous period is new activity, not a meaningful
    # percentage increase.
    assert stats["comparison"]["change"]["scrobbles"] is None

    wrapped = auth_client.get(
        f"/api/stats/wrapped?username={auth_user.username}&{query}")
    assert wrapped.status_code == 200
    assert wrapped.json()["total_scrobbles"] == 3


@pytest.mark.parametrize("endpoint", ["detailed", "wrapped"])
@pytest.mark.parametrize("query, detail", [
    ("period=unknown", "Неизвестный период"),
    ("period=custom", "Укажите начало и конец периода"),
    ("period=custom&date_from=bad-date&date_to=2026-01-01", "Дата должна быть в формате YYYY-MM-DD"),
    ("period=custom&date_from=2026-02-02&date_to=2026-01-01", "Начало периода не может быть позже конца"),
    ("period=custom&date_from=2025-01-01&date_to=2026-02-01", "Период не может быть длиннее 366 дней"),
])
def test_stats_reject_invalid_periods(auth_client, auth_user, endpoint, query, detail):
    if endpoint == "wrapped":
        url = f"/api/stats/wrapped?username={auth_user.username}&{query}"
    else:
        url = f"/api/detailed-stats/{auth_user.username}?{query}"
    response = auth_client.get(url)
    assert response.status_code == 422
    assert response.json() == {"detail": detail}


@pytest.mark.parametrize("path", [
    "/api/stats/wrapped",
    "/api/detailed-stats/{username}",
    "/api/stats/calendar/{username}",
])
def test_stats_openapi_documents_invalid_input(client, path):
    schema = client.get("/openapi.json").json()
    response = schema["paths"][path]["get"]["responses"]["422"]
    assert response["description"]
