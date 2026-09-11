#!/usr/bin/env bash
# Shared helpers for the portal-manager scripts.
# Not meant to be run directly - sourced by add/edit/remove/list-portal.sh.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORTALS_DIR="$REPO_ROOT/portal-manager/portals"
IMAGE_TAG="logicmonitor-mcp-server:latest"

# Master key for encrypting each portal's secrets at rest. Lives outside the
# repo entirely (like an SSH key) so it's never adjacent to what it protects.
VAULT_KEY_FILE="${PORTAL_VAULT_KEY_FILE:-$HOME/.config/portal-manager/vault.key}"
OPENSSL_ENC_OPTS=(-aes-256-cbc -pbkdf2 -salt)

log_info()  { echo "  $*" >&2; }
log_warn()  { echo "⚠️  $*" >&2; }
log_error() { echo "❌ $*" >&2; }
log_ok()    { echo "✅ $*" >&2; }

# A portal name doubles as its LM_COMPANY value, so keep it restricted to
# what's safe to use in file paths, Docker container/project names, and as an
# LM subdomain: lowercase letters, digits, and hyphens.
validate_name() {
  local name="$1"
  if [[ ! "$name" =~ ^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$ && ! "$name" =~ ^[a-z0-9]$ ]]; then
    log_error "Invalid portal name: \"$name\". Use lowercase letters, digits, and hyphens only (2-32 chars)."
    exit 1
  fi
}

portal_dir()    { echo "$PORTALS_DIR/$1"; }
compose_file()  { echo "$(portal_dir "$1")/docker-compose.yml"; }
project_name()  { echo "logicmonitor-$1"; }
container_name() { echo "logicmonitor-mcp-$1"; }

portal_exists() {
  [[ -d "$(portal_dir "$1")" ]]
}

require_portal_exists() {
  local name="$1"
  if ! portal_exists "$name"; then
    log_error "No portal named \"$name\" found in $PORTALS_DIR/"
    echo "Run list-portals.sh to see existing portals." >&2
    exit 1
  fi
}

# Generates the vault master key on first use. Never regenerated after that -
# doing so would make every existing .env.enc file undecryptable.
ensure_vault_key() {
  if [[ ! -f "$VAULT_KEY_FILE" ]]; then
    mkdir -p "$(dirname "$VAULT_KEY_FILE")"
    ( umask 077 && openssl rand -base64 32 > "$VAULT_KEY_FILE" )
    log_info "Generated new vault key at $VAULT_KEY_FILE (back this up - losing it makes every portal's .env.enc unrecoverable)"
  fi
}

enc_file() { echo "$(portal_dir "$1")/.env.enc"; }

# Encrypts stdin (KEY=VALUE lines) as the encrypted env store for a portal.
# No plaintext file is ever written - openssl reads stdin, writes ciphertext.
write_encrypted_env() {
  local name="$1"
  ensure_vault_key
  ( umask 077 && openssl enc "${OPENSSL_ENC_OPTS[@]}" -pass "file:$VAULT_KEY_FILE" -out "$(enc_file "$name")" )
}

# Returns 0 if a portal's encrypted env file is readable by this process, 1
# (with a clear stderr warning) if it exists but permission is denied - e.g.
# a portal created by a container running as a different user than whatever
# is calling this script now. Deliberately distinct from "no such key" /
# "portal has no env yet", which is a normal, silent case elsewhere - a
# permission error should never be indistinguishable from "nothing to see
# here", or callers end up confidently reporting wrong data (this happened
# in practice: list-portals.sh showed "read-write"/"none" for portals that
# were actually read-only with auth configured, because the permission
# failure was swallowed the same way as a merely-absent key).
check_env_readable() {
  local name="$1" file
  file="$(enc_file "$name")"
  if [[ -f "$file" && ! -r "$file" ]]; then
    log_error "Cannot read $file (permission denied) - it's likely owned by a different user than whoever is running this script (e.g. a container running as a different UID). Fix its ownership before trusting any output for portal \"$name\"."
    return 1
  fi
  return 0
}

# Decrypts a portal's env store to stdout (KEY=VALUE lines). Internal use only
# - callers should pipe this straight into something, never write it to disk.
decrypt_env() {
  local name="$1"
  ensure_vault_key
  openssl enc -d "${OPENSSL_ENC_OPTS[@]}" -pass "file:$VAULT_KEY_FILE" -in "$(enc_file "$name")"
}

# Exports every KEY=VALUE line from a portal's encrypted env into the CURRENT
# shell (this function must be called directly, not in a subshell/pipeline,
# or the exports won't outlive it). Used right before `docker compose up` so
# LM_COMPANY/LM_BEARER_TOKEN/etc. are available for ${VAR} substitution in the
# generated compose file without ever touching disk in plaintext.
decrypt_env_to_vars() {
  local name="$1" line
  check_env_readable "$name" || exit 1
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    export "$line"
  done < <(decrypt_env "$name")
}

# Reads a single KEY from a portal's encrypted env store (empty string if
# absent, or if the portal has no env store yet - permission-denied is NOT
# one of those cases, see check_env_readable, and is not silently absorbed
# here).
get_encrypted_env_var() {
  local name="$1" key="$2"
  check_env_readable "$name" || return 1
  decrypt_env "$name" 2>/dev/null | grep -m1 "^${key}=" | cut -d'=' -f2- || true
}

