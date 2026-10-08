#!/usr/bin/env bash
# Setup/refresh for the Portal Manager web UI: writes webui/.env with the
# admin password hash, a Flask session secret, and the host-specific values
# (repo path, vault key path, host UID/GID, docker group GID) that
# docker-compose.yml needs so none of it is hardcoded to one machine/user.
#
# Safe to re-run at any time (e.g. after moving the checkout, or running as
# a different user) - by default it leaves an existing password/session
# secret alone and only refreshes the host-specific values. Pass
# --rotate-password to also set a new password (this also rotates the
# session secret, invalidating any current login).
#
# The web UI port is WEBUI_PORT in .env (default 5051). Pass --port N to change
# it; otherwise an existing .env value is kept. The vault key location is
# PORTAL_VAULT_KEY_FILE (precedence: shell env, then .env, then
# ~/.config/portal-manager/vault.key). This script refuses to continue if that
# path is unusable, and tells you what to put in .env.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

DEFAULT_PORT=5051
ROTATE_PASSWORD=false
CLI_PORT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --rotate-password) ROTATE_PASSWORD=true; shift ;;
    --port)
      CLI_PORT="${2:-}"
      if [[ ! "$CLI_PORT" =~ ^[0-9]+$ ]] || (( CLI_PORT < 1 || CLI_PORT > 65535 )); then
        echo "❌ --port needs a number between 1 and 65535 (got: \"${CLI_PORT}\")" >&2
        exit 1
      fi
      shift 2
      ;;
    *)
      echo "❌ Unknown argument: $1 (supported: --rotate-password, --port N)" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$SCRIPT_DIR/requirements.txt" ]]; then
  echo "❌ Run this from a checkout that has portal-manager/webui/requirements.txt" >&2
  exit 1
fi

# Read a KEY's value from the existing .env (empty if absent).
env_value() {
  [[ -f "$ENV_FILE" ]] && { grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2- || true; } || true
}

# Honor a PORTAL_VAULT_KEY_FILE set in .env (unless already set in the shell)
# before lib.sh resolves it, so .env is a real override point.
if [[ -z "${PORTAL_VAULT_KEY_FILE:-}" ]]; then
  ENV_KEY_FILE="$(env_value PORTAL_VAULT_KEY_FILE)"
  [[ -n "$ENV_KEY_FILE" ]] && export PORTAL_VAULT_KEY_FILE="$ENV_KEY_FILE"
fi

# Reuse the same REPO_ROOT/vault-key logic the CLI scripts use, so the web UI
# never disagrees with them about where either one lives.
source "$SCRIPT_DIR/../lib.sh"

# Vault key sanity checks. Docker bind-mounts whatever path is in .env, and if
# it doesn't exist it silently creates a root-owned *directory* there - so
# catch bad paths here, before that can happen.
if [[ -e "$VAULT_KEY_FILE" && ! -f "$VAULT_KEY_FILE" ]]; then
  echo "❌ Vault key path exists but is not a file: $VAULT_KEY_FILE" >&2
  echo "   (Docker creates an empty directory at a bind-mount path that didn't exist.)" >&2
  echo "   Remove it (sudo rm -rf \"$VAULT_KEY_FILE\"), put your real vault.key there, or" >&2
  echo "   set the key's actual location in $ENV_FILE:" >&2
  echo "     PORTAL_VAULT_KEY_FILE=/path/to/your/vault.key" >&2
  echo "   then re-run ./setup.sh" >&2
  exit 1
fi

