import os
from typing import Any

from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker, with_loader_criteria

load_dotenv()

SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost/veinmusic")


@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


# Allow SQLite as a fallback for development if explicitly requested
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, connect_args={
            "check_same_thread": False})
else:
    engine = create_engine(SQLALCHEMY_DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base: Any = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@event.listens_for(Session, "do_orm_execute")
def exclude_hidden_listens(execute_state):
    """Exclude accidental plays consistently from ORM history/statistics.

    Owner maintenance opts in with include_excluded=True. Raw SQL aggregations
    must explicitly apply the same predicate (see services/taste.py).
    """
    if execute_state.is_select and not execute_state.execution_options.get("include_deleted", False):
        from app.models import Scrobble
        execute_state.statement = execute_state.statement.options(
            with_loader_criteria(Scrobble, Scrobble.deleted_at.is_(None), include_aliases=True)
        )
    if execute_state.is_select and not execute_state.execution_options.get("include_excluded", False):
        from app.models import Scrobble
        execute_state.statement = execute_state.statement.options(
            with_loader_criteria(Scrobble, Scrobble.excluded_from_stats.is_(False), include_aliases=True)
        )
