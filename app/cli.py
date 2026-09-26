"""Operator commands.

    python -m app.cli set-role <username> <admin|moderator|user>

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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="VEIN Music operator commands")
    commands = parser.add_subparsers(dest="command", required=True)
    role_cmd = commands.add_parser("set-role", help="change a user's role")
    role_cmd.add_argument("username")
    role_cmd.add_argument("role", choices=ROLES)
    args = parser.parse_args(argv)

    if not set_role(args.username, args.role):
        print(f"User {args.username!r} not found", file=sys.stderr)
        return 1
    print(f"{args.username}: role set to {args.role}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
