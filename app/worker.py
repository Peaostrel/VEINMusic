import os
import asyncio
from arq.connections import RedisSettings

from app.database import SessionLocal
from app.models import User
from app.routers.extended import check_auto_achievements

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")


def _sync_check_achievements(user_id: int):
    db = SessionLocal()
    try:
        # Run synchronous DB query and achievements checker
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            check_auto_achievements(user, db)
    except Exception as e:
        print(f"Error checking achievements for user {user_id}: {e}")
    finally:
        db.close()


async def check_achievements(ctx, user_id: int):
    """arq background job to check and award auto-achievements for a user."""
    # Execute synchronous database operations in a separate thread pool to
    # prevent blocking the worker event loop
    await asyncio.to_thread(_sync_check_achievements, user_id)


async def startup(ctx):
    await asyncio.sleep(0)
    print("arq worker starting up...")


async def shutdown(ctx):
    await asyncio.sleep(0)
    print("arq worker shutting down...")


class WorkerSettings:
    functions = [check_achievements]
    redis_settings = RedisSettings.from_dsn(REDIS_URL)
    on_startup = startup
    on_shutdown = shutdown
