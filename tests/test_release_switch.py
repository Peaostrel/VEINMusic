"""Exercise release-switch decisions and rollback with a recording Docker CLI."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def deployment(tmp_path):
    deploy = tmp_path / "deploy"
    deploy.mkdir()
    for name in ("blue-green.sh", "rollback.sh"):
        shutil.copy(ROOT / "deploy" / name, deploy / name)
    (deploy / "routing").mkdir()
    shutil.copy(ROOT / "deploy/upstreams.example.caddy", deploy / "routing/upstreams.caddy")
    (deploy / "maintenance").mkdir()
    (deploy / ".env").write_text("IMAGE_TAG=new-sha\n")
    (deploy / "docker-compose.yml").write_text("services: {}\n")
    binary = tmp_path / "bin"
    binary.mkdir()
    docker = binary / "docker"
    docker.write_text(f"#!{sys.executable}\n" + '''import json, os, sys
args = sys.argv[1:]
with open(os.environ["DOCKER_LOG"], "a") as out:
    out.write(json.dumps(args) + "\\n")
if args[:1] == ["inspect"]:
    print("sha256:oldimage")
elif "ps" in args and "backend" in args:
    print("old-api")
elif "ps" in args and "frontend" in args:
    print("old-site")
if "-c" in args and "get_current_heads" in args[-1] and os.getenv("SCHEMA_DIFF"):
    sys.exit(1)
if args[:1] == ["exec"] and args[1].startswith("vein-api-") and os.getenv("API_FAIL"):
    sys.exit(1)
if "reload" in args and os.getenv("RELOAD_FAIL"):
    sys.exit(1)
if "--check" in args and os.getenv("WORKER_FAIL"):
    sys.exit(1)
''')
    docker.chmod(0o755)
    for name, content in (("sleep", "#!/bin/sh\nexit 0\n"), ("awk", "#!/bin/sh\necho 1000000\n")):
        (binary / name).write_text(content)
        (binary / name).chmod(0o755)
    env = {**os.environ, "PATH": f"{binary}:{os.environ['PATH']}", "DOCKER_LOG": str(tmp_path / "docker.log"), "PREVIOUS_IMAGE_TAG": "old-sha"}
    return deploy, env


def run(deployment, **flags):
    deploy, env = deployment
    result = subprocess.run(["bash", "blue-green.sh"], cwd=deploy, env={**env, **flags}, capture_output=True, text=True, timeout=15)
    calls = [json.loads(line) for line in Path(env["DOCKER_LOG"]).read_text().splitlines()]
    return result, calls


def test_failed_candidate_never_switches_traffic(deployment):
    result, calls = run(deployment, API_FAIL="1")
    assert result.returncode != 0
    assert not any("reload" in call for call in calls)
    assert any(call[:2] == ["rm", "-f"] for call in calls)
    assert not (deployment[0] / ".state/active-release").exists()


def test_schema_change_uses_maintenance_path(deployment):
    result, calls = run(deployment, SCHEMA_DIFF="1")
    assert result.returncode == 75
    assert not any("--name" in call for call in calls)


def test_success_retains_previous_and_can_rollback(deployment):
    result, calls = run(deployment)
    assert result.returncode == 0, result.stderr
    deploy, env = deployment
    assert "old-sha" in (deploy / ".state/previous-release").read_text()
    assert "vein-api-" in (deploy / "routing/upstreams.caddy").read_text()
    assert any("--check" in call for call in calls)
    rollback = subprocess.run(["bash", "rollback.sh"], cwd=deploy, env=env, capture_output=True, text=True, timeout=15)
    assert rollback.returncode == 0, rollback.stderr
    assert "reverse_proxy backend:8000" in (deploy / "routing/upstreams.caddy").read_text()
    assert (deploy / ".state/deployed").read_text().strip() == "old-sha"


def test_worker_failure_restores_old_routes_and_images(deployment):
    result, calls = run(deployment, WORKER_FAIL="1")
    assert result.returncode != 0
    assert "reverse_proxy backend:8000" in (deployment[0] / "routing/upstreams.caddy").read_text()
    assert sum("reload" in call for call in calls) == 2
    assert "sha256:oldimage" in (deployment[0] / ".state/rollback-compose.json").read_text()
