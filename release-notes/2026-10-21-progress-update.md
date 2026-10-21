# LogicMonitor MCP Server: Progress Update

**October 12–21, 2026**

Over this period we've expanded what the LogicMonitor MCP server can do and made it noticeably more reliable. Highlights:

## New capabilities
- **Website monitoring:** a full suite of tools for websites and website groups, including checkpoint data.
- **NetScans:** rebuilt around the real LogicMonitor API, with new NetScan group tools.
- **Uptime checks:** support for LM Uptime ping and internal checks, plus the ability to update them.
- **ConfigSources:** create, update, delete, and view scripts.
- **Discovery:** a new tool to kick off resource discovery on demand.
- **Properties:** property updates now upsert, and delete-property tools are available.
- **Alert rules:** new alert rule instance support.

## Smarter, faster responses
- Create and update tools return concise results by default, with an option for the full record.
- Datasource lookups return a compact view by default.
- Debug and script tools now wait for their output instead of returning early.
- Instance data handling is hardened, with better paging, summaries, and CSV output.

## Reliability and clarity
- Clearer error messages for invalid arguments and permission problems (403s).
- Tool descriptions now match what the tools actually do.
- Write operations require an explicit write scope under OAuth.
- Portals running an outdated image are flagged in the portal list and web UI.
- Retired the legacy service and service group tools.

More to come as we keep building out coverage and polish.
