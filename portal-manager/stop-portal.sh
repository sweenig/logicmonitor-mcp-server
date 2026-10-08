#!/usr/bin/env bash
# Stop a portal's container without removing its config or vault entry.
# Use start-portal.sh to bring it back.
#
#   ./stop-portal.sh --name acme

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

NAME=""

usage() {
  cat <<EOF2
Usage: $0 --name NAME

  --name NAME   Portal to stop (required).
EOF2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) NAME="$2"; shift 2 ;;
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

log_info "Stopping portal \"$NAME\" ..."
compose_down "$NAME"
log_ok "Portal \"$NAME\" stopped."
