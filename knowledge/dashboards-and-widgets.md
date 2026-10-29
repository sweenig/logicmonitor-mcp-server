# Dashboards and alert list widgets

Create a dashboard with `create_dashboard`, add widgets with `create_widget`, and arrange them with the dashboard's `widgetsConfig`. Read an existing dashboard and its widgets (`get_dashboard`, `list_widgets`, `get_widget` with `fields:"*"`) and copy what works: the UI's own settings are the best reference.

## Dashboards

- **Folder needs public.** Only a public (`sharable:true`) dashboard can be in a folder; for a private one LogicMonitor silently ignores `groupId` and leaves it in the root group. `create_dashboard` therefore defaults `sharable` to true when `groupId` is given, and `update_dashboard` refuses to move a private dashboard unless `sharable:true` is passed.
- **Layout.** `widgetsConfig` is a 12-column grid, `{ "<widgetId>": { col, row, sizex, sizey } }`. A tall narrow widget on the left (`col:1, sizex:2`) with alert lists at `col:3, sizex:10` is a common layout; an alert list of `sizey:4` shows a handful of rows. Give the tall widget a `sizey` equal to the stacked widgets' heights added up (eight alert lists of `sizey:4` next to a `sizey:32` widget), so both columns end together. Rows start at 1.
- **Dashboard-level property filters.** `defaultDashboardFilters` is a list of `{name, type}`, type `RESOURCE_PROPERTY` (for example `system.displayname`) or `INSTANCE_PROPERTY` (for example `auto.sdt.admin`). Sending the list replaces the existing filters. Whether a given widget honors an instance property filter is not something the API tells you; check in the UI.
- **Dashboard variables.** `widgetTokens` is `[{name, value}]`, for example `defaultResourceGroup`.

## Alert list widget (`type:"alert"`)

`filters` (what alerts) and `displaySettings` (how they look) are the two parts that matter.

- **`filters.dataSource`** is the DataSource's **display name** (`LogicMonitor Portal SDTs`), not its internal name. Wildcards work (`Collector*`). A widget that names a DataSource keeps naming it as plain text: renaming the DataSource later does not update the widget, and the widget silently shows nothing.
- **`filters.dataPoint`** is a datapoint name, a wildcard (`policy*`), or a comma-separated list of names (`collectorStructure,collectorStale,collectorMismatch`), which lets one widget cover the checks of one area. Wildcards can match more than you mean (`collector*` also matches `collectorHostViolations`), so list the names when they overlap. **`filters.severity`** takes `warn`, `error`, `critical` (not `warning`), comma separated for several, empty for all. **`cleared:"no"`** means open alerts only.
- **Time range.** Unless `displaySettings.isShowAll` is `true`, the widget only shows alerts inside the dashboard's time range. Set it to `true` to list every matching open alert whatever its age. (Found by comparing widgets that behave this way; it is not documented by LogicMonitor.)
- **`displaySettings.columns`** is the whole column list, each with `columnKey`, `visible`, `columnLabel`, `columnSize`. Keep the standard entries and hide the ones you do not want (`visible:false`) rather than deleting them. Standard keys include `alert-severity`, `alert-began` (Reported At), `alert-device`, `alert-datasource-instance`, `alert-datapoint`, `alert-value`, `alert-static-threshold`, `alert-notes`.
- **Custom columns** show an alert token or a property:

  ```json
  { "isDynamic": true, "visible": true, "columnLabel": "##ALERTVALUEDISPLAYSTATUSNAME##", "columnSize": 160,
    "isSortable": false, "componentName": "AlertList",
    "columnKey": "_23_23ALERTVALUEDISPLAYSTATUSNAME_23_23",
    "dataPath": ["customColumns", "##ALERTVALUEDISPLAYSTATUSNAME##"] }
  ```

  **The label is what LogicMonitor looks up**: the value comes back under the column's `columnLabel` and is resolved from it, so a custom column's label must be the token itself (`##auto.sdt.admin##`). Give it a friendly label and every cell is blank (tested). The `columnKey` and `dataPath` do not affect the result; the UI writes the key with `#` as `_23` and the first `.` as `_`.

  What resolves (tested on alerts of a DataSource with instance properties): `##auto.report.owner.name##` (an instance property, with its `auto.` prefix) and `##INSTANCE##` fill in; `##system.hostname##` and bare `system.hostname` (resource property) fill in; `##report.owner.name##` (no `auto.` prefix) and `##INSTANCE.PROPERTY.auto...##` come back blank. `##ALERTVALUEDISPLAYSTATUSNAME##` is the status display name of the value.
