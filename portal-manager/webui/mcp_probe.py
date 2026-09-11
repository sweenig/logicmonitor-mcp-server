"""
Tests real LogicMonitor connectivity through a running portal's own MCP
server - not just "is the container up", but "can it actually reach and
authenticate to LogicMonitor right now". Speaks raw MCP JSON-RPC directly to
the portal's /mcp endpoint, the same way any other MCP client (Claude Code,
etc.) would - this exercises the actual container-to-LM path, not just the
credentials in the abstract.

list_collector_versions was chosen deliberately: confirmed by direct testing
against the real LogicMonitor API that it requires a valid Authorization
header (401 without one, 401 with a bad one) - not a field that happens to
work unauthenticated, which would give a false "it's working" result even
with missing/bad credentials.
"""

import requests

REQUEST_TIMEOUT_SECONDS = 10
PROBE_TOOL = "list_collector_versions"


def test_connectivity(port: int, mcp_bearer_token: str | None) -> dict:
    base_url = f"http://localhost:{port}/mcp"
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    if mcp_bearer_token:
        headers["Authorization"] = f"Bearer {mcp_bearer_token}"

    try:
        init_resp = requests.post(
            base_url,
            headers=headers,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "portal-manager-webui", "version": "1.0.0"},
                },
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        return {"ok": False, "message": f"Could not reach the portal's /mcp endpoint: {exc}"}

    if init_resp.status_code != 200:
        return {"ok": False, "message": f"initialize failed: HTTP {init_resp.status_code}"}

    session_id = init_resp.headers.get("Mcp-Session-Id")
    session_headers = dict(headers)
    if session_id:
        session_headers["Mcp-Session-Id"] = session_id

    try:
        requests.post(
            base_url,
            headers=session_headers,
            json={"jsonrpc": "2.0", "method": "notifications/initialized"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )

        call_resp = requests.post(
            base_url,
            headers=session_headers,
            json={
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {"name": PROBE_TOOL, "arguments": {"size": 1}},
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        return {"ok": False, "message": f"Could not complete the connectivity check: {exc}"}

    if call_resp.status_code != 200:
        return {"ok": False, "message": f"tools/call failed: HTTP {call_resp.status_code}"}

    body = call_resp.json()
    result = body.get("result") or {}
    content = result.get("content") or [{}]
    text = content[0].get("text", "") if content else ""

    if result.get("isError") or "error" in body:
        rpc_error = body.get("error", {}).get("message", "")
        return {"ok": False, "message": f"LogicMonitor API call failed: {(text or rpc_error)[:300]}"}

    return {"ok": True, "message": "Read-only connectivity to LogicMonitor confirmed."}
