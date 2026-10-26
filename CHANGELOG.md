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
- `create_datasource` / `update_datasource` accept `useWildValueAsUUID` ("use wildvalue as unique identifier"); the client sends the `forceUniqueIdentifier=true` query parameter LogicMonitor requires, using a PUT of the current definition when turning it on for an existing DataSource (LogicMonitor ignores the parameter on PATCH). Turning it off on a DataSource with instances needs the one-time `forceRestrictedChangeKey` from the error, which `update_datasource` accepts
- `test_datasource` tool - runs a saved script/batchscript DataSource's Active Discovery and collection scripts against a resource (on its preferred collector, refusing one that is down) and shows each datapoint's value per instance for the namevalue/none post-processors
- `lm://knowledge/script-datasource` resource - how to build script and batchscript DataSources (output formats, appliesTo, thresholds, scaling, graphs, testing, web-page scraping)
- `get_datasource` `datapointsOnly` option returning just the trimmed datapoint list
- `create_datasource` defaults `collectorAttribute.name` from `collectMethod`, the unused script fields to `""`, and for `autoDiscoveryConfig` an empty-string `instanceAutoGroupMethodParams` (null previously caused a 500), `method.name:"ad_script"`, `method.type:"embeded"` and `filters:[]`; `update_datasource` applies the name and null fixes only. `update_datasource` returns a `warning` when datapoints are sent without an `id`
- Missing-required-argument errors now list the unrecognized arguments received and all accepted parameter names
- `delete_resource_property` and `delete_resource_group_property` tools - delete a single custom property from a resource/device or resource group (`DELETE .../properties/{name}`) without replacing the whole property list
- `update_uptime_check` tool - partially update an LM Uptime web/ping check (host/domain, locations, interval, alert settings, HTTP steps) with the same default-settings rules as create
- `create_uptime_check` supports `checkType: "ping"` and internal checks
- `schedule_resource_discovery` tool - trigger Active Discovery on a resource/device via `POST /device/devices/{id}/scheduleAutoDiscovery`; classified read-only (it only requests a discovery run) so it is available in read-only mode
- `list_integration_logs` tool - list integration delivery/audit logs (alerts sent to ServiceNow/Slack/PagerDuty/webhooks/etc.), backed by `/setting/integrations/auditlogs`

