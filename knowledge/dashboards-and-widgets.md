# Dashboards and alert list widgets

Create a dashboard with `create_dashboard`, add widgets with `create_widget`, and arrange them with the dashboard's `widgetsConfig`. Read an existing dashboard and its widgets (`get_dashboard`, `list_widgets`, `get_widget` with `fields:"*"`) and copy what works: the UI's own settings are the best reference.

## Dashboards

- **Folder needs public.** Only a public (`sharable:true`) dashboard can be in a folder; for a private one LogicMonitor silently ignores `groupId` and leaves it in the root group. `create_dashboard` therefore defaults `sharable` to true when `groupId` is given, and `update_dashboard` refuses to move a private dashboard unless `sharable:true` is passed.
- **Layout.** `widgetsConfig` is a 12-column grid, `{ "<widgetId>": { col, row, sizex, sizey } }`. A tall narrow widget on the left (`col:1, sizex:2`) with alert lists at `col:3, sizex:10` is a common layout; an alert list of `sizey:4` shows a handful of rows.
- **Dashboard-level property filters.** `defaultDashboardFilters` is a list of `{name, type}`, type `RESOURCE_PROPERTY` (for example `system.displayname`) or `INSTANCE_PROPERTY` (for example `auto.sdt.admin`). Sending the list replaces the existing filters. Whether a given widget honors an instance property filter is not something the API tells you; check in the UI.
- **Dashboard variables.** `widgetTokens` is `[{name, value}]`, for example `defaultResourceGroup`.

## Alert list widget (`type:"alert"`)

`filters` (what alerts) and `displaySettings` (how they look) are the two parts that matter.

- **`filters.dataSource`** is the DataSource's **display name** (`LogicMonitor Portal SDTs`), not its internal name. Wildcards work (`Collector*`). A widget that names a DataSource keeps naming it as plain text: renaming the DataSource later does not update the widget, and the widget silently shows nothing.
- **`filters.dataPoint`** is a datapoint name or wildcard (`policy*`). **`filters.severity`** takes `warn`, `error`, `critical` (not `warning`), comma separated for several, empty for all. **`cleared:"no"`** means open alerts only.
- **Time range.** Unless `displaySettings.isShowAll` is `true`, the widget only shows alerts inside the dashboard's time range. Set it to `true` to list every matching open alert whatever its age. (Found by comparing widgets that behave this way; it is not documented by LogicMonitor.)
- **`displaySettings.columns`** is the whole column list, each with `columnKey`, `visible`, `columnLabel`, `columnSize`. Keep the standard entries and hide the ones you do not want (`visible:false`) rather than deleting them. Standard keys include `alert-severity`, `alert-began` (Reported At), `alert-device`, `alert-datasource-instance`, `alert-datapoint`, `alert-value`, `alert-static-threshold`, `alert-notes`.
- **Custom columns** show an alert token or a property:

  ```json
  { "isDynamic": true, "visible": true, "columnLabel": "##ALERTVALUEDISPLAYSTATUSNAME##", "columnSize": 160,
    "isSortable": false, "componentName": "AlertList",
    "columnKey": "_23_23ALERTVALUEDISPLAYSTATUSNAME_23_23",
    "dataPath": ["customColumns", "##ALERTVALUEDISPLAYSTATUSNAME##"] }
  ```

  The `columnKey` is the name with `#` written as `_23` and the first `.` as `_`. `##ALERTVALUEDISPLAYSTATUSNAME##` (the datapoint's status display name for the value) is confirmed working. Property columns appear in existing widgets both as `##property##` and as the bare property name; which one fills in for an instance property (`auto.sdt.admin`) was not verified, so check that the cells are not blank.
- **Do not hand-edit the column list.** `update_widget` with `displaySettings` should be treated as replacing the whole object, so send all of it. Use `update_widget`'s `columns` instead: it reads the current list and applies changes such as `[{"columnKey":"alert-static-threshold","visible":false},{"token":"##auto.sdt.admin##","columnLabel":"Admin","columnSize":200}]`.
- Other settings worth copying from a widget you like: `theme`, `fontsize`, `sort` (`-startEpoch` newest first), `playSound`.

## NOC widget (`type:"noc"`)

Status tiles per resource for one DataSource: `items:[{type:"device", deviceGroupFullPath:"*", deviceDisplayName:"*", dataSourceDisplayName:"<display name>", instanceName:"*", dataPointName:"*", groupBy:"device", name:"##RESOURCENAME##"}]`. As with alert widgets, `dataSourceDisplayName` is plain text and is not updated when the DataSource is renamed.

## After renaming a DataSource

Run `find_widgets_using_datasource` with the old display name (and the old internal name, for graph widgets), then fix `filters.dataSource` / `items[].dataSourceDisplayName`, and any dashboard description that names it.
