# Building a script DataSource

Two shapes: a **single-instance** script (`collectMethod:"script"`) and a **multi-instance batchscript** (`collectMethod:"batchscript"`) with Active Discovery (AD). Create with `create_datasource`; try it with `test_datasource` (runs the saved DataSource against a resource and shows values per instance); change it with `update_datasource`.

`create_datasource` fills in what LogicMonitor requires for script DataSources: `collectorAttribute.name` (= collectMethod), empty `linuxCmdline/linuxScript/windowsCmdline/windowsScript`, and in `autoDiscoveryConfig` an empty-string `instanceAutoGroupMethodParams`, `method.name:"ad_script"`, `method.type:"embeded"` (LogicMonitor really spells it that way) and `filters:[]`.

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

Set `useWildValueAsUUID: true` ("use wildvalue as unique identifier") when the wildvalue is a stable id, so instances with the same display name do not collide. It can be changed on an existing DataSource.

### Grouping instances

To group instances by a property of each one (for example the admin who created it), put the value in an instance property in the AD output and set `autoDiscoveryConfig.instanceAutoGroupMethod:"ilp"` with `instanceAutoGroupMethodParams` set to the property name (`auto.sdt.admin`). Properties from the AD line are `url-encoded name=value` pairs after the four `#`, joined with `&`.

## AppliesTo

An expression that is just a property name means "the property is present". Prefer `prop.a && prop.b` over matching device names, so the DataSource follows the resources that carry the properties.

## Conventions

Renaming: change `displayName` and the internal `name` together, and fix dashboard widgets that name the old display name (see `lm://knowledge/dashboards-and-widgets`).

Do not set a DataSource `group` unless several related DataSources belong together.

## Alert thresholds

`alertExpr` takes a single comparison, such as `= 0`, which yields **warning** severity. For several severities give the list `warn error critical`, for example `> 80 90 95`.

For a datapoint that only has a few meaningful states, fill in `statusDisplayNames` so alerts and widgets show words instead of numbers; the alert token `##ALERTVALUEDISPLAYSTATUSNAME##` (also usable as an alert widget column) gives that word. Set `alertForNoData` when a missing value should alert. Custom alert text goes in `alertSubject` / `alertBody`.

## Small values are rounded to zero

LogicMonitor can round very small values to zero. Scale in the script (multiply, for example by 10^6 for millionths), say the unit in the datapoint description and in the graph's `verticalLabel`, and keep the full-precision value for any derived metric.

## Updating without breaking graphs

Graphs refer to datapoints by id. When changing datapoints through `update_datasource`, pass each existing datapoint's `id`; datapoints without one are recreated and graphs silently lose them (the response then carries a `warning`). `get_datasource` with `datapointsOnly:true` returns a trimmed datapoint list with the ids. After recreating datapoints, re-save graph lines with `update_datasource_graph` / `update_datasource_overview_graph`.

## Graphs

Create them with `create_datasource_overview_graph` / `create_datasource_graph` (datapoints by name, `verticalLabel` required). Line type `stack` is type 3; updating lines recreates the line ids. Check the rendered graph when relying on `rigid:true` with only one bound set.

## Testing

`test_datasource` with the DataSource id and a resource id runs the AD script (if any) and the collection script on the resource's preferred collector (it refuses a collector that is down), then applies each datapoint's post-processor and lists the values per instance. For a script you have not saved yet, use `execute_groovy_script` with `hostId`. That runs on Java 21 here, which cannot send HTTP `PATCH`; `GET`, `POST`, `PUT` and `DELETE` work.

## Asked to scrape a web page?

First check whether the content is server-rendered. Collector Groovy cannot run JavaScript. If the page is a client-side SPA (for example Nuxt: look at `window.__NUXT__` config and the JS bundles), find the JSON API the page calls and use that instead, and tell the user that is what you did.
