#!/usr/bin/env bash
# List all portals managed by this toolset, their port, RO/RW mode, and
# whether their container is currently running.
#
#   ./list-portals.sh
#   ./list-portals.sh --json

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

JSON="false"
if [[ "${1:-}" == "--json" ]]; then
  JSON="true"
fi

mkdir -p "$PORTALS_DIR"

rows=()
for dir in "$PORTALS_DIR"/*/; do
  [[ -d "$dir" ]] || continue
  name="$(basename "$dir")"
  enc="$(enc_file "$name")"
  compose="$(compose_file "$name")"
  [[ -f "$enc" && -f "$compose" ]] || continue

  port="$(grep -oE '"[0-9]+:3000"' "$compose" | head -1 | grep -oE '^"[0-9]+' | tr -d '"')"

  if ! check_env_readable "$name"; then
    # Permission denied is reported loudly (check_env_readable already wrote
    # to stderr) and flagged in its own row - NOT silently shown as
    # read-write/no-auth, which would be actively misleading.
    rows+=("$name|$port|ERROR|ERROR|permission denied reading secrets")
    continue
  fi

  readonly_val="$(get_encrypted_env_var "$name" "MCP_READ_ONLY")"
  has_bearer="false"
  [[ -n "$(get_encrypted_env_var "$name" "MCP_BEARER_TOKEN")" ]] && has_bearer="true"

  status="stopped"
  if docker inspect "$(container_name "$name")" > /dev/null 2>&1; then
    running="$(docker inspect -f '{{.State.Running}}' "$(container_name "$name")" 2>/dev/null || echo "false")"
    if [[ "$running" == "true" ]]; then
      health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' "$(container_name "$name")" 2>/dev/null || echo "n/a")"
      status="running ($health)"
    fi
  fi

  rows+=("$name|$port|$readonly_val|$has_bearer|$status")
done

if [[ "$JSON" == "true" ]]; then
  echo "["
  first="true"
  for row in "${rows[@]:-}"; do
    [[ -z "$row" ]] && continue
    IFS='|' read -r name port readonly_val has_bearer status <<< "$row"
    [[ "$first" == "false" ]] && echo ","
    first="false"
    if [[ "$readonly_val" == "ERROR" ]]; then
      printf '  {"name": "%s", "port": %s, "error": "%s"}' "$name" "$port" "$status"
    else
      printf '  {"name": "%s", "port": %s, "readOnly": %s, "authenticated": %s, "status": "%s"}' \
        "$name" "$port" "$readonly_val" "$has_bearer" "$status"
    fi
  done
  echo ""
  echo "]"
else
  if [[ "${#rows[@]}" -eq 0 ]]; then
    echo "No portals found in $PORTALS_DIR/. Run add-portal.sh to create one."
    exit 0
  fi
  printf "%-20s %-6s %-10s %-14s %s\n" "NAME" "PORT" "MODE" "AUTH" "STATUS"
  for row in "${rows[@]}"; do
    IFS='|' read -r name port readonly_val has_bearer status <<< "$row"
    if [[ "$readonly_val" == "ERROR" ]]; then
      printf "%-20s %-6s %-10s %-14s %s\n" "$name" "$port" "ERROR" "ERROR" "$status"
      continue
    fi
    mode="read-write"
    [[ "$readonly_val" == "true" ]] && mode="read-only"
    auth="none"
    [[ "$has_bearer" == "true" ]] && auth="bearer token"
    printf "%-20s %-6s %-10s %-14s %s\n" "$name" "$port" "$mode" "$auth" "$status"
  done
fi
