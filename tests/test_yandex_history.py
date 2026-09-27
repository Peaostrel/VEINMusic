from app.services.yandex_history import HistoryTrack, parse_history


def _track(track_id, album_id, title, artist):
    return {"type": "track", "data": {
        "itemId": {"trackId": track_id, "albumId": album_id},
        "fullModel": {"title": title, "artists": [{"name": artist}]},
    }}


def test_parse_history_flattens_groups_in_order():
    result = {"historyTabs": [
        {"date": "2026-09-27", "items": [
            {"context": {"type": "album", "data": {"itemId": {"id": "1"}}},
             "tracks": [_track("10", "1", "Лесник", "Король и Шут"),
                        _track(11, 1, "Кукла колдуна", "Король и Шут")]},
            {"context": {"type": "wave", "data": {"itemId": {"seeds": ["user:onyourwave"]}}},
             "tracks": [_track("20", "2", "Группа крови", "Кино"),
                        {"type": "track", "data": {"itemId": {}}}]},
        ]},
        {"date": "2026-09-26", "items": []},
    ]}
    days = parse_history(result)
    assert [d for d, _ in days] == ["2026-09-27", "2026-09-26"]
    assert days[0][1] == [
        HistoryTrack("10", "1", "Лесник", "Король и Шут"),
        HistoryTrack("11", "1", "Кукла колдуна", "Король и Шут"),
        HistoryTrack("20", "2", "Группа крови", "Кино"),
    ]
    assert days[1][1] == []


def test_parse_history_tolerates_empty_result():
    assert parse_history({}) == []
    assert parse_history({"historyTabs": [{"items": [{"tracks": None}]}]}) == [("", [])]
