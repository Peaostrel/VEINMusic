"""PostgreSQL / TimescaleDB Time-Series Partitioning Helper for Scrobbles Table."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.engine import Engine


def generate_partition_ddl(year: int, month: int) -> tuple[str, str, str]:
    """Generate table name and boundary dates for monthly range partitions."""
    start_date = datetime(year, month, 1, tzinfo=UTC)
    if month == 12:
        end_date = datetime(year + 1, 1, 1, tzinfo=UTC)
    else:
        end_date = datetime(year, month + 1, 1, tzinfo=UTC)

    table_name = f"scrobbles_{year}_{month:02d}"
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")
    return table_name, start_str, end_str


def ensure_monthly_partitions(engine: Engine, months_ahead: int = 3) -> list[str]:
    """Check dialect and ensure monthly range partitions exist on PostgreSQL."""
    if engine.dialect.name != "postgresql":
        return ["sqlite_or_other_dialect_no_partitioning_needed"]

    created_partitions: list[str] = []
    now = datetime.now(UTC)

    with engine.connect() as conn:
        for offset in range(-1, months_ahead + 1):
            target_date = now + timedelta(days=offset * 30)
            table_name, start_str, end_str = generate_partition_ddl(target_date.year, target_date.month)

            sql = f"""
            CREATE TABLE IF NOT EXISTS {table_name} PARTITION OF scrobbles
            FOR VALUES FROM ('{start_str}') TO ('{end_str}');
            """
            try:
                conn.execute(text(sql))
                conn.commit()
                created_partitions.append(table_name)
            except Exception as e:
                # If scrobbles table is not partitioned, ignore gracefully
                print(f"[Partitioning] Notice: {e}")
                break

    return created_partitions


def check_timescaledb_extension(engine: Engine) -> bool:
    """Check if TimescaleDB extension is installed and available in PostgreSQL."""
    if engine.dialect.name != "postgresql":
        return False

    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT extname FROM pg_extension WHERE extname = 'timescaledb';")).scalar()
            return result == "timescaledb"
    except Exception:
        return False
