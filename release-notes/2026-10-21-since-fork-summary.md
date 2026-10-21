# LogicMonitor MCP Server: What's New Since the Fork

**September 9 – October 21, 2026**

Since forking the original LogicMonitor MCP server, we've grown it from a read-focused toolkit into a broad, safer, and easier-to-manage platform for working with LogicMonitor. Highlights:

## New capabilities
- **Content management:** create, update, and delete DataSources and ConfigSources, including their scripts. Browse PropertySources.
- **Collectors:** manage collectors, collector groups, and their properties, review collector events, and run debug and script commands on collectors.
- **Websites and uptime:** a complete website and website group tool suite, checkpoint data, and LM Uptime web, ping, and internal checks.
- **Discovery:** on-demand resource discovery and a rebuilt NetScan toolset with NetScan groups.
- **Alerting and configuration:** group-level thresholds, alert rule instances, integration logs, and property upsert and delete.
- **Instance data:** more dependable results with CSV output, paging, summaries, and flexible time ranges.

## Portal management
- A web UI for managing portal containers, with container control and one-click `.mcp.json` updates.
- A quick-start guide, re-runnable setup, and easier moves to a different server.
- Portals running an outdated image are flagged automatically.

## Safer and easier to use
- Read-only mode is enforced when a tool runs, and OAuth requires a write scope for every write tool.
- Filters now work with numeric and boolean values, and bad requests fail early with actionable guidance.
- Create and update tools return concise results by default, with an option for the full record.
- Debug and script tools wait for their output.
- Clearer error messages, accurate tool descriptions, and a built-in knowledge base of verified LogicMonitor behavior.
- Dependency security updates and retirement of the legacy service tools.

The work continues, with more coverage and polish on the way.
