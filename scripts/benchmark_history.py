"""Reproducible isolated SQLite benchmark; never connects to the service DB.

Run: python scripts/benchmark_history.py --sizes 100000 500000
The temporary fixture is deleted when the benchmark exits.
"""
import argparse
import json
import resource
import secrets
import statistics
import sys
import tempfile
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import create_engine, func, text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402
from app.database import Base  # noqa: E402
from app.models import Scrobble, Track, User, UserProfile  # noqa: E402
from app.routers.history_tools import history_page  # noqa: E402
from app.services.recommendations import generate_smart_recommendations  # noqa: E402


def measure(call):
    times = []
    for _ in range(5):
        start = time.perf_counter()
        call()
        times.append((time.perf_counter() - start) * 1000)
    return {"median_ms": round(statistics.median(times), 2), "max_ms": round(max(times), 2)}


def run(size, path):
    engine = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(engine)
    end = datetime.now(UTC)
    with Session(engine) as db:
        user = User(username="benchmark", hashed_password=secrets.token_hex(32), profile=UserProfile())
        db.add(user); db.flush()
        db.execute(Track.__table__.insert(), [{"id": i, "title": f"Track {i}", "artist": f"Artist {i % 100}", "genre": "Rock", "duration": 180} for i in range(1, 501)])
        for offset in range(0, size, 10000):
            db.execute(Scrobble.__table__.insert(), [{"user_id": user.id, "track_id": (i % 500) + 1, "source": "benchmark", "is_playing": False,
                "played_at": end - timedelta(seconds=size - i), "updated_at": end - timedelta(seconds=size - i), "listened_sec": 180}
                for i in range(offset, min(size, offset + 10000))])
        db.commit()
        cursor = f"{(end - timedelta(seconds=size // 2)).isoformat()}|{size // 2}"
        period = db.query(Track.artist, func.count(Scrobble.id)).join(Scrobble).filter(Scrobble.user_id == user.id,
            Scrobble.played_at >= end - timedelta(days=7)).group_by(Track.artist)
        result = {"rows": size, "history_page": measure(lambda: history_page(db, user, limit=50)),
                  "deep_cursor": measure(lambda: history_page(db, user, limit=50, cursor=cursor)),
                  "search": measure(lambda: history_page(db, user, q="Track 1", limit=50)),
                  "search_no_match": measure(lambda: history_page(db, user, q="missing", limit=50)),
                  "period_artist_chart": measure(lambda: period.all()),
                  "recommendations": measure(lambda: generate_smart_recommendations(user, db)),
                  "max_process_rss_mb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1),
                  "history_plan": [row[-1] for row in db.execute(text("EXPLAIN QUERY PLAN SELECT id FROM scrobbles WHERE user_id=:uid AND played_at<:cutoff ORDER BY played_at DESC,id DESC LIMIT 51"), {"uid": user.id, "cutoff": end.isoformat()})]}
    engine.dispose()
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sizes", type=int, nargs="+", default=[100000, 500000])
    args = parser.parse_args()
    if any(size < 1 or size > 1000000 for size in args.sizes):
        parser.error("Sizes must be between 1 and 1000000")
    with tempfile.TemporaryDirectory(prefix="vein-history-bench-") as folder:
        print(json.dumps({"database": "isolated SQLite", "iterations": 5,
                          "results": [run(size, Path(folder) / f"{size}.db") for size in args.sizes]}, indent=2))