if [[ ! -f "$VAULT_KEY_FILE" ]]; then
  shopt -s nullglob
  EXISTING_ENC=("$PORTALS_DIR"/*/.env.enc)
  shopt -u nullglob
  if (( ${#EXISTING_ENC[@]} > 0 )); then
    echo "❌ No vault key at $VAULT_KEY_FILE, but ${#EXISTING_ENC[@]} portal(s) already have encrypted credentials." >&2
    echo "   Generating a new key would make them permanently unreadable. Either copy the original" >&2
    echo "   vault.key to that path, or add its real location to $ENV_FILE:" >&2
    echo "     PORTAL_VAULT_KEY_FILE=/path/to/your/vault.key" >&2
    echo "   then re-run ./setup.sh" >&2
    exit 1
  fi
  if ! mkdir -p "$(dirname "$VAULT_KEY_FILE")" 2>/dev/null || [[ ! -w "$(dirname "$VAULT_KEY_FILE")" ]]; then
    echo "❌ Can't create a vault key in $(dirname "$VAULT_KEY_FILE") (not writable by $(id -un))." >&2
    echo "   Add a writable location to $ENV_FILE:" >&2
    echo "     PORTAL_VAULT_KEY_FILE=$HOME/.config/portal-manager/vault.key" >&2
    echo "   then re-run ./setup.sh" >&2
    exit 1
  fi
fi
ensure_vault_key

if [[ ! -r "$VAULT_KEY_FILE" ]]; then
  echo "❌ Vault key $VAULT_KEY_FILE exists but isn't readable by $(id -un) (owner: $(stat -c %U "$VAULT_KEY_FILE"))." >&2
  echo "   Fix with: sudo chown $(id -un):$(id -gn) \"$VAULT_KEY_FILE\" && chmod 600 \"$VAULT_KEY_FILE\"" >&2
  exit 1
fi

# Port: --port flag, else the existing .env value, else the default.
WEBUI_PORT="${CLI_PORT:-$(env_value WEBUI_PORT)}"
WEBUI_PORT="${WEBUI_PORT:-$DEFAULT_PORT}"

# Note when a copied-over .env had a different checkout path (refreshed below).
OLD_REPO_ROOT="$(env_value REPO_ROOT)"
if [[ -n "$OLD_REPO_ROOT" && "$OLD_REPO_ROOT" != "$REPO_ROOT" ]]; then
  echo "  REPO_ROOT in .env was $OLD_REPO_ROOT; updating to $REPO_ROOT." >&2
fi

DOCKER_GID="$(getent group docker | cut -d: -f3 || true)"
if [[ -z "$DOCKER_GID" ]]; then
  echo "⚠️  No local 'docker' group found - falling back to your primary group ($(id -g)), which probably can't read /var/run/docker.sock. Add yourself to the docker group and re-run setup.sh." >&2
  DOCKER_GID="$(id -g)"
fi

EXISTING_HASH=""
EXISTING_SECRET=""
if [[ -f "$ENV_FILE" ]]; then
  EXISTING_HASH="$(grep -m1 '^ADMIN_PASSWORD_HASH=' "$ENV_FILE" | cut -d= -f2- || true)"
  EXISTING_SECRET="$(grep -m1 '^FLASK_SECRET_KEY=' "$ENV_FILE" | cut -d= -f2- || true)"
fi

if [[ -n "$EXISTING_HASH" && -n "$EXISTING_SECRET" && "$ROTATE_PASSWORD" == false ]]; then
  echo "  Keeping existing admin password (pass --rotate-password to change it)." >&2
  PASSWORD_HASH_ESCAPED="$EXISTING_HASH"
  SESSION_SECRET="$EXISTING_SECRET"
else
  read -r -s -p "Set an admin password for the Portal Manager web UI: " PASSWORD
  echo >&2
  if [[ -z "$PASSWORD" ]]; then
    echo "❌ Password cannot be empty." >&2
    exit 1
  fi

  PASSWORD_HASH="$(python3 -c "
import sys
from werkzeug.security import generate_password_hash
print(generate_password_hash(sys.argv[1]))
" "$PASSWORD" 2>/dev/null || true)"

  if [[ -z "$PASSWORD_HASH" ]]; then
    echo "⚠️  werkzeug isn't installed in this environment - falling back to 'pip install werkzeug' first, or run this inside the webui container/venv." >&2
    exit 1
  fi

  SESSION_SECRET="$(openssl rand -hex 32)"

  # This file is loaded via docker-compose's `env_file:`, which - like the rest
  # of a compose file - interpolates $VAR/${VAR} in the values it reads. Werkzeug
  # password hashes are $-delimited (e.g. scrypt:N:r:p$salt$hash), so an
  # unescaped hash gets silently mangled (each $segment treated as a variable
  # reference and blanked). $$ is compose's escape for a literal $ - verified
  # empirically that it round-trips correctly (see plan for how this was found).
  PASSWORD_HASH_ESCAPED="${PASSWORD_HASH//\$/\$\$}"
fi

cat > "$ENV_FILE" <<EOF
ADMIN_PASSWORD_HASH=${PASSWORD_HASH_ESCAPED}
FLASK_SECRET_KEY=${SESSION_SECRET}
REPO_ROOT=${REPO_ROOT}
PORTAL_VAULT_KEY_FILE=${VAULT_KEY_FILE}
HOST_UID=$(id -u)
HOST_GID=$(id -g)
DOCKER_GID=${DOCKER_GID}
WEBUI_PORT=${WEBUI_PORT}
EOF
chmod 600 "$ENV_FILE"

echo "✅ Wrote $ENV_FILE (web UI port: $WEBUI_PORT, vault key: $VAULT_KEY_FILE)" >&2
