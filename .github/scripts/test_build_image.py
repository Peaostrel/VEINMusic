"""Exercise registry failures without pulling or publishing any images."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("build_image.sh")
TRANSIENT = "ERROR: failed to resolve source metadata: 429 Too Many Requests: Data limit exceeded"
FAKE_DOCKER = '''#!/usr/bin/env python3
import json, os, pathlib, sys
root = pathlib.Path(os.environ["FAKE_DOCKER_ROOT"])
calls_file = root / "calls.json"
calls = json.loads(calls_file.read_text()) if calls_file.exists() else []
outcomes = json.loads((root / "outcomes.json").read_text())
outcome = outcomes[min(len(calls), len(outcomes) - 1)]
calls.append(sys.argv[1:])
calls_file.write_text(json.dumps(calls))
print(outcome[1])
sys.exit(outcome[0])
'''


class ImageBuildRecoveryTests(unittest.TestCase):
    def run_build(self, outcomes, event="pull_request"):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, text in {"docker": FAKE_DOCKER, "sleep": "#!/bin/sh\nexit 0\n"}.items():
                path = root / name
                path.write_text(text)
                path.chmod(0o700)
            (root / "outcomes.json").write_text(json.dumps(outcomes))
            env = {**os.environ, "PATH": f"{root}:{os.environ['PATH']}",
                   "FAKE_DOCKER_ROOT": str(root), "RUNNER_TEMP": str(root),
                   "IMAGE": "ghcr.io/example/test", "DOCKERFILE": "backend.Dockerfile",
                   "BASE_IMAGE_TAG": "python:3.11-slim", "GITHUB_EVENT_NAME": event,
                   "GITHUB_REPOSITORY": "example/test", "GITHUB_SHA": "fixture"}
            result = subprocess.run(["bash", str(SCRIPT)], env=env, text=True, capture_output=True)
            calls = json.loads((root / "calls.json").read_text())
            self.assertFalse(list(root.glob("vein-image-build.*")))
            return result, calls

    def test_success_uses_ecr_and_loads_pr_image(self):
        result, calls = self.run_build([(0, "built")])
        self.assertEqual(result.returncode, 0)
        self.assertEqual(len(calls), 1)
        self.assertIn("BASE_IMAGE=public.ecr.aws/docker/library/python:3.11-slim", calls[0])
        self.assertIn("--load", calls[0])
        self.assertNotIn("--push", calls[0])

    def test_rate_limit_falls_back_without_changing_version(self):
        result, calls = self.run_build([(17, TRANSIENT), (0, "built")])
        self.assertEqual(result.returncode, 0)
        self.assertEqual(len(calls), 2)
        self.assertIn("BASE_IMAGE=docker.io/library/python:3.11-slim", calls[1])
        self.assertIn("::warning::", result.stdout)

    def test_retries_are_bounded_and_preserve_failure(self):
        result, calls = self.run_build([(17, TRANSIENT)])
        self.assertEqual(result.returncode, 17)
        self.assertEqual(len(calls), 3)

    def test_real_build_and_auth_errors_are_not_retried(self):
        for error in ["ERROR: npm run build failed with exit code 1",
                      "ERROR: failed to resolve source metadata: sha256:503abcdef: 403 Forbidden"]:
            with self.subTest(error=error):
                result, calls = self.run_build([(23, error)])
                self.assertEqual(result.returncode, 23)
                self.assertEqual(len(calls), 1)

    def test_release_still_publishes_both_image_tags(self):
        result, calls = self.run_build([(0, "published")], event="push")
        self.assertEqual(result.returncode, 0)
        self.assertIn("--push", calls[0])
        self.assertNotIn("--load", calls[0])
        self.assertIn("ghcr.io/example/test:latest", calls[0])
        self.assertIn("ghcr.io/example/test:fixture", calls[0])


if __name__ == "__main__":
    unittest.main()
