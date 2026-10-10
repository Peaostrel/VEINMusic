"""Maintenance commands executed on the server, never exposed as HTTP endpoints."""
import argparse
import json

from app.database import SessionLocal
from app.models import User
from app.services.incident_response import revoke_service_sessions


def main():
    parser = argparse.ArgumentParser(description="VEINMusic operator maintenance")
    commands = parser.add_subparsers(dest="command", required=True)
    revoke = commands.add_parser("revoke-sessions", help="Invalidate all users' sessions")
    revoke.add_argument("--apply", action="store_true", help="Commit changes; default is a dry run")
    revoke.add_argument("--revoke-api-keys", action="store_true", help="Also revoke personal/developer/device keys and pending pairings")
    revoke.add_argument("--reason", default="operator incident response")
    args = parser.parse_args()
    with SessionLocal() as db:
        if not args.apply:
            print(json.dumps({"dry_run": True, "users": db.query(User.id).count(), "revoke_api_keys": args.revoke_api_keys}))
            return
        print(json.dumps(revoke_service_sessions(db, revoke_api_keys=args.revoke_api_keys, reason=args.reason)))


if __name__ == "__main__":
    main()
