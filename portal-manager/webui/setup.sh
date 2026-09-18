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

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

ROTATE_PASSWORD=false
for arg in "$@"; do
  case "$arg" in
    --rotate-password) ROTATE_PASSWORD=true ;;
    *)
      echo "❌ Unknown argument: $arg (only --rotate-password is supported)" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$SCRIPT_DIR/requirements.txt" ]]; then
  echo "❌ Run this from a checkout that has portal-manager/webui/requirements.txt" >&2
  exit 1
fi

# Reuse the same REPO_ROOT/vault-key logic the CLI scripts use, so the web UI
# never disagrees with them about where either one lives.
source "$SCRIPT_DIR/../lib.sh"
ensure_vault_key

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
EOF
chmod 600 "$ENV_FILE"

echo "✅ Wrote $ENV_FILE" >&2
