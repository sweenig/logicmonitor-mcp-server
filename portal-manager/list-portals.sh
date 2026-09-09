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
  env="$(env_file "$name")"
  compose="$(compose_file "$name")"
  [[ -f "$env" && -f "$compose" ]] || continue

  readonly_val="$(get_env_var "$env" "MCP_READ_ONLY")"
  port="$(grep -oE '"[0-9]+:3000"' "$compose" | head -1 | grep -oE '^"[0-9]+' | tr -d '"')"
  has_bearer="false"
  [[ -n "$(get_env_var "$env" "MCP_BEARER_TOKEN")" ]] && has_bearer="true"

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
    printf '  {"name": "%s", "port": %s, "readOnly": %s, "authenticated": %s, "status": "%s"}' \
      "$name" "$port" "$readonly_val" "$has_bearer" "$status"
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
    mode="read-write"
    [[ "$readonly_val" == "true" ]] && mode="read-only"
    auth="none"
    [[ "$has_bearer" == "true" ]] && auth="bearer token"
    printf "%-20s %-6s %-10s %-14s %s\n" "$name" "$port" "$mode" "$auth" "$status"
  done
fi
