# Building a script DataSource

Two shapes: a **single-instance** script (`collectMethod:"script"`) and a **multi-instance batchscript** (`collectMethod:"batchscript"`) with Active Discovery (AD). Create with `create_datasource`; try it with `test_datasource` (runs the saved DataSource against a resource and shows values per instance); change it with `update_datasource`.

`create_datasource` fills in what LogicMonitor requires for script DataSources: `collectorAttribute.name` (= collectMethod), empty `linuxCmdline/linuxScript/windowsCmdline/windowsScript`, and in `autoDiscoveryConfig` an empty-string `instanceAutoGroupMethodParams`, `method.name:"ad_script"`, `method.type:"embeded"` (LogicMonitor really spells it that way) and `filters:[]`.

On `update_datasource`, `autoDiscoveryConfig` can be partial: send only what changes (`{"filters":[...]}`, `{"scheduleInterval":30}`, or `{"method":{"groovyScript":"..."}}`) and the tool fills the rest from the saved config. LogicMonitor itself replaces the whole block and answers 400 when the discovery method is missing, so without this a one-line filter change would mean resending the entire AD script. `filters` is a list and replaces the saved one (send `[]` to clear it). An instance-name filter looks like `{"attribute":"##WILDALIAS##","operation":"NotEqual","value":"1. Client Template","comment":"why"}`.

## Single instance

The script prints `metric=value` lines.

```
collectMethod: "script", collectInterval: 300
collectorAttribute: { scriptType: "embed", groovyScript: "println 'metric=42'" }
dataPoints: [{ name: "metric", type: 2, dataType: 7,
               postProcessorMethod: "namevalue", postProcessorParam: "metric",
               rawDataFieldName: "output", description: "...unit..." }]
```

## Multi instance (batchscript + Active Discovery)

Collection script prints `<wildvalue>.<metric>=<value>`, one line per instance and metric. Datapoints use `postProcessorParam: "##WILDVALUE##.<metric>"`.

The AD script prints one line per instance:

```
wildvalue##wildalias##description####url-encoded-props
```

The four `#` before the properties are intentional: the fourth field (wildvalue2) is left empty. Use a **stable, unique id** as wildvalue (not a free-text name that can change or collide); put the readable name in wildalias.

```
enableAutoDiscovery: true   (hasMultiInstances then defaults to true; it cannot be changed later)
autoDiscoveryConfig: { method: { groovyScript: "println 'id1##Name 1##desc####'" } }
```

To let users control which instances are kept without editing the DataSource, make the discovery filters read properties (`<DataSourceName>.includeRegEx` / `.excludeRegEx`); see `lm://knowledge/property-driven-discovery`.

Set `useWildValueAsUUID: true` ("use wildvalue as unique identifier") when the wildvalue is a stable id, so instances with the same display name do not collide. It can be changed on an existing DataSource.

### Grouping instances

To group instances by a property of each one (for example the admin who created it), put the value in an instance property in the AD output and set `autoDiscoveryConfig.instanceAutoGroupMethod:"ilp"` with `instanceAutoGroupMethodParams` set to the property name (`auto.sdt.admin`). Properties from the AD line are `url-encoded name=value` pairs after the four `#`, joined with `&`. The values are url-decoded, so a `+` arrives as a space (`+5 more` shows as ` 5 more`; write `(5 more)`), and an unencoded `&`, `=` or `#` in a value breaks the line, so strip or encode them.

## Patterns for a DataSource that audits something

These came from a DataSource that checks the group structure of each customer in a LogicMonitor portal, but apply to any audit or compliance DataSource.

**Count in the datapoint, say where in an instance property.** A count tells you something is wrong; a property naming the offenders tells you where to fix it. Write one instance property per check (for example `auto.<ds>.<datapoint name in lower case>`) holding the offending items and the problem in each, cap the list (about 25 items and 2,000 characters, with "(N more)" after it), and point at the property in `alertBody` ("listed in the instance property auto.x.y, Info tab of this instance"). Show the properties as alert widget columns (see `lm://knowledge/dashboards-and-widgets`). Write empty properties too, so a cleared check clears its property on the next discovery. Properties update when discovery runs (`schedule_resource_discovery` to refresh now).

**Split checks until each alert has one action.** One datapoint that counts several kinds of problem sends the reader to the debug console. Give each distinct fix its own datapoint: for example "client clause missing from AppliesTo" apart from "other AppliesTo problem", and "collector group points at a deleted collector" apart from "group name differs from collector name". Keep a `total` and a `compliant` (1 or 0) datapoint without thresholds for dashboards, and give every alerting datapoint `statusDisplayNames` (`= 0` the good state, `> 0` the problem) so widgets read in words.

**Make "nothing to check" visible.** If discovery would find no instances because the thing is missing altogether (a portal with no `1. Clients` group), emit one instance for the problem itself (a fixed wildvalue such as `0`, a name like "No 1. Clients group", the existing top-level names in an instance property) with a datapoint that is 1 for that instance and 0 elsewhere, so it alerts instead of staying silent. The instance disappears once the structure exists and the real instances take over. Tell a real fetch failure (non-2xx: return a non-zero exit code) from an empty result (HTTP 200, no items: that is the finding).

