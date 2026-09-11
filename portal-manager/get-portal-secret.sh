#!/usr/bin/env bash
# Prints a single decrypted secret value from a portal's env store to stdout.
# Intended for programmatic callers only (e.g. the webui, after its own
# re-authentication check) - deliberately has no confirmation prompts or
# human-readable output, just the raw value or a non-zero exit.
#
#   ./get-portal-secret.sh --name acme --key MCP_BEARER_TOKEN

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

NAME=""
KEY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) NAME="$2"; shift 2 ;;
    --key) KEY="$2"; shift 2 ;;
    -h|--help) echo "Usage: $0 --name NAME --key KEY" >&2; exit 0 ;;
    *) log_error "Unknown argument: $1"; exit 1 ;;
  esac
done

if [[ -z "$NAME" || -z "$KEY" ]]; then
  log_error "Both --name and --key are required."
  exit 1
fi
require_portal_exists "$NAME"

get_encrypted_env_var "$NAME" "$KEY"