# Replaces/adds a single KEY=value in a portal's encrypted env store, without
# ever materializing the full set of secrets in plaintext on disk.
#
# IMPORTANT: this reads .env.enc into memory FIRST (command substitution,
# which blocks until the subshell fully exits) and only *then* starts the
# write. Do not "optimize" this into one pipeline that decrypts and
# re-encrypts the same file concurrently - openssl's -out truncates the file
# as soon as it starts, and if that races the -in read of the same path
# (which it can - pipeline stages all start at once), the read gets a
# partially-truncated file and this silently corrupts .env.enc.
#
# The check_env_readable guard below matters even more here than elsewhere:
# without it, a permission-denied read would make `current` empty, and this
# function would happily write out a file containing ONLY the new key -
# silently destroying every other secret this portal had. Fail loudly
# instead of risking that.
set_encrypted_env_var() {
  local name="$1" key="$2" value="$3"
  local current
  check_env_readable "$name" || exit 1
  current="$(decrypt_env "$name" 2>/dev/null || true)"
  {
    [[ -n "$current" ]] && { printf '%s\n' "$current" | grep -v "^${key}=" || true; }
    echo "${key}=${value}"
  } | write_encrypted_env "$name"
}

gen_token() {
  openssl rand -base64 32 | tr -d '\n='
}

# Prints the next unused host port across all existing portals, starting at
# 3001 (3000 is reserved for the main docker-compose.yml's services).
next_free_port() {
  local max=3000
  local f port
  if [[ -d "$PORTALS_DIR" ]]; then
    for f in "$PORTALS_DIR"/*/docker-compose.yml; do
      [[ -f "$f" ]] || continue
      port="$(grep -oE '"[0-9]+:3000"' "$f" | head -1 | grep -oE '^"[0-9]+' | tr -d '"')"
      if [[ -n "$port" && "$port" -gt "$max" ]]; then
        max="$port"
      fi
    done
  fi
  echo "$((max + 1))"
}

ensure_image_built() {
  local force="${1:-false}"
  if [[ "$force" == "true" ]] || ! docker image inspect "$IMAGE_TAG" > /dev/null 2>&1; then
    log_info "Building $IMAGE_TAG from $REPO_ROOT ..."
    docker build -t "$IMAGE_TAG" "$REPO_ROOT" >&2
  fi
}

write_compose_file() {
  local name="$1" port="$2"
  local file
  file="$(compose_file "$name")"
  cat > "$file" <<EOF
# Generated by portal-manager/add-portal.sh for portal "$name".
# Do not edit the port/container name by hand - use edit-portal.sh.
services:
  $(container_name "$name"):
    image: $IMAGE_TAG
    container_name: $(container_name "$name")
    restart: unless-stopped
    ports:
      - "${port}:3000"
    environment:
      # Populated from the decrypted vault at "docker compose up" time
      # (see decrypt_env_to_vars in lib.sh) - never stored in this file.
      LM_COMPANY: \${LM_COMPANY}
      LM_BEARER_TOKEN: \${LM_BEARER_TOKEN}
      MCP_READ_ONLY: \${MCP_READ_ONLY}
      MCP_BEARER_TOKEN: \${MCP_BEARER_TOKEN}
      MCP_TRANSPORT: streamable-http
      MCP_ADDRESS: 0.0.0.0:3000
      MCP_ENDPOINT_PATH: /mcp
      TRANSPORT_MODE: http-only
      OAUTH_PROVIDER: none
      NODE_ENV: production
      MCP_LOG_FORMAT: json
      MCP_LOG_LEVEL: info
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/healthz', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 3s
      start_period: 10s
      retries: 3
EOF
}

compose_up() {
  local name="$1"
  decrypt_env_to_vars "$name"
  docker compose \
    --project-name "$(project_name "$name")" \
    -f "$(compose_file "$name")" \
    up -d --force-recreate >&2
}

compose_down() {
  local name="$1"
  decrypt_env_to_vars "$name"
  docker compose \
    --project-name "$(project_name "$name")" \
    -f "$(compose_file "$name")" \
    down >&2
}

wait_for_healthy() {
  local port="$1" tries=15
  while (( tries > 0 )); do
    if curl -s -o /dev/null -w '%{http_code}' "http://localhost:${port}/healthz" 2>/dev/null | grep -q '^200$'; then
      return 0
    fi
    sleep 1
    tries=$((tries - 1))
  done
  return 1
}

print_mcp_json_snippet() {
  local name="$1" port="$2" mcp_bearer_token="$3"
  echo "" >&2
  echo "Add this to your .mcp.json (\"mcpServers\" object):" >&2
  echo "" >&2
  if [[ -n "$mcp_bearer_token" ]]; then
    cat >&2 <<EOF
    "logicmonitor-${name}": {
      "type": "http",
      "url": "http://localhost:${port}/mcp",
      "headers": {
        "Authorization": "Bearer ${mcp_bearer_token}"
      }
    }
EOF
  else
    cat >&2 <<EOF
    "logicmonitor-${name}": {
      "type": "http",
      "url": "http://localhost:${port}/mcp"
    }
EOF
  fi
  echo "" >&2
}