### Added
- Website suite: `create_website` and `update_website` rewritten for web (HTTP/HTTPS) and ping (ICMP) checks, internal (collector) and external (cloud checkpoint) locations, steps and alert settings; `create_website_group`, `update_website_group` (also moves a group), `delete_website_group` (the group must be empty; the API's `deleteChildren` option answers HTTP 404 and is not offered); `list_website_alerts`, `list_website_properties`, `list_website_sdts`, `list_website_group_websites`, `list_website_group_sdts`; MCP resource `lm://knowledge/websites`
- `get_website_checkpoint_data`: recent check results of one website checkpoint as rows of {time, datapoint: value}
- `create_alert_rule` / `update_alert_rule` accept `instance` (with a specific datasource it must match a real instance of it)
- HTTP 403 errors that describe the state of an object (for example deleting a non-empty website group) now show LogicMonitor's message with a matching hint instead of the generic token advice; permission and token 403s are unchanged
- Fixed: `fields="*"` is no longer sent to the API (some endpoints, such as `get_website`, took it literally and returned an empty object)

### Added
- NetScans: `create_netscan` and `update_netscan` rewritten for the three methods (`nmap`, `script`, `enhancedScript`) with schedules, duplicate handling, discovered-device rules, credentials, filters, update policy and NetScan groups (they previously omitted the required `method` and used the wrong field names, so creating a scan could not succeed); new tools `list_netscan_groups`, `create_netscan_group`, `update_netscan_group`, `delete_netscan_group`; MCP resource `lm://knowledge/netscans`; `delete_netscan_group` deletes the scans in the group too (the API does not refuse), which the tool description and the knowledge resource now state

### Fixed
- Arguments rejected by the server's own checks (for example a missing `subnet`, an invalid website setting) are now reported as INVALID_PARAMETERS with a note to fix the argument, instead of generic advice about credentials and server logs

### Removed
- The ten legacy `*_service` and `*_service_group` tools (`list_services`, `get_service`, `create_service`, `update_service`, `delete_service`, `list_service_groups`, `get_service_group`, `create_service_group`, `update_service_group`, `delete_service_group`). They called the pre-v3 `/service/*` endpoints, which reject `X-Version: 3` (HTTP 415) and return website monitors rather than business services; use the website tools instead

### Changed
- Report tool descriptions: report groups are a flat, single level of folders; each report carries its group as `groupId` (filter `list_reports` with `groupId:<id>`); `reportsCount` on groups is not reliable
- Alert rules: `create_alert_rule` / `update_alert_rule` now apply `deviceGroups`, `datasource`, `datapoint` and `severity` (all, warn, error, critical), and send the datasource filter as the API field `datasource` (before, `datasources` was sent and ignored)
- OpsNotes: tags may be plain strings (sent as `{name}` objects, which is what the API requires); array arguments that clients send as JSON strings are parsed; `create_opsnote` / `update_opsnote` accept `deviceId`, `deviceGroupId` and `websiteId` (turned into scopes); `update_opsnote` accepts `happenOnInSec`; descriptions use epoch seconds
 `sharable` and `widgetTokens` on `create_dashboard`; `widgetsConfig` and `widgetTokens` on `update_dashboard`
- Removed descriptions of parameters that do not exist in the LogicMonitor API (access group membership, recipient `schedule`/`rateLimit`, escalation chain `enabled`, alert rule `enabled`, `alertStatus`, resource datasource `pollingInterval`/`customProperties`)
- `create_datasource` lists `displayName` as required (the API returns HTTP 400 without it)
- `update_datasource` keeps each existing datapoint's `originId` when the caller sends the datapoint with its `id` but without an `originId` (LogicMonitor otherwise blanks it)
- `create_alert_rule` / `update_alert_rule` now send the escalation chain as the API field `escalatingChainId`; before, `escalationChainId` was sent and the chain was not set
- Tool descriptions: recipient `addr`, recipient group `recipientIds`, dashboard `dashboardId`, integration `extra` and `delete_resource_group` `deleteChildren` now match the schemas; tools whose descriptions mention parameters they do not accept now say so in a "Not supported yet" note; `update_dashboard` accepts `groupId` and `sharable`, `update_website` accepts `domain`, `groupId` and `stopMonitoring`
- A test now checks every documented parameter against the tool's input schema
- OAuth scope enforcement: every tool that is not read-only now requires `lm:write` (or a more specific write scope) instead of just `mcp:tools`; the scope table uses real tool names. Tokens that only carry `mcp:tools` can no longer call write tools. Bearer-token deployments are unaffected.
- `create_*` and `update_*` tools return a shortened result when the response is large (over about 3,000 characters): scalar fields and small values are kept and large nested parts are listed under `omitted`. Pass `returnFull: true` for the complete object. Batch results are unchanged.
- `execute_debug_command`, `execute_groovy_script` and `execute_powershell_script` now wait for the command's output and return it in the same call. LogicMonitor runs debug commands asynchronously (the start request never returns output, even for `help`), so callers previously had to poll `get_debug_command_result` by hand and treat the interim HTTP 202 / errorCode 1202 answer as an error. The result is now `{ output, sessionId, pending }`; `waitSeconds` (default 30, maximum 120, `0` = return the `sessionId` at once) controls the wait, and a command that is still running comes back as `pending: true` with its `sessionId`. `get_debug_command_result` gains `waitSeconds` (default 0) and reports a running command as `pending: true` instead of an error-shaped body. The command line (the whole script) is no longer echoed back unless `includeCommand` is true. Numbers and booleans sent as strings (`"0"`, `"false"`), which some MCP clients do, are accepted for these options instead of silently falling back to the defaults. The `get_debug_command_result` description and `LOGICMONITOR-DEBUG-COMMANDS.md` note that a finished session's output is delivered once (asking again returns `cancelled`). Tool descriptions and `LOGICMONITOR-DEBUG-COMMANDS.md` now say that standard error is not returned (only standard output and a `returns N` line)
- `get_datasource` now returns a compact view when `fields` is not given: script bodies are replaced by a `<N chars; use get_datasource_scripts>` marker, datapoints are reduced to name, type, post-processor, `rawDataFieldName` and alert threshold fields (descriptions and parameters truncated at 300 characters), and alert message templates, per-datapoint housekeeping fields and expanded access groups are left out. On a real 37-datapoint DataSource this is about 27% of the raw size (the raw response exceeded the tool-result limit). Pass `fields` (for example `fields: "*"`) for the raw API response, or use `get_datasource_scripts` for the scripts. The tool description no longer lists a `dataSourceType` field (the API field is `collectMethod`)
- Tool calls missing a required argument (per the tool's `inputSchema`) are now rejected with a `MISSING_REQUIRED_FIELD` error before any request is built, and the API client refuses paths containing an unset ID (`/undefined`, `/null`, `/NaN`). Previously a call like `update_datasource` with no `dataSourceId` sent `PATCH /setting/datasources/undefined` to LogicMonitor
- `create_uptime_check` now follows the account default uptime checkpoints and alert settings unless told otherwise: external checks get explicit checkpoint IDs filled in (the API rejects empty `smgIds`), and `pollingInterval` is only sent when requested and switches the check to custom alert settings (LM ignores it otherwise)
- `update_datasource` description now notes that `hasMultiInstances` cannot be changed after creation (LogicMonitor limitation)

### Fixed
- `list_collectors` and `get_collector` descriptions now match the API. `status` is the registration status (0 unregistered, 1 registered, 2 stopped, 3 suspended), not alive/dead, so the suggested `filter:"status:alive"` silently matched nothing; the up/down flag is `isDown` (`filter:"isDown:false"`). Removed the promised `lastHeartbeatTime`, free disk space and CPU/memory fields, which are not on the collector object (they come from the collector host's own DataSources, found through `collectorDeviceId`). `numberOfInstances` is now documented: it is only maintained for collectors in auto-balanced collector groups (0 elsewhere) and about one per host below the true count. `list_collectors` now returns `isDown`, `build`, `numberOfInstances`, `collectorGroupName` and `collectorDeviceId` by default (the description already promised the build version)
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

