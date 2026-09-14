#!/usr/bin/env bash
# Stop and permanently remove a portal's container and local config.
# This does NOT touch anything in LogicMonitor itself - only this machine's
# container and generated files for that portal.
#
#   ./remove-portal.sh --name acme
#   ./remove-portal.sh --name acme --yes   # skip confirmation (for scripting)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

NAME=""
SKIP_CONFIRM="false"

usage() {
  cat <<EOF
Usage: $0 --name NAME [--yes]

  --name NAME   Portal to remove (required).
  --yes         Skip the confirmation prompt.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) NAME="$2"; shift 2 ;;
    --yes) SKIP_CONFIRM="true"; shift ;;
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

if [[ "$SKIP_CONFIRM" != "true" ]]; then
  echo "This will stop the container and permanently delete $(portal_dir "$NAME") (including its LM_BEARER_TOKEN)." >&2
  read -r -p "Type the portal name (\"$NAME\") to confirm: " CONFIRM
  if [[ "$CONFIRM" != "$NAME" ]]; then
    log_error "Confirmation did not match. Aborted - nothing was removed."
    exit 1
  fi
fi

log_info "Stopping portal \"$NAME\" ..."
compose_down "$NAME" || log_warn "docker compose down failed or container was already stopped."

rm -rf "$(portal_dir "$NAME")"
log_ok "Portal \"$NAME\" removed."

if remove_mcp_json_entry "$NAME"; then
  log_ok "Removed \"logicmonitor-${NAME}\" from $MCP_JSON_FILE"
fi
