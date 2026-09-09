#!/usr/bin/env bash
# Add a new LogicMonitor portal as its own MCP server container.
#
# Interactive:  ./add-portal.sh
# Non-interactive: ./add-portal.sh --name acme --token "$LM_TOKEN" [--port 3002] [--readonly false] [--no-bearer-token]
#
# The portal name doubles as its LM_COMPANY value (they're always the same).

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

NAME=""
TOKEN=""
PORT=""
READONLY="true"
WANT_BEARER_TOKEN="true"
REBUILD_IMAGE="false"

usage() {
  cat <<EOF
Usage: $0 [--name NAME] [--token TOKEN] [--port PORT] [--readonly true|false] [--no-bearer-token] [--rebuild-image]

  --name NAME          Portal name (also used as LM_COMPANY). Prompted if omitted.
  --token TOKEN        LM_BEARER_TOKEN. Prompted (hidden) if omitted.
  --port PORT          Host port to expose. Defaults to the next free port.
  --readonly BOOL      MCP_READ_ONLY value. Defaults to true.
  --no-bearer-token    Don't generate an MCP_BEARER_TOKEN (endpoint left unauthenticated).
  --rebuild-image      Rebuild the shared $IMAGE_TAG image even if it already exists.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) NAME="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --readonly) READONLY="$2"; shift 2 ;;
    --no-bearer-token) WANT_BEARER_TOKEN="false"; shift ;;
    --rebuild-image) REBUILD_IMAGE="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) log_error "Unknown argument: $1"; usage; exit 1 ;;
  esac
done

if [[ -z "$NAME" ]]; then
  read -r -p "Portal name (also used as LM_COMPANY): " NAME
fi
validate_name "$NAME"

if portal_exists "$NAME"; then
  log_error "Portal \"$NAME\" already exists ($(portal_dir "$NAME"))."
  echo "Use edit-portal.sh to change it, or remove-portal.sh to delete it first." >&2
  exit 1
fi

if [[ -z "$TOKEN" ]]; then
  read -r -s -p "LM_BEARER_TOKEN for $NAME: " TOKEN
  echo >&2
fi
if [[ -z "$TOKEN" ]]; then
  log_error "LM_BEARER_TOKEN cannot be empty."
  exit 1
fi

if [[ -z "$PORT" ]]; then
  PORT="$(next_free_port)"
fi

if [[ "$READONLY" != "true" && "$READONLY" != "false" ]]; then
  log_error "--readonly must be \"true\" or \"false\", got: $READONLY"
  exit 1
fi

MCP_BEARER_TOKEN=""
if [[ "$WANT_BEARER_TOKEN" == "true" ]]; then
  MCP_BEARER_TOKEN="$(gen_token)"
fi

mkdir -p "$(portal_dir "$NAME")"

cat > "$(env_file "$NAME")" <<EOF
LM_COMPANY=${NAME}
LM_BEARER_TOKEN=${TOKEN}
MCP_READ_ONLY=${READONLY}
MCP_BEARER_TOKEN=${MCP_BEARER_TOKEN}
EOF
chmod 600 "$(env_file "$NAME")"

write_compose_file "$NAME" "$PORT"

ensure_image_built "$REBUILD_IMAGE"

log_info "Starting portal \"$NAME\" on port $PORT (read-only: $READONLY) ..."
compose_up "$NAME"

if wait_for_healthy "$PORT"; then
  log_ok "Portal \"$NAME\" is up and healthy at http://localhost:${PORT}/mcp"
else
  log_warn "Portal \"$NAME\" started but didn't report healthy within 15s. Check: docker logs $(container_name "$NAME")"
fi

print_mcp_json_snippet "$NAME" "$PORT" "$MCP_BEARER_TOKEN"

if [[ -n "$MCP_BEARER_TOKEN" ]]; then
  log_info "MCP_BEARER_TOKEN (save this - it won't be shown again): $MCP_BEARER_TOKEN"
fi
