"""Count imported Last.fm plays again after their track got a real duration

An imported play was stored with the track's duration at import time (often
the 180 s placeholder). When a live play later filled in the real duration,
those plays fell under the 85% rule and dropped out of statistics, XP and
achievements. Give each of them the whole duration of its track.

Revision ID: f1a2b3c4d5e6
Revises: e9f0a1b2c3d4
Create Date: 2026-10-24 19:30:00.000000

"""
from typing import Sequence

from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: str | Sequence[str] | None = "e9f0a1b2c3d4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FULL_PLAY = "(SELECT COALESCE(NULLIF(tracks.duration, 0), 180) FROM tracks WHERE tracks.id = scrobbles.track_id)"


def upgrade() -> None:
    op.execute(
        f"UPDATE scrobbles SET listened_sec = {FULL_PLAY} "
        f"WHERE import_job_id IS NOT NULL AND listened_sec < {FULL_PLAY}"
    )


def downgrade() -> None:
    # Data fix only: the previous listening time is not kept
    pass
