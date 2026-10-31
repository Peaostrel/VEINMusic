"""Give every album of an artist one spelling

Like d5e8b2a7c3f1 for artists: Last.fm and the player write the same album in
different letter case, so it showed up twice in top albums. Each album takes
the spelling used by most of its tracks (the oldest one on a tie).

Revision ID: f7b1d4c9e5a3
Revises: e6f9c3b8d4a2
Create Date: 2026-10-31 17:10:00.000000

"""
from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f7b1d4c9e5a3"
down_revision: str | Sequence[str] | None = "e6f9c3b8d4a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(sa.text(
        "SELECT artist, album, COUNT(*), MIN(id) FROM tracks "
        "WHERE artist IS NOT NULL AND album IS NOT NULL AND album <> '' GROUP BY artist, album")).all()
    spellings: dict[tuple[str, str], list[tuple[str, int, int]]] = {}
    for artist, album, tracks, first_id in rows:
        spellings.setdefault((artist, album.lower()), []).append((album, int(tracks), int(first_id)))
    for (artist, _), variants in spellings.items():
        if len(variants) < 2:
            continue
        keep = max(variants, key=lambda v: (v[1], -v[2]))[0]
        for album, _, _ in variants:
            if album != keep:
                bind.execute(sa.text("UPDATE tracks SET album = :keep WHERE artist = :artist AND album = :album"),
                             {"keep": keep, "artist": artist, "album": album})


def downgrade() -> None:
    # The merged spellings are not kept
    pass
