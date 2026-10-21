# LogicMonitor Websites (synthetic checks): types, locations, and how to create them

A **website** in LogicMonitor's REST API (`/website/websites`) is a synthetic check that tests a service from outside the monitored device. Websites live in **website groups** (`/website/groups`), which are folders that can be nested (`parentId`; 1 is the root group). Two independent choices define every website:

| Choice | Values | Meaning |
|---|---|---|
| **Type** (`type`) | `webcheck`, `pingcheck` | What is tested: an HTTP/HTTPS request (`webcheck`) or an ICMP ping (`pingcheck`). |
| **Location** (`isInternal`) | `false` (external), `true` (internal) | Where the test runs from: LogicMonitor's cloud checkpoints (external) or your own collectors (internal). |

Any combination is valid: external web check (public site from the internet), external ping check (public host reachability), internal web check (private app from inside your network), internal ping check (private host from a collector).

## Type: what each one needs

**`webcheck`** (HTTP/HTTPS)
- `domain`: the base URL host, for example `www.example.com`, without the scheme.
- `schema`: `https` (default) or `http`.
- `steps`: one or more HTTP steps. Each step has `url` (path, for example `/` or `/health`), `HTTPMethod` (GET, HEAD, POST), `statusCode` (expected code or pattern), optional `keyword` with `matchType` and `invertMatch`, `HTTPHeaders`, `HTTPBody`, `followRedirection`, `timeout` (seconds), `requireAuth` with `auth`. A webcheck with no steps is rejected, so `create_website` adds one default step (GET `/`) when you give none.
- SSL and speed: `ignoreSSL`, `triggerSSLStatusAlert`, `triggerSSLExpirationAlert`, `alertExpr` (days before certificate expiry), `pageLoadAlertTimeInMS` (slowest acceptable page load).

**`pingcheck`** (ICMP)
- `host`: hostname or IP, without a scheme.
- `count`: packets per check; `percentPktsNotReceiveInTime` and `timeoutInMSPktsNotReceive` define when a packet counts as lost (a packet is late after the timeout; the check alerts when more than this percentage is lost or late).
- No steps, no domain, no SSL settings.

## Location: external vs internal

**External** (`isInternal: false`)
- Runs from LogicMonitor SiteMonitor checkpoints around the world (`list_website_checkpoints` lists them; each has an `id`, which is its `smgId`).
- `testLocation.smgIds`: which checkpoints to use. With no `smgIds` the website follows the account default locations (`useDefaultLocationSetting: true`).
- Use for public services: anything reachable from the internet.
- Needs no collector. Cannot reach private addresses.
- The response lists one checkpoint per location plus an "Overall" checkpoint (smgId 0) that aggregates them.

**Internal** (`isInternal: true`)
- Runs from one or more of your collectors, so it can reach private hosts and applications.
- `testLocation.collectorIds`: required, the collectors that run the check (`list_collectors`).
- Cannot be combined with `smgIds`; an internal website's status is `dead-collector` if its collectors are down.
- In the response each collector appears as a checkpoint whose `smgId` is the collector ID, and the web check's first step has type `script` (LogicMonitor sets this for internal web checks).
- Use for private apps, VPN-only services, and internal hosts.

Rule of thumb: if LogicMonitor's cloud can reach the target, use external; otherwise internal.

## Alerting and timing

- `pollingInterval`: minutes between checks, 1 to 10.
- `transition`: how many consecutive failed checks before an alert (1 to 10, 30 or 60).
- `overallAlertLevel` (`warn`, `error`, `critical`) with `globalSmAlertCond`: the level raised when a check fails from the number of locations given by `globalSmAlertCond` (0 = all locations).
- `individualSmAlertEnable` and `individualAlertLevel`: also alert when a single location fails.
- `useDefaultAlertSetting`: follow the account's website default alert settings. LogicMonitor ignores the other alert fields while this is true.
- `disableAlerting` mutes alerts but keeps collecting; `stopMonitoring` stops the checks entirely, and LogicMonitor then also turns alerting off for the website (the response shows `disableAlerting: true`).

## Website groups

- Folders for websites, nestable through `parentId` (1 = root). Create with `create_website_group`, rename or move with `update_website_group`, delete with `delete_website_group`. A group can only be deleted when it is empty: while it holds websites or subgroups LogicMonitor answers HTTP 403 "Please delete all websites and subfolders in this folder first", so move or delete those first. (The API documents a `deleteChildren` option, but on the portals tested it makes the request fail with HTTP 404, so the tool does not offer it.) Moving a group (`update_website_group` with `parentId`) and moving a website (`update_website` with `groupId`) both work.
- A website's folder is its `groupId`. List a folder's websites with `list_website_group_websites`, or `list_websites` with `filter: groupId:<id>`.
- A group can carry default `testLocation`, `disableAlerting`, `stopMonitoring` and properties that its websites inherit.

## Not the same as LM Uptime

`create_uptime_check` / `update_uptime_check` manage LM Uptime checks, which are created through the devices API (`/device/devices`) and appear as resources of type uptime web or ping check. The website tools described here manage the classic Website monitors under `/website/*`. The two use the same vocabulary (external/internal, web/ping) but are different objects with different IDs.

## Quick recipes

- External web check: `create_website {name, type: "webcheck", domain: "www.example.com"}`
- External ping check: `create_website {name, type: "pingcheck", host: "198.51.100.10"}`
- Internal web check: `create_website {name, type: "webcheck", domain: "intranet.corp.local", isInternal: true, testLocation: {collectorIds: [12]}}`
- Internal ping check: `create_website {name, type: "pingcheck", host: "10.0.0.5", isInternal: true, testLocation: {collectorIds: [12]}}`
- Pause a website: `update_website {websiteId, stopMonitoring: true}`