- **Do not hand-edit the column list.** `update_widget` with `displaySettings` should be treated as replacing the whole object, so send all of it. Use `update_widget`'s `columns` instead: it reads the current list and applies changes such as `[{"columnKey":"alert-static-threshold","visible":false},{"token":"##auto.sdt.admin##","columnSize":200}]`.
- **Which columns earn their space.** An alert list is read at a glance, so show the few that answer "what is wrong, where, and what do I fix" and hide the rest (`visible:false`). The usual answers, from building the portal group standard dashboard:
  - *Show almost always:* Reported At (`alert-began`), Resource/Website (`alert-device`), Instance (`alert-datasource-instance`), and `##ALERTVALUEDISPLAYSTATUSNAME##` when the DataSource defines status display names (it is the plain-language message).
  - *Show only when it adds something:* Datapoint (`alert-datapoint`) when the widget spans several datapoints, hide it when the filter leaves one; Alert Value (`alert-value`) when the number means something (a metric, a count of problems) and the status text does not already say it; Severity (`alert-severity`) when the widget spans severities, hide it on a single-severity widget; LogicModule (`alert-datasource`) when the widget spans DataSources; Static Threshold (`alert-static-threshold`) only when readers compare the value to it.
  - *Hide by default:* ServiceNow, ConnectWise, PagerDuty, JSM, Custom HTTP and Autotask incident (show only an integration the portal really has; a ticket link never fills in on a portal that is not integrated with that system), Dynamic Threshold (unless anomaly thresholds are used), Group, Instance Description (usually repeats Instance), Full Path, ACK By, ACK At, Notes, Cleared At (always empty on an open-alerts widget), Is In SDT, Historical SDT, Alert Rule, Escalation Chain, Notification State, Dependency Role, Suppression Type, Dependent Alerts Count, Alert Grouping Criteria, Log Metadata and Logs Partition. Show one of these on the widget that exists to look at it (for example ACK By on a shift-handover view, Is In SDT on an SDT audit).
  - *Property columns (`##auto.…##` instance properties and resource properties):* any property the DataSource sets or reads can be worth a column, depending on what the property tells the reader. Add the ones that say where to fix the problem (for example a property listing the groups to correct), and leave out those that would be blank on every alert the widget shows.
- **A widget only stores the columns it was created with.** A widget created with a short column list does not carry the hidden standard columns, so `update_widget`'s `columns` cannot hide one that is not in the list (it fails with "no column with columnKey"). To hide standard columns on such a widget, send its complete `displaySettings` once (every standard column with `visible` set), after which `columns` works.
- **Custom column values are captured with the alert.** A property column fills in for an alert raised or refreshed after the property existed; an alert opened earlier shows blank until it updates, clears and reopens (seen after adding instance properties to a DataSource that already had open alerts).
- Other settings worth copying from a widget you like: `theme`, `fontsize`, `sort` (`-startEpoch` newest first), `playSound`.

## Checking that a widget shows what you meant

`get_widget_data` returns the widget's current rows. For an alert list, look at each row's `customColumns`: its keys are the column labels, and an empty value for a property that you know is set means the column is mislabelled or the alert predates the property. For a NOC widget, check which resources appear. Do this after building a widget; the UI may also show a stale copy until the page is refreshed, so refresh before concluding that a saved widget is wrong.

## NOC widget (`type:"noc"`)

Status tiles per resource for one DataSource: `items:[{type:"device", deviceGroupFullPath:"*", deviceDisplayName:"*", dataSourceDisplayName:"<display name>", instanceName:"*", dataPointName:"*", groupBy:"device", name:"##RESOURCENAME##"}]`. As with alert widgets, `dataSourceDisplayName` is plain text and is not updated when the DataSource is renamed. To show only some resources, give `deviceGroupFullPath` a resource group's full path (`2. Technology/SaaS/LogicMonitor`) instead of `"*"`; only members of that group appear. Find the path with `list_resource_groups` (`fullPath`).

## After renaming a DataSource

Run `find_widgets_using_datasource` with the old display name (and the old internal name, for graph widgets), then fix `filters.dataSource` / `items[].dataSourceDisplayName`, and any dashboard description that names it.
