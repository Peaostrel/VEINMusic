"""Give every artist one spelling across the catalog

Players and Last.fm write the same artist in different letter case, and the
statistics group tracks by the exact artist name, so one artist showed up
twice ("Джизус" and "ДЖИЗУС"). Each artist takes the spelling used by most
of its tracks (the oldest one on a tie).

Revision ID: d5e8b2a7c3f1
Revises: c4f7a1d9e2b6
Create Date: 2026-10-24 20:20:00.000000

"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d5e8b2a7c3f1"
down_revision: str | Sequence[str] | None = "c4f7a1d9e2b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("ix_tracks_lower_artist", "tracks", [sa.text("lower(artist)")])
    bind = op.get_bind()
    rows = bind.execute(sa.text(
        "SELECT artist, COUNT(*), MIN(id) FROM tracks "
        "WHERE artist IS NOT NULL AND artist <> '' GROUP BY artist")).all()
    spellings: dict[str, list[tuple[str, int, int]]] = {}
    for artist, tracks, first_id in rows:
        spellings.setdefault(artist.lower(), []).append((artist, int(tracks), int(first_id)))
    for variants in spellings.values():
        if len(variants) < 2:
            continue
        keep = max(variants, key=lambda v: (v[1], -v[2]))[0]
        for artist, _, _ in variants:
            if artist != keep:
                bind.execute(sa.text("UPDATE tracks SET artist = :keep WHERE artist = :artist"),
                             {"keep": keep, "artist": artist})


def downgrade() -> None:
    # The merged spellings are not kept
    op.drop_index("ix_tracks_lower_artist", table_name="tracks")
