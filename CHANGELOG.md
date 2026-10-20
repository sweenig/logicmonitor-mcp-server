# Changelog

## [v0.1.0] - 2025-12-04

### 📦 Other Changes
- Update changelog before release (71a4007)
- Add important pagination note to API tool documentation (a72cb91)
- Update modelcontextprotocol/sdk to 12.4.2 (d207e47)


All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `delete_resource_property` and `delete_resource_group_property` tools - delete a single custom property from a resource/device or resource group (`DELETE .../properties/{name}`) without replacing the whole property list
- `update_uptime_check` tool - partially update an LM Uptime web/ping check (host/domain, locations, interval, alert settings, HTTP steps) with the same default-settings rules as create
- `create_uptime_check` supports `checkType: "ping"` and internal checks
- `schedule_resource_discovery` tool - trigger Active Discovery on a resource/device via `POST /device/devices/{id}/scheduleAutoDiscovery`; classified read-only (it only requests a discovery run) so it is available in read-only mode
- `list_integration_logs` tool - list integration delivery/audit logs (alerts sent to ServiceNow/Slack/PagerDuty/webhooks/etc.), backed by `/setting/integrations/auditlogs`

### Changed
- `get_datasource` now returns a compact view when `fields` is not given: script bodies are replaced by a `<N chars; use get_datasource_scripts>` marker, datapoints are reduced to name, type, post-processor, `rawDataFieldName` and alert threshold fields (descriptions and parameters truncated at 300 characters), and alert message templates, per-datapoint housekeeping fields and expanded access groups are left out. On a real 37-datapoint DataSource this is about 27% of the raw size (the raw response exceeded the tool-result limit). Pass `fields` (for example `fields: "*"`) for the raw API response, or use `get_datasource_scripts` for the scripts. The tool description no longer lists a `dataSourceType` field (the API field is `collectMethod`)
- Tool calls missing a required argument (per the tool's `inputSchema`) are now rejected with a `MISSING_REQUIRED_FIELD` error before any request is built, and the API client refuses paths containing an unset ID (`/undefined`, `/null`, `/NaN`). Previously a call like `update_datasource` with no `dataSourceId` sent `PATCH /setting/datasources/undefined` to LogicMonitor
- `create_uptime_check` now follows the account default uptime checkpoints and alert settings unless told otherwise: external checks get explicit checkpoint IDs filled in (the API rejects empty `smgIds`), and `pollingInterval` is only sent when requested and switches the check to custom alert settings (LM ignores it otherwise)
- `update_datasource` description now notes that `hasMultiInstances` cannot be changed after creation (LogicMonitor limitation)

### Fixed
- Tool descriptions no longer point at tools that do not exist. 59 references to 31 names were stale: old `device` names (`list_device_instances`, `update_device_property`, `create_device_sdt`, ...), `search_*` names that are really `list_*` with a `query` argument, and tools that were never implemented (`create_user`, `update_user`, `create_api_token`, `generate_report`, `run_netscan`, `test_integration`, ...). References are corrected or removed, a 404 error suggestion no longer mentions `search_resources`, and `LOGICMONITOR-API-COVERAGE.md` no longer lists `search_resources`, `search_alerts` or `search_audit_logs`. A new test fails if any description names a tool that does not exist
- `get_resource_instance_data` no longer returns a misleading window when only one end of the time range is given. LogicMonitor answers a lone `start` with `start`..`start`+1h (not up to now, and without a truncation marker) and ignores a lone `end`. A lone `start` now ends at "now" and a lone `end` starts one hour earlier. The tool description also said the default window was the last 2 hours; it is about the last hour
- `get_widget_data` with a lone `start` now ends at "now" (LogicMonitor rejected it with HTTP 400 "Invalid time range"), and a lone `end` is rejected with a clear error instead of being silently ignored by LogicMonitor (which returned the widget's default window ending now)
- `update_resource_property` and `update_resource_group_property` can now add a property that doesn't exist yet. LogicMonitor's `PATCH .../properties/{name}` only updates existing properties (404 "Property(name=...) is not found"); on that specific 404 the tools now fall back to `POST .../properties`. Results include `action: "updated" | "created"`; other errors (including a missing device/group) are not retried. Tool descriptions now use the real `propertyName` parameter instead of `name`
- `create_datasource` now supports `hasMultiInstances` (create-only in LogicMonitor); previously it was silently dropped, producing unusable single-instance DataSources. Defaults to `true` when `enableAutoDiscovery` is `true`; an explicit `false` is respected

## [0.0.1] - Initial Release

### Added
- Initial implementation of LogicMonitor MCP Server
- 125 MCP tools for LogicMonitor operations
- Support for STDIO, SSE, and HTTP transports
- Multiple authentication options (no auth, bearer token, OAuth)
- Read-only mode for safe operations
- Rate limiting with exponential backoff
- Batch operations support
- TLS/HTTPS support
- Docker support

[Unreleased]: https://github.com/monitoringartist/logicmonitor-mcp-server/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/monitoringartist/logicmonitor-mcp-server/releases/tag/v0.0.1