**Turn it on per resource with a property.** Apply the DataSource with `<token property> && <ds>.enabled == "true"`, so enabling a resource is setting one property, and a resource that must be excluded simply does not get it. Roll out one resource first and compare `test_datasource` results across resources before enabling the rest.

**Calling the LogicMonitor REST API from the collector script.** Read the credential from a resource property (a bearer token such as `lmaccess.bearer.key`) and the host from `system.hostname`, send `Authorization: Bearer <token>` and `X-Version: 3`, and use `https://<host>/santaba/rest`. Filters are written as `parentId:1,name:"1. Clients"` (exact) or `fullPath~"1. Clients/"` (contains), url-encoded in the query. A list endpoint returns at most 1,000 items per call, so page with `size` and `offset` until a page comes back short. Request only the `fields` you need.

## AppliesTo

An expression that is just a property name means "the property is present". Prefer `prop.a && prop.b` over matching device names, so the DataSource follows the resources that carry the properties.

Break long expressions over several lines: one `&&` / `||` clause per line and each parenthetical group on its own line, which helps readability as well as width, and keep lines to about 140 characters or fewer (a rule of thumb; property names and compared values can be long). The UI's `appliesTo` box scrolls sideways when a line is wider than it, which makes the expression hard to read and review. Line breaks do not change the meaning. `/* ... */` comments are allowed, for example to hold a held-back expression after `false()`; break those lines too.

## Conventions

Renaming: change `displayName` and the internal `name` together, and fix dashboard widgets that name the old display name (see `lm://knowledge/dashboards-and-widgets`).

Do not set a DataSource `group` unless several related DataSources belong together.

The `technology` field (free-text setup notes) is limited to 4,096 characters; a longer text is rejected.

## Alert thresholds

`alertExpr` takes a single comparison, such as `= 0`, which yields **warning** severity. For several severities give the list `warn error critical`, for example `> 80 90 95`.

For a datapoint that only has a few meaningful states, fill in `statusDisplayNames` so alerts and widgets show words instead of numbers; the alert token `##ALERTVALUEDISPLAYSTATUSNAME##` (also usable as an alert widget column) gives that word. Set `alertForNoData` when a missing value should alert. Custom alert text goes in `alertSubject` / `alertBody`. An alert keeps the text and the property values it was raised with: after changing alert text or adding instance properties, alerts that are already open show the old ones until they clear and reopen.

## Small values are rounded to zero

LogicMonitor can round very small values to zero. Scale in the script (multiply, for example by 10^6 for millionths), say the unit in the datapoint description and in the graph's `verticalLabel`, and keep the full-precision value for any derived metric.

## Updating datapoints without losing data

**`dataPoints` replaces the whole list, so always send every datapoint.** LogicMonitor deletes each saved datapoint that is not in the list, and a deleted datapoint loses all of its collected history permanently, with no way to recover it. Never send only the datapoints you want to change. Get the list with `get_datasource` (`datapointsOnly:true` gives the ids), then send every datapoint with its `id`: an id alone keeps a datapoint exactly as it is, and an id plus the fields you change updates just those. `update_datasource` enforces this: it reads the saved datapoints first and refuses an update that would drop any of them (naming them, changing nothing), and also when it cannot read them. `allowDatapointRemoval:true` overrides the refusal; set it only when the user has explicitly asked for those datapoints to be deleted, never to get past the error.

A datapoint sent without an `id` is created as a new one. It does not keep a saved datapoint of the same name (that one counts as dropped), and graphs that used the old one lose it (the response then carries a `warning`; re-save graph lines with `update_datasource_graph` / `update_datasource_overview_graph`).

LogicMonitor also resets every field of a datapoint that an update leaves out. The one that bites is `rawDataFieldName`: a script or batchscript datapoint needs `"output"`, and without it LogicMonitor reports "The datapoint X of Y uses an unknown raw datapoint" and collects nothing, while `test_datasource` still shows the right values. For a datapoint sent with an `id`, `update_datasource` fills in the fields you leave out from the saved datapoint (what you send wins; send `""` to clear one), and `test_datasource` returns `warnings` for datapoints saved without `rawDataFieldName`. A new datapoint (no `id`) is taken as sent, so give it `rawDataFieldName:"output"` yourself.

Changing a threshold (`alertExpr`) only affects alerts raised afterwards: an open alert keeps the threshold and severity it was raised with until it clears and reopens.

## Graphs

Create them with `create_datasource_overview_graph` / `create_datasource_graph` (datapoints by name, `verticalLabel` required). Line type `stack` is type 3; updating lines recreates the line ids. Check the rendered graph when relying on `rigid:true` with only one bound set.

## Testing

`test_datasource` with the DataSource id and a resource id runs the AD script (if any) and the collection script on the resource's preferred collector (it refuses a collector that is down), then applies each datapoint's post-processor and lists the values per instance. It also returns `warnings` when saved datapoints lack `rawDataFieldName` (see Updating datapoints without losing data). For a script you have not saved yet, use `execute_groovy_script` with `hostId`. That runs on Java 21 here, which cannot send HTTP `PATCH`; `GET`, `POST`, `PUT` and `DELETE` work.

## Asked to scrape a web page?

First check whether the content is server-rendered. Collector Groovy cannot run JavaScript. If the page is a client-side SPA (for example Nuxt: look at `window.__NUXT__` config and the JS bundles), find the JSON API the page calls and use that instead, and tell the user that is what you did.
