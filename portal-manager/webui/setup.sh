#!/usr/bin/env bash
# One-time setup: prompt for the admin password, write webui/.env with its
# hash plus a fresh Flask session secret. Safe to re-run to change the
# password later (overwrites .env).

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f "$SCRIPT_DIR/requirements.txt" ]]; then
  echo "❌ Run this from a checkout that has portal-manager/webui/requirements.txt" >&2
  exit 1
fi

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

cat > "$SCRIPT_DIR/.env" <<EOF
ADMIN_PASSWORD_HASH=${PASSWORD_HASH_ESCAPED}
FLASK_SECRET_KEY=${SESSION_SECRET}
EOF
chmod 600 "$SCRIPT_DIR/.env"

echo "✅ Wrote $SCRIPT_DIR/.env" >&2
