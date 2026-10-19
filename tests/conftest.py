import asyncio
import os
import sys
import pytest
import httpx

# Setup system path to import app correctly
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.append(project_root)

# Each pytest-xdist worker ("gw0", "gw1", ...) gets its own database, so
# `pytest -n auto` works; a plain run uses the "main" one
WORKER = os.getenv("PYTEST_XDIST_WORKER", "main")
TEST_DB_FILE = os.path.join(project_root, f"test_temp_{WORKER}.db")


def _worker_postgres_url(url: str) -> str:
    """Give the worker its own PostgreSQL database next to the configured one."""
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import make_url
    from sqlalchemy.exc import OperationalError, ProgrammingError

    base = make_url(url)
    if WORKER == "main":
        return url
    worker_url = base.set(database=f"{base.database}_{WORKER}")
    # A pre-created worker database is used as is; otherwise the test role
    # needs CREATEDB to make one
    probe = create_engine(worker_url)
    try:
        with probe.connect():
            return worker_url.render_as_string(hide_password=False)
    except OperationalError:
        pass
    finally:
        probe.dispose()
    admin = create_engine(base, isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as conn:
            conn.execute(text(f'CREATE DATABASE "{worker_url.database}"'))
    except ProgrammingError as exc:
        raise RuntimeError(
            f"Can't create {worker_url.database} for xdist worker {WORKER}: grant the test role "
            f"CREATEDB or create the databases {base.database}_gw0, _gw1, ... beforehand") from exc
    finally:
        admin.dispose()
    return worker_url.render_as_string(hide_password=False)


# CI also runs the suite against PostgreSQL by setting TEST_DATABASE_URL
if os.getenv("TEST_DATABASE_URL"):
    TEST_DB_URL = _worker_postgres_url(os.environ["TEST_DATABASE_URL"])
else:
    TEST_DB_URL = f"sqlite:///{TEST_DB_FILE}"

# Force env vars for testing before importing database module
os.environ["DATABASE_URL"] = TEST_DB_URL
os.environ["REDIS_URL"] = "redis://mock_redis_disabled"
# No background cloud polling (as in Docker, where the worker runs it): it
# would race the tests, e.g. cache the feature flags before a test adds one
os.environ["RUN_CLOUD_POLLING"] = "0"

from app.models import (  # noqa: E402, F401
    Achievement,
    AvatarFrame,
    FeatureFlag,
    Follow,
    Scrobble,
    ScrobbleComment,
    ScrobbleLike,
    SystemAnnouncement,
    Track,
    TrackAlias,
    User,
    UserAchievement,
    UserIntegration,
    UserProfile,
)
from app.main import app  # noqa: E402
from app.database import Base, get_db, engine, SessionLocal  # noqa: E402, F401
from fastapi.testclient import TestClient  # noqa: E402
from app.core.rate_limit import limiter  # noqa: E402
limiter.enabled = False


@pytest.fixture(autouse=True)
def isolated_provider_http(monkeypatch):
    """Unmocked provider/metadata requests must never leave the test process.

    Explicit MockTransport fixtures retain their responses. Background
    enrichment now applies to every source, so it also needs this boundary.
    """
    original = httpx.AsyncClient

    class IsolatedTransport(httpx.AsyncBaseTransport):
        def __init__(self):
            self.local = httpx.AsyncHTTPTransport()

        async def handle_async_request(self, request):
            if request.url.host not in {"localhost", "127.0.0.1", "::1"}:
                raise httpx.ConnectError("External HTTP is disabled in tests; use MockTransport", request=request)
            return await self.local.handle_async_request(request)

        async def aclose(self):
            await self.local.aclose()

    class IsolatedClient(original):
        def __init__(self, *args, **kwargs):
            if "transport" not in kwargs:
                kwargs["transport"] = IsolatedTransport()
            super().__init__(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", IsolatedClient)


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    # Remove old test db if exists
    if os.path.exists(TEST_DB_FILE):
        try:
            os.remove(TEST_DB_FILE)
        except Exception:
            pass

    # Start from an empty schema (a PostgreSQL test database is reused)
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    # Seed default achievements
    db = SessionLocal()
    sample_achievements = [
        {
            "name": "Первые шаги",
            "description": "Сделайте свой первый скроббл",
            "icon": "🎵",
            "rule_type": "total_scrobbles",
            "rule_value": 1,
            "reward_xp": 10
        },
        {
            "name": "Ночная сова",
            "description": "Прослушайте 5 треков ночью (с 00:00 до 06:00)",
            "icon": "🦉",
            "rule_type": "night_scrobbles",
            "rule_value": 5,
            "reward_xp": 20
        },
        {
            "name": "Король рока",
            "description": "Прослушайте 10 треков группы Король и Шут",
            "icon": "👑",
            "rule_type": "specific_artist",
            "rule_target": "Король и Шут",
            "rule_value": 10,
            "reward_xp": 50
        }
    ]
    for ach_data in sample_achievements:
        db_ach = Achievement(**ach_data)
        db.add(db_ach)
    db.commit()
    db.close()

    yield

    # Clean up at the end of session
    if os.path.exists(TEST_DB_FILE):
        try:
            os.remove(TEST_DB_FILE)
        except Exception:
            pass


@pytest.fixture
def db():
    # Provide session for testing
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        # Clean up database data after each test to ensure isolation
        db_cleanup = SessionLocal()
        for table in reversed(Base.metadata.sorted_tables):
            if table.name != "achievements":
                db_cleanup.execute(table.delete())
        db_cleanup.commit()
        db_cleanup.close()
        from app.services import cache, runtime_settings
        runtime_settings.invalidate()
        cache.CACHE.clear()


async def _drain_background_tasks():
    from app.core import redis
    # A job may start another one, so wait until none are left or time is up
    loop = asyncio.get_running_loop()
    deadline = loop.time() + 30
    while redis._BACKGROUND_TASKS and loop.time() < deadline:
        await asyncio.wait(set(redis._BACKGROUND_TASKS), timeout=deadline - loop.time())


@pytest.fixture
def client(db):
    # Always start with clean overrides
    app.dependency_overrides.clear()
    # API-key cache and wrong-key counters are per process: start clean
    from app.core import flood_guard, key_guard
    key_guard.reset()
    flood_guard.reset()
    from app.services import ip_blocks, security_events
    ip_blocks.reset()
    security_events.reset()
    with TestClient(app) as test_client:
        yield test_client
        # Jobs a request started in-process (Redis is off in tests) must finish
        # before the tables are wiped, or they write into the next test
        test_client.portal.call(_drain_background_tasks)
    # Always clear overrides after the test
    app.dependency_overrides.clear()
