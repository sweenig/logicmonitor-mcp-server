# LogicMonitor NetScans (network discovery scans): methods, settings and how to create them

A **NetScan** (`/setting/netscans`) finds devices automatically and adds them to monitoring, once or on a schedule. Every NetScan runs on one **collector**, belongs to one **NetScan group** (`nsgId`), and has a **method** that decides how devices are found. The method is fixed when the scan is created.

## Methods

| method | How devices are found | Needs |
|---|---|---|
| `nmap` | The collector probes every address in a subnet or IP range (ICMP ping plus a port scan). | `subnet`; optional `exclude`, `ports`, `includeNetworkAndBroadcast`, `credentials`, `ddr` |
| `script` | A script, or a CSV file, on the collector lists the devices to add. | `scriptType` `embeded` with `groovyScript`, or `external` with `scriptPath` |
| `enhancedScript` | Like `script`, plus credentials, filters on the reported devices, and a policy for updating devices that already exist. | script settings, plus optional `credentials`, `filters`, `resourceUpdateCriteria` |

EC2 scans (`nec2`) exist in the API, but LogicMonitor says cloud resources must be onboarded through the cloud monitoring setup rather than a NetScan, so the tools do not offer them.

## Settings that apply to every method

- `collectorId`: the collector that runs the scan (`list_collectors`). Required.
- `schedule`: `{type, cron, timezone, notify, recipients}`. `type` is `manual` (runs only when started in the UI), `hourly`, `daily`, `weekly` or `monthly`. Anything other than `manual` needs a `cron` expression such as `00 04 * * *` (LogicMonitor answers "invalid schedule" without one). The scan reports `nextStart` for timed schedules.
- `duplicate`: how devices that already exist are skipped. `type` 1 = any monitored device (default), 2 = already found by this scan, 3 = devices in the given `groups`, 4 = devices on the given `collectors`.
- `nsgId`: the NetScan group. It must exist (`list_netscan_groups`; `create_netscan_group` makes one); the default is `@default` (id 1). A group name cannot be given instead.
- `defaultGroup`: the resource group that discovered devices are added to (`list_resource_groups`).

## nmap details

- `subnet`: a CIDR such as `10.0.1.0/24` or an IP range. `exclude` lists addresses to skip.
- `ports`: LogicMonitor always needs a port setting; leave it out to use the default list, or pass a comma-separated list such as `22,443` to probe only those.
- `ddr` (discovered-device rules): `changeName` sets how a device is named (`##IPADDRESS##`, `##REVERSEDNS##`) and `assignment` lists rules that include or exclude devices into resource groups. `defaultGroup` builds one include-everything rule for you.
- `credentials`: `{deviceGroupId}` or `{deviceId}` to inherit the SNMP/WMI/SSH credentials of a group or device, and/or `custom` and `snmpV3Credentials` lists.

## script and enhancedScript details

- `scriptType: "embeded"` (LogicMonitor's own spelling; "embedded" is accepted) keeps the script text in `groovyScript`; `"external"` names a script or CSV file on the collector in `scriptPath`. `groovyScriptParams` and `scriptParams` pass parameters.
- enhancedScript only: `filters` is a list of `{attribute, operation, value}` conditions applied to what the script reports; `resourceUpdateCriteria` is `{type, groups, collectors}` where type 1 updates all existing devices, 2 (default) only devices this scan found, 3 devices in the groups, 4 devices on the collectors, 5 none.

## NetScan groups

Folders for scans: `list_netscan_groups`, `create_netscan_group`, `update_netscan_group`, `delete_netscan_group`. **Deleting a group also deletes every scan inside it** (LogicMonitor does not refuse; verified on a live portal). Move scans you want to keep with `update_netscan` and `nsgId` first. Devices that the scans already discovered stay in monitoring.

## Recipes

- Nightly subnet scan: `create_netscan {name: "Datacenter A", method: "nmap", collectorId: 12, subnet: "10.0.1.0/24", defaultGroup: 345, schedule: {type: "daily", cron: "00 02 * * *", timezone: "America/New_York"}}`
- CSV import: `create_netscan {name: "Branch import", method: "script", collectorId: 12, scriptType: "external", scriptPath: "branches.csv"}`
- Scripted discovery: `create_netscan {name: "Meraki", method: "enhancedScript", collectorId: 12, groovyScript: "...", defaultGroup: 345}`
- Change the schedule: `update_netscan {netscanId, schedule: {type: "weekly", cron: "00 00 * * 0", timezone: "America/New_York"}}`
