"""
Thin subprocess wrapper around the portal-manager bash scripts.

This module intentionally contains no portal-lifecycle logic of its own -
add/edit/remove/list-portal.sh remain the single source of truth for how a
portal is created, changed, or torn down. This file only knows how to call
them and turn their `--json` output (or a non-zero exit code) into Python
values / exceptions.
"""

import json
import os
import subprocess

PORTAL_MANAGER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SCRIPT_TIMEOUT_SECONDS = 120


class PortalOpError(Exception):
    """Raised when a portal-manager script exits non-zero. Carries its stderr."""

    def __init__(self, message: str, stderr: str = ""):
        super().__init__(message)
        self.stderr = stderr


def _run(script: str, args: list[str], extra_env: dict[str, str] | None = None) -> str:
    """Runs a portal-manager script, returns its stdout. Raises PortalOpError on failure.

    Secrets are passed via extra_env (subprocess environment), never appended
    to args - env vars aren't visible in `ps` output the way argv is.
    """
    script_path = os.path.join(PORTAL_MANAGER_DIR, script)
    env = os.environ.copy()
    if extra_env:
        env.update(extra_env)

    try:
        result = subprocess.run(
            [script_path, *args],
            cwd=PORTAL_MANAGER_DIR,
            env=env,
            capture_output=True,
            text=True,
            timeout=SCRIPT_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as exc:
        raise PortalOpError(f"{script} timed out after {SCRIPT_TIMEOUT_SECONDS}s") from exc

    if result.returncode != 0:
        # Scripts write human-readable errors to stderr (see log_error in lib.sh).
        raise PortalOpError(
            result.stderr.strip().splitlines()[-1] if result.stderr.strip() else f"{script} failed",
            stderr=result.stderr,
        )

    return result.stdout.strip()


def _parse_json_line(stdout: str) -> dict:
    """The scripts' --json mode prints exactly one JSON line on success."""
    if not stdout:
        return {}
    return json.loads(stdout.splitlines()[-1])


def list_portals() -> list[dict]:
    stdout = _run("list-portals.sh", ["--json"])
    return json.loads(stdout) if stdout else []


def add_portal(
    name: str,
    token: str,
    readonly: bool = True,
    port: int | None = None,
    want_bearer_token: bool = True,
) -> dict:
    args = ["--name", name, "--readonly", "true" if readonly else "false", "--json"]
    if port is not None:
        args += ["--port", str(port)]
    if not want_bearer_token:
        args.append("--no-bearer-token")
    stdout = _run("add-portal.sh", args, extra_env={"PORTAL_LM_TOKEN": token})
    return _parse_json_line(stdout)


def edit_portal(
    name: str,
    readonly: bool | None = None,
    port: int | None = None,
    rotate_token_value: str | None = None,
    rotate_bearer_token: bool = False,
    rebuild_image: bool = False,
) -> dict:
    args = ["--name", name, "--json"]
    extra_env = {}
    if readonly is not None:
        args += ["--readonly", "true" if readonly else "false"]
    if port is not None:
        args += ["--port", str(port)]
    if rotate_token_value is not None:
        args.append("--rotate-token")
        extra_env["PORTAL_ROTATE_TOKEN"] = rotate_token_value
    if rotate_bearer_token:
        args.append("--rotate-bearer-token")
    if rebuild_image:
        args.append("--rebuild-image")

    if len(args) == 3:  # only --name and --json, i.e. nothing to actually change
        raise PortalOpError("No changes specified")

    stdout = _run("edit-portal.sh", args, extra_env=extra_env)
    return _parse_json_line(stdout)


def remove_portal(name: str) -> None:
    _run("remove-portal.sh", ["--name", name, "--yes"])


def get_portal_secret(name: str, key: str) -> str:
    """Only call this after independently re-verifying the caller's password -
    it returns the real decrypted secret, not a masked/redacted value."""
    return _run("get-portal-secret.sh", ["--name", name, "--key", key])
