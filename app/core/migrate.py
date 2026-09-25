"""Apply Alembic migrations, adopting databases created by create_all().

Older deployments created tables with ``Base.metadata.create_all()`` and never
recorded an Alembic revision. Running ``alembic upgrade head`` on such a
database would try to create existing tables, so those databases are first
stamped at the last revision whose schema create_all() always produced, and
then upgraded (the later migrations are idempotent).

Usage: ``python -m app.core.migrate``
"""
from __future__ import annotations

import logging
import os

from sqlalchemy import inspect

from alembic import command
from alembic.config import Config
from app.database import engine

logger = logging.getLogger(__name__)

# Last revision before the idempotent migrations
ADOPT_REVISION = "b2c3d4e5f6g7"


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    cfg = Config(os.path.join(base_dir, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(base_dir, "alembic"))

    tables = set(inspect(engine).get_table_names())
    if "alembic_version" not in tables and "users" in tables:
        logger.info("Existing schema without Alembic history found; stamping %s", ADOPT_REVISION)
        command.stamp(cfg, ADOPT_REVISION)

    command.upgrade(cfg, "head")


if __name__ == "__main__":
    main()
