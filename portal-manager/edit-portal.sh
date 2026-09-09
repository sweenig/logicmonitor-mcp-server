#!/usr/bin/env bash
# Edit an existing portal's settings and recreate its container.
#
#   ./edit-portal.sh --name acme --readonly false
#   ./edit-portal.sh --name acme --rotate-token          # new LM_BEARER_TOKEN (prompted, hidden)
#   ./edit-portal.sh --name acme --rotate-bearer-token   # new MCP_BEARER_TOKEN (auto-generated)
#   ./edit-portal.sh --name acme --port 3010

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

NAME=""
NEW_READONLY=""
NEW_PORT=""
ROTATE_TOKEN="false"
ROTATE_BEARER_TOKEN="false"
REBUILD_IMAGE="false"

usage() {
  cat <<EOF
Usage: $0 --name NAME [--readonly true|false] [--port PORT] [--rotate-token] [--rotate-bearer-token] [--rebuild-image]

  --name NAME              Portal to edit (required).
  --readonly BOOL          Change MCP_READ_ONLY.
  --port PORT              Move the portal to a different host port.
  --rotate-token           Prompt (hidden) for a new LM_BEARER_TOKEN.
  --rotate-bearer-token    Generate a new MCP_BEARER_TOKEN (invalidates the old one).
  --rebuild-image          Rebuild the shared $IMAGE_TAG image before recreating.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) NAME="$2"; shift 2 ;;
    --readonly) NEW_READONLY="$2"; shift 2 ;;
    --port) NEW_PORT="$2"; shift 2 ;;
    --rotate-token) ROTATE_TOKEN="true"; shift ;;
    --rotate-bearer-token) ROTATE_BEARER_TOKEN="true"; shift ;;
    --rebuild-image) REBUILD_IMAGE="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) log_error "Unknown argument: $1"; usage; exit 1 ;;
  esac
done

if [[ -z "$NAME" ]]; then
  log_error "--name is required."
  usage
  exit 1
fi
require_portal_exists "$NAME"

if [[ -z "$NEW_READONLY" && -z "$NEW_PORT" && "$ROTATE_TOKEN" == "false" && "$ROTATE_BEARER_TOKEN" == "false" && "$REBUILD_IMAGE" == "false" ]]; then
  log_error "Nothing to change - pass at least one of --readonly, --port, --rotate-token, --rotate-bearer-token, --rebuild-image."
  exit 1
fi

CHANGED="false"

if [[ -n "$NEW_READONLY" ]]; then
  if [[ "$NEW_READONLY" != "true" && "$NEW_READONLY" != "false" ]]; then
    log_error "--readonly must be \"true\" or \"false\", got: $NEW_READONLY"
    exit 1
  fi
  set_env_var "$(env_file "$NAME")" "MCP_READ_ONLY" "$NEW_READONLY"
  log_info "MCP_READ_ONLY -> $NEW_READONLY"
  CHANGED="true"
fi

if [[ "$ROTATE_TOKEN" == "true" ]]; then
  read -r -s -p "New LM_BEARER_TOKEN for $NAME: " NEW_TOKEN
  echo >&2
  if [[ -z "$NEW_TOKEN" ]]; then
    log_error "LM_BEARER_TOKEN cannot be empty."
    exit 1
  fi
  set_env_var "$(env_file "$NAME")" "LM_BEARER_TOKEN" "$NEW_TOKEN"
  log_info "LM_BEARER_TOKEN rotated."
  CHANGED="true"
fi

NEW_MCP_BEARER_TOKEN=""
if [[ "$ROTATE_BEARER_TOKEN" == "true" ]]; then
  NEW_MCP_BEARER_TOKEN="$(gen_token)"
  set_env_var "$(env_file "$NAME")" "MCP_BEARER_TOKEN" "$NEW_MCP_BEARER_TOKEN"
  log_info "MCP_BEARER_TOKEN rotated - update .mcp.json with the new value below."
  CHANGED="true"
fi

if [[ -n "$NEW_PORT" ]]; then
  write_compose_file "$NAME" "$NEW_PORT"
  log_info "Port -> $NEW_PORT"
  CHANGED="true"
fi

if [[ "$REBUILD_IMAGE" == "true" ]]; then
  ensure_image_built "true"
  CHANGED="true"
fi

if [[ "$CHANGED" == "true" ]]; then
  PORT="$(grep -oE '"[0-9]+:3000"' "$(compose_file "$NAME")" | head -1 | grep -oE '^"[0-9]+' | tr -d '"')"
  log_info "Recreating portal \"$NAME\" ..."
  compose_up "$NAME"
  if wait_for_healthy "$PORT"; then
    log_ok "Portal \"$NAME\" is up and healthy at http://localhost:${PORT}/mcp"
  else
    log_warn "Portal \"$NAME\" started but didn't report healthy within 15s. Check: docker logs $(container_name "$NAME")"
  fi
  if [[ -n "$NEW_MCP_BEARER_TOKEN" ]]; then
    print_mcp_json_snippet "$NAME" "$PORT" "$NEW_MCP_BEARER_TOKEN"
    log_info "New MCP_BEARER_TOKEN (save this - it won't be shown again): $NEW_MCP_BEARER_TOKEN"
  fi
fi
