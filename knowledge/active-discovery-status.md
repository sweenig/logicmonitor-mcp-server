# Checking whether an Active Discovery run has finished, failed or not started

Read this after `schedule_resource_discovery`, or whenever a DataSource's instance list is empty and you need to know why.

## The problem

`schedule_resource_discovery` returns an empty acknowledgement, and `list_resource_datasources` / `get_resource_datasource` show only `nextAutoDiscoveryOn` and instance counts. None of them says whether a run happened, failed, or is still queued, so an empty instance list looks the same in all three cases.

The collector knows. Ask it with a debug command (`execute_debug_command`, on the collector that monitors the resource; `get_resource` gives `preferredCollectorId`). This needs a portal whose MCP allows `execute_debug_command`; a read-only portal cannot.

## Step 1: list the discovery tasks

```
!adlist h=<hostname or IP> ds=<DataSource name>
```

`h` and `ds` take a wildcard (`h=paz*`). Other filters: `status=WAITING|EXECUTING|DONE|FAILED|EMPTY`, `method=ad_script`, `type=ad|get`. With no filters the output is every task the collector still holds, which is large.

Example (haservicestest, collector 129, `!adlist h=10.0.0.92 ds=Oracle_MySQL_Troubleshooter`):

```
id                 last update time     method       status   wait/exec(ms)  hostname    datasource                   Message
17949361989650012  2026-11-17 17:23:44  ad_script    DONE     1/10           10.0.0.92   Oracle_MySQL_Troubleshooter  OK (2 instances reported)
17949366940650086  2026-11-17 17:32:25  ad_script    DONE     0/3            10.0.0.92   Oracle_MySQL_Troubleshooter  OK (2 instances reported)
```

How to read it:

- **status** is the state of that task: `WAITING` (queued), `EXECUTING` (running), `DONE`, `FAILED`, or `EMPTY` (the run succeeded and reported no instances).
- **last update time** is when that task last changed (for a finished task, when it finished), in the collector's clock (GMT here). Compare it with the `scheduledAt` your `schedule_resource_discovery` call returned, allowing a few seconds either way: the portal stamps `scheduledAt` after its API call returns, and the collector can already be running (a finished row 3 seconds before `scheduledAt` was the run you asked for).
- **id** starts with the id of the batch that created it. A request to discover a resource creates one task per DataSource on it, all sharing that prefix (for example `1794937188387...`), so rows with the same prefix belong to the same request.
- **Message** is `OK (N instances reported)` on success, or the error text on failure.
- **wait/exec(ms)** is time queued / time running.
- Each row is one run, so a DataSource that discovers every 20 minutes has many rows. Look at the newest.

Statuses `DONE`, `FAILED` and `EMPTY` were seen live; `WAITING` and `EXECUTING` are from the command's own usage text.

## Step 2: decide

| What you see | Meaning | Do |
|---|---|---|
| No row at or after `scheduledAt` (minus a few seconds) | Not run yet, or your DataSource's turn in the batch has not finished. The collector works through the resource's DataSources one after another: on a host with about 25 of them the batch took about a minute, and a DataSource's row appears when its own task finishes | Wait a minute or two and run `!adlist` again. A task still queued shows `WAITING` |
| `WAITING` or `EXECUTING` | Queued or running | Wait |
| `DONE`, `OK (N instances reported)` with N above 0 | Finished, found instances | `list_resource_instances` |
| `EMPTY`, `OK (0 instances reported)` | Finished, the script or filter returned nothing | Not a failure. Check the Active Discovery script, the discovery filters and the properties it reads (`test_datasource` shows the script output) |
| `FAILED` | The run failed; Message holds the reason | Fix that error, then schedule again |
| No row for this host and DataSource at all | The DataSource has not applied to the resource, or Active Discovery is off for it | `list_resource_datasources`, then check `appliesTo` and the discovery settings |

To find every failed run on a collector: `!adlist status=FAILED`. Examples seen live: `SQLException: Access denied for user ...`, `ConnectException: Connection refused`, `SNMPOidNotExistException: ...`, `Groovy script is invalid.`

## Step 3: get the detail of one task

```
!adetail <task id>
```

Use the `id` from `!adlist` (or the parent id, the `pid` column). It shows the status, time taken, `Error message`, the discovered instances (alias, value, description, props), and the collector's log line for the task. Output is long because it first prints every property of the host, so use it for one task, not in a loop. Credentials in properties are masked (`****`).

## Workflow

1. `schedule_resource_discovery` (note `scheduledAt`).
2. `!adlist h=<host> ds=<DataSource>` until a row is newer than `scheduledAt` and its status is not `WAITING` or `EXECUTING`.
3. `DONE`: `list_resource_instances`. `EMPTY`: see the table. `FAILED`: read Message, `!adetail` for more.

## Related

- `lm://docs/debug-commands` has the syntax of `!adlist`, `!adetail`, `!aplist` and `!apdetail` (the same pair for AutoProps / PropertySource tasks).
- `lm://knowledge/script-datasource` for building and testing the discovery script.
- `lm://knowledge/dynamic-groups-and-auto-properties` for why a discovery run does not change group membership at once.
