"""Operator commands.

    python -m app.cli set-role <username> <admin|moderator|user>
    python -m app.cli refresh-showcase [username]
    python -m app.cli shrink-uploads [--dry-run]

In Docker: docker compose exec backend python -m app.cli set-role alice admin
"""
from __future__ import annotations

import argparse
import sys

from app.database import SessionLocal
from app.models import User

ROLES = ("admin", "moderator", "user")


def set_role(username: str, role: str) -> bool:
    """Give a user a role. Returns False when the user doesn't exist."""
    if role not in ROLES:
        raise ValueError(f"unknown role {role!r}")
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if user is None:
            return False
        user.role = role  # type: ignore[assignment]
        db.commit()
        return True
    finally:
        db.close()


def refresh_showcase(username: str | None = None) -> list[tuple[str, list[str]]]:
    """Look showcase favorites up again (all profiles, or one user's) with
    the current search; the 30-day locks stay as they are. Returns
    [(username, changed fields)]."""
    import asyncio

    from app.models import UserProfile
    from app.routers.profile import refresh_favorites

    db = SessionLocal()
    try:
        query = db.query(User).join(UserProfile).filter(
            (UserProfile.favorite_artist.isnot(None)) | (UserProfile.favorite_track.isnot(None))
            | (UserProfile.favorite_album.isnot(None)))
        if username:
            query = query.filter(User.username == username)
        report = []
        for user in query.all():
            changed = asyncio.run(refresh_favorites(user.profile))
            db.commit()
            report.append((str(user.username), changed))
        return report
    finally:
        db.close()


def shrink_uploads(dry_run: bool = False) -> int:
    from app.routers.media import UPLOADS_DIR
    from app.services.images import shrink_stored_uploads

    db = SessionLocal()
    try:
        report = shrink_stored_uploads(db, UPLOADS_DIR, dry_run)
    finally:
        db.close()
    for name, before, after in report:
        print(f"{name}: {before // 1024} KB -> {after // 1024} KB")
    saved = sum(before - after for _, before, after in report)
    verb = "would save" if dry_run else "saved"
    print(f"{len(report)} files, {verb} {saved // 1024} KB")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="VEIN Music operator commands")
    commands = parser.add_subparsers(dest="command", required=True)
    role_cmd = commands.add_parser("set-role", help="change a user's role")
    role_cmd.add_argument("username")
    role_cmd.add_argument("role", choices=ROLES)
    showcase_cmd = commands.add_parser("refresh-showcase", help="look showcase favorites up again")
    showcase_cmd.add_argument("username", nargs="?")
    shrink_cmd = commands.add_parser(
        "shrink-uploads", help="fit avatars and banners uploaded at full size (once)")
    shrink_cmd.add_argument("--dry-run", action="store_true", help="only report")
    args = parser.parse_args(argv)

    if args.command == "shrink-uploads":
        return shrink_uploads(args.dry_run)

    if args.command == "refresh-showcase":
        for name, changed in refresh_showcase(args.username):
            print(f"{name}: {', '.join(changed) or 'no changes'}")
        return 0
    if not set_role(args.username, args.role):
        print(f"User {args.username!r} not found", file=sys.stderr)
        return 1
    print(f"{args.username}: role set to {args.role}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
