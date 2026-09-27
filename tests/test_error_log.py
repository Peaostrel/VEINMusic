import asyncio
import logging

from app.services import error_log


def _record(msg, level=logging.WARNING, name="app.services.x", exc=None):
    return logging.LogRecord(name, level, __file__, 1, msg, None, exc)


def test_entry_redacts_credentials_and_keeps_trace():
    try:
        raise ValueError("boom api_key=SECRET123")
    except ValueError:
        import sys
        exc = sys.exc_info()
    entry = error_log.make_entry(_record(
        "GET https://ws.audioscrobbler.com/?api_key=abc123&format=json failed; "
        "Authorization: OAuth y0_AgAAAAAtokenvalue", logging.ERROR, exc=exc), "worker")
    assert "abc123" not in entry["message"]
    assert "api_key=***" in entry["message"]
    assert "y0_AgAAAAAtokenvalue" not in entry["message"]
    assert "OAuth ***" in entry["message"]
    assert "ValueError" in entry["trace"]
    assert "SECRET123" not in entry["trace"]
    assert entry["level"] == "ERROR"
    assert entry["source"] == "worker"


def test_handler_keeps_warnings_and_list_filters():
    error_log._local.clear()
    handler = error_log.ErrorLogHandler("api")
    handler.emit(_record("ynison failed for user 7"))
    handler.emit(_record("db down", logging.ERROR, name="app.database"))
    handler.emit(_record("loop", name="redis.connection"))  # ignored: would loop
    # Redis is disabled in tests: entries come from this process
    page = asyncio.run(error_log.list_entries())
    assert page["shared"] is False
    assert [e["message"] for e in page["items"]] == ["db down", "ynison failed for user 7"]
    assert page["counts"]["ERROR"] == 1
    assert asyncio.run(error_log.list_entries(level="WARNING"))["total"] == 1
    assert asyncio.run(error_log.list_entries(q="YNISON"))["items"][0]["message"] == "ynison failed for user 7"
    assert asyncio.run(error_log.list_entries(source="worker"))["total"] == 0
    asyncio.run(error_log.clear())
    assert asyncio.run(error_log.list_entries())["total"] == 0


def test_install_once():
    root = logging.getLogger()
    before = [h for h in root.handlers if isinstance(h, error_log.ErrorLogHandler)]
    error_log.install("api")
    error_log.install("api")
    after = [h for h in root.handlers if isinstance(h, error_log.ErrorLogHandler)]
    assert len(after) == max(len(before), 1)
