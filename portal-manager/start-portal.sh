#!/usr/bin/env bash
# Start (or restart) an existing portal's container. Always recreates the
# container, so it also serves as "restart" and picks up the current image.
# Builds the shared image first if it doesn't exist on this machine.
#
#   ./start-portal.sh --name acme
#   ./start-portal.sh --name acme --json

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

NAME=""
JSON_OUTPUT="false"

usage() {
  cat <<EOF2
Usage: $0 --name NAME [--json]

  --name NAME   Portal to start or restart (required).
  --json        Print a single JSON result line on stdout.
EOF2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) NAME="$2"; shift 2 ;;
    --json) JSON_OUTPUT="true"; shift ;;
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

PORT="$(grep -oE '"[0-9]+:3000"' "$(compose_file "$NAME")" | head -1 | grep -oE '^"[0-9]+' | tr -d '"')"

ensure_image_built "false"
log_info "Starting portal \"$NAME\" ..."
compose_up "$NAME"

HEALTHY="false"
if wait_for_healthy "$PORT"; then
  HEALTHY="true"
  log_ok "Portal \"$NAME\" is up and healthy at http://localhost:${PORT}/mcp"
else
  log_warn "Portal \"$NAME\" started but didn't report healthy within 15s. Check: docker logs $(container_name "$NAME")"
fi

if [[ "$JSON_OUTPUT" == "true" ]]; then
  printf '{"name":"%s","port":%s,"healthy":%s}\n' "$NAME" "$PORT" "$HEALTHY"
fi
