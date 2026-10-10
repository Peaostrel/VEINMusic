"""Offsite uploader handles complete dumps and never initializes on errors."""
import os
from pathlib import Path
import subprocess

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "offsite-backup.sh"


@pytest.mark.parametrize("available,reachable,success", [(True, True, True), (True, False, False), (False, True, False)])
def test_backup_control_flow(tmp_path, available, reachable, success):
    dumps = tmp_path / "dumps"
    dumps.mkdir()
    (dumps / "db-20261010-100001.dump.part").write_text("unfinished")
    if available:
        (dumps / "db-20261010-080000.dump").write_text("older")
        (dumps / "db-20261010-100000.dump").write_text("complete")
    log = tmp_path / "commands"
    cli = tmp_path / "restic"
    cli.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$COMMAND_LOG"\nif [ "$1" = snapshots ] && [ "$REACHABLE" = 0 ]; then exit 1; fi\n')
    cli.chmod(0o700)
    env = {**os.environ, "PATH": f"{tmp_path}:{os.environ['PATH']}", "COMMAND_LOG": str(log),
           "REACHABLE": "1" if reachable else "0", "BACKUP_DIR": str(dumps), "OFFSITE_RUN_ONCE": "1",
           "RESTIC_REPOSITORY": "s3:https://example.invalid/backups", "RESTIC_PASSWORD_FILE": str(tmp_path / "password")}
    result = subprocess.run(["sh", str(SCRIPT)], env=env, capture_output=True, text=True, timeout=5)
    assert (result.returncode == 0) == success
    commands = log.read_text() if log.exists() else ""
    assert "init" not in commands
    assert ".part" not in commands
    if success:
        assert "db-20261010-100000.dump" in commands
        assert "db-20261010-080000.dump" not in commands
    else:
        assert "backup --host" not in commands


def test_restore_waits_for_final_tcp_server(tmp_path):
    """A socket-ready initialization server must not trigger restoration."""
    cli = tmp_path / "docker"
    log = tmp_path / "commands"
    cli.write_text('''#!/bin/sh
printf '%s\\n' "$*" >> "$COMMAND_LOG"
case "$*" in
  *pg_isready*)
    case "$*" in *"-h 127.0.0.1"*) ;; *) exit 0 ;; esac
    if [ ! -f "$READY_ATTEMPT" ]; then touch "$READY_ATTEMPT"; exit 1; fi ;;
  *pg_restore*) test -f "$READY_ATTEMPT" ;;
esac
''')
    cli.chmod(0o700)
    sleep = tmp_path / "sleep"
    sleep.write_text("#!/bin/sh\nexit 0\n")
    sleep.chmod(0o700)
    dump = tmp_path / "recovered.dump"
    dump.write_text("fixture")
    marker = tmp_path / "verified"
    env = {**os.environ, "PATH": f"{tmp_path}:{os.environ['PATH']}",
           "COMMAND_LOG": str(log), "READY_ATTEMPT": str(tmp_path / "ready")}
    script = SCRIPT.with_name("verify-backup.sh")
    result = subprocess.run(["sh", str(script), str(dump), str(marker)],
                            env=env, capture_output=True, text=True, timeout=5)
    assert result.returncode == 0, result.stderr
    commands = log.read_text().splitlines()
    probes = [command for command in commands if "pg_isready" in command]
    assert len(probes) == 2
    for command in commands:
        if any(tool in command for tool in ("pg_isready", "pg_restore", "psql")):
            assert "-h 127.0.0.1" in command
    assert commands[-1].startswith("rm -f vein-restore-check-")
    assert marker.exists()
