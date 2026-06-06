import os
import sys
import pytest
from fastapi.testclient import TestClient

# Setup system path to import app correctly
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.append(project_root)

TEST_DB_FILE = os.path.join(project_root, "test_temp.db")
TEST_DB_URL = f"sqlite:///{TEST_DB_FILE}"

# Force env vars for testing before importing database module
os.environ["DATABASE_URL"] = TEST_DB_URL
os.environ["REDIS_URL"] = "redis://mock_redis_disabled"

from app.database import Base, get_db, engine, SessionLocal
from app.main import app
from app.models import Achievement, User, UserProfile, UserIntegration

@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    # Remove old test db if exists
    if os.path.exists(TEST_DB_FILE):
        try:
            os.remove(TEST_DB_FILE)
        except Exception:
            pass
            
    # Create all tables
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

@pytest.fixture(scope="function")
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

@pytest.fixture(scope="function")
def client(db):
    # Always start with clean overrides
    app.dependency_overrides.clear()
    with TestClient(app) as test_client:
        yield test_client
    # Always clear overrides after the test
    app.dependency_overrides.clear()
