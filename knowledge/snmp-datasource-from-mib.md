# Building an SNMP DataSource from a MIB table

How to turn one table (or one group of scalars) of an SNMP MIB into a well-made DataSource with `create_datasource`. The aim is a DataSource a person can read and trust: every datapoint described, sensible thresholds, words instead of numbers for states. It is not to cover the whole MIB. The user names the table; you build that one.

Status: the DataSource shapes below were created and read back on a real portal (see "Verified"). Collection and discovery against a live device were **not** verified; test them as described under "Test it".

## Work in steps and check with the user

1. **Scope.** Which table (or scalar group) do they want, which device model, and is there an existing DataSource to improve? A MIB can be megabytes: never ask for the whole file. Ask for the text of the table: its `...Table`, `...Entry` and `SEQUENCE` definitions and every column's `OBJECT-TYPE`, plus the OID chain above it (see "Getting OIDs") and any `TEXTUAL-CONVENTION` types the columns use.
2. **Read the table**, then propose the design (instances, datapoints, thresholds) in a short table and wait for the user to adjust it.
3. **Create the DataSource** with `appliesTo` set to `false()` plus a comment holding the intended expression (see "Naming and applying"), so nothing is affected until it is tested.
4. **Test it** on a real device, then set the real `appliesTo`.

Do not invent MIB content you were not given. If a column's type, enumeration or parent OID is not in the text you have, say so and ask.

## Getting OIDs

A MIB gives each object as `::= { parent number }`. The full OID is the parent's OID plus `.number`, followed up the chain to a known root (for example `enterprises` = `.1.3.6.1.4.1`; a vendor's number follows it). Resolve every object you use and write the OID with a leading dot, as LogicMonitor does (`.1.3.6.1.4.1.318.1.1.12.3.5.1.1.4`). If a parent is defined elsewhere in the MIB, ask for that line rather than guessing. Check at least one result with `!snmpwalk` (below).

## Scalars versus tables

- A **table** (`SEQUENCE OF ...Entry`) becomes a **multi-instance** DataSource: one instance per row, found by Active Discovery.
- **Scalars** (single objects whose OID ends in `.0`) make a single-instance DataSource, or datapoints on a DataSource of the same theme. Not verified here: before building one, read an existing single-instance SNMP DataSource (`get_datasource` on one you find with `list_datasources` and `filter:"collectMethod:snmp"`) and copy its shape.
- Several tables on one device are separate DataSources, one per table, unless the user asks otherwise.

## The multi-instance SNMP shape

```
name: "Vendor_Product_TableName"        (no spaces)
displayName: "Readable name"
collectMethod: "snmp", collectInterval: 300
collectorAttribute: { name: "snmp", ip: "dns" }
enableAutoDiscovery: true               (hasMultiInstances then defaults to true; it cannot be changed later)
autoDiscoveryConfig: {
  persistentInstance: true, scheduleInterval: 60,
  instanceAutoGroupMethod: "none", instanceAutoGroupMethodParams: "",
  method: { name: "ad_snmp", discoveryType: "value",     (or "wildcard"; see below)
            OID: "<column to walk>", descriptionOID: "",
            lookupOID: "", enableSNMPILP: false, ILP: [] },
  filters: []
}
dataPoints: [{ name, description, type: 2, dataType: 7, postProcessorMethod: "none",
               userParam1: "<column OID>.##WILDVALUE##", alertExpr, ... }]
```

### Pick the discovery type: it decides the instance's name

Active Discovery gives every instance a **wildvalue** (its identity, used in the datapoint OIDs) and a **wildalias** (the name people see). In all three types the wildvalue is the row's **index**: the part of the OID after the walked column (`1`, `2`; or `a.b` for a composite index). The types differ in where the wildalias comes from:

| `discoveryType` | wildvalue | wildalias (the instance name) | Use when |
|---|---|---|---|
| `value` | the index | the **value** in each row of the walked column (`OID`) | The table has a suitable name or label column (a `DisplayString` such as an outlet, interface, sensor or fan name). **This is the usual choice**; walk that name column. |
| `wildcard` | the index | the **index itself**, so instances are named `1`, `2`, ... | The table has no suitable name column. Avoid otherwise: people see bare numbers. |
| `lookup` | the index | read from a **second SNMP GET**: the walk of the given OID returns pairs of (index, an OID), and LM GETs each of those OIDs to get the alias | The names live somewhere the table does not point to by index, but the table holds the OID of the name for each row. Rare. |

So when the MIB table has a name column, walk **that** column with `value`. Do not use `wildcard` and put the name column in `descriptionOID`: the instance is still named by its index (`descriptionOID` only fills the instance's description field). With `wildcard` or `value`, the column walked must have a value for every row, and must not be an index column that is `not-accessible` in the MIB (those cannot be read). If the best name column is not unique, say so and ask the user.

Choosing: ask whether the table has a name column (then `value`), otherwise `wildcard`, and use `lookup` only when the MIB shows rows that hold the OID of their name. Say which you chose and why in the design you propose.

- **`value` and `wildcard`** are confirmed against existing DataSources on a portal (`CiscoFan-` uses `value`, walking a fan description column with `descriptionOID` left empty).
- **`lookup`**: not verified. The LogicMonitor API accepts any `discoveryType` string without checking it (a nonsense value was saved without complaint and would only fail at discovery), so do not guess. Which of `OID` and `lookupOID` holds the walked OID is not confirmed either. Before building one, find an existing DataSource that uses it, or ask the user to make one in the LogicMonitor UI, and read it back with `get_datasource` to copy its exact fields.
- **`descriptionOID`** is optional with any type and sets the instance's description, not its name (it may point at a column of another table that shares the same index, as `Cisco Switch Stack Ports-` does with the interface description table).
- **Each datapoint** reads `<column OID>.##WILDVALUE##` in `userParam1`.
- To group instances by a property, see the ILP notes in `lm://knowledge/script-datasource`; `enableSNMPILP` and `ILP` in the method do the same for `ad_snmp` (an `ILP` entry is `{OID: "<column OID>.##WILDVALUE##", name: "auto.something", method: "get"}`, as `Cisco Switch Stack-` uses). Leave them empty unless needed.

## Which columns become what

For each column, decide with the user:

| Column | Use |
|---|---|
| Index (often `not-accessible`) | Not a datapoint. It is the wildvalue. |
| `DisplayString` name or label | The column to walk for the instance name with `value` discovery (see above), not a datapoint. |
| Other text columns (serial number, model, firmware, location, owner, ...) | Cannot be datapoints (datapoints are numeric), but are often valuable as **instance-level properties (ILP)**: set `enableSNMPILP: true` and add an `ILP` entry per column, `{OID: "<column OID>.##WILDVALUE##", name: "auto.<something>", method: "get"}`. The value is then stored as a property on each instance, where it can be seen, searched and used in alert text. Propose the useful ones to the user; skip only columns with no value (empty, redundant with the name, or internal). |
| `INTEGER` with named values (an enumeration) | A **state datapoint** with `statusDisplayNames` and an alert on the bad value. |
| `Gauge`, `Gauge32`, `INTEGER` measurement | A **gauge datapoint** (`type:2, dataType:7`, as above). |
| `Counter32` / `Counter64` | A **counter**; it needs rate handling, not a raw total. Not verified here: before writing one, read the datapoints of an existing SNMP DataSource that uses counters (for example `SNMP_Network_Interfaces`, with `get_datasource` and `datapointsOnly:true`) and copy how its counter datapoints are set. |
| Columns that are configuration, thresholds, or write-only | Usually skip; say you skipped them. |

Not every column deserves a datapoint. Prefer the ones someone would graph or alert on, say what you left out and why, and let the user override.

## Writing good datapoints

- **`name`**: short and stable (`Load`, `State`), no spaces.
- **`description`**: say what it measures **and the unit**, in plain words, drawn from the MIB's `DESCRIPTION` but shortened. Say what the values mean if it is a state. Mention when a value is only supported on some models (the MIB often says so).
- **Units and scaling.** MIBs often report tenths or hundredths ("tenths of amps"). Keep the raw value and say the unit in the description, or ask the user if they want it scaled. Do not silently rescale.
- **`maxValue` / `minValue`**: set only when the MIB gives real bounds.

## Status values

For an enumeration, fill `statusDisplayNames` so alerts and widgets say "Off" instead of `2`. The shape (verified on a live portal) is:

```
statusDisplayNames: [
  { operator: "EQ", metricValue: "1", statusDisplayName: "On"  },
  { operator: "EQ", metricValue: "2", statusDisplayName: "Off" }
]
```

`operator` is one of `GT, LT, GE, LE, EQ, NEQ, GTE, LTE`; `metricValue` is a string. Use the MIB's own names, tidied for people (`outletStatusOn (1)` becomes "On"). The alert token `##ALERTVALUEDISPLAYSTATUSNAME##` then gives the word in alert text. Write the numeric meaning into the datapoint description too.

## Thresholds

`alertExpr` takes one comparison for a warning (`= 2`) or three values for warn, error, critical (`> 80 90 95`). Treat thresholds as **suggestions the user confirms**:

- **State**: alert on the value that means trouble (off when it should be on, failed, fault, degraded) and say which severity. If the MIB does not say which value is bad, ask. If both states can be normal (an outlet may be intentionally off), say so and offer to leave it unalerted or alert only on change.
- **Gauge with a natural limit** (a percentage, a rated maximum in the MIB): suggest warn, error, critical levels and where the numbers came from. **No natural limit** (a load, a count): do not invent one; leave `alertExpr` empty and say so.
- **Error counters**: alert on a rate above zero, not the running total.
- Set `alertTransitionInterval` (polls before alerting) to avoid noise, 2 to 3 for a state.
- **"No data" alerts (`alertForNoData`)**: define one on **at most a single datapoint**, and only where the absence of data means collection itself is failing. Do not set it on every datapoint, and do not use it to mean "this value is missing". Usually leave it off altogether: most portals already have a "canary" DataSource with a no data alert that fires when SNMP to the device fails, and if SNMP is failing the canary already says so, so this DataSource adds only duplicate alerts. Ask the user whether such a canary exists on their devices before adding one. The value the API uses for "no no-data alert" is the default a new datapoint gets when you omit the field (it came back as `1` on every datapoint created without it); how the other values map to severities is not verified here, so to set one, copy it from an existing datapoint that has a no data alert (`get_datasource` with `datapointsOnly:true`).

## Discovery filters

`autoDiscoveryConfig.filters` hides instances that fail a test, each `{attribute, operation, value, comment}`; for SNMP the attribute is the **OID of a column**, and the filter tests that column's value for each row (operations seen include `Equal`, `NotEqual`, `GreaterThan`, `RegexMatch`, `RegexNotMatch`). To filter by instance name with `value` discovery, use the OID of the name column you walk for discovery. Do **not** use `##WILDALIAS##` or `WILDALIAS` as the attribute for SNMP: the API accepts it, but it matches nothing, so the filter silently does not filter (it is the right attribute for WMI discovery, not SNMP). Filters are useful, but they change what the user sees: for example, filtering outlets to "state is on" means an outlet that is switched off never appears at all, so it can never alert. Ask rather than assume, and put the reason in each filter's `comment`.

There are two kinds of filter, and the choice matters:

- **Fixed filters** state a rule that is always true for this table, such as "only discover fans that are present" (`NotEqual 5` on a presence column) or "skip rows with no value". Hard-code these, and say why in the `comment`.
- **Property-driven filters** put "which instances do we want?" in properties that the user sets on resources or resource groups, such as `<DataSourceName>.includeRegEx` and `.excludeRegEx` matched against the instance name. Prefer these whenever the answer differs by customer, site or device (interfaces, sensors, processes, anything people want to narrow). With `value` discovery the instance name is the name column, so a name pattern is meaningful. In the filter, the attribute is the name column's OID and the value is the token, for example `{attribute: ".1.3.6.1.4.1.318.1.1.12.3.5.1.1.2", operation: "RegexNotMatch", value: "##MyDS.excludeRegEx##"}`. Both properties must be defined, or nothing is discovered. The full pattern (the `##property##` tokens, the `appliesTo` that requires the properties, placeholder values, inheritance and overrides) is in `lm://knowledge/property-driven-discovery`; read it and propose the property names to the user.

Ask which kind they want, and do not add a state-based filter (such as "only outlets that are on") without saying what it hides.

## Naming and applying

- `name`: no spaces, vendor and table (`APC_RackPDU_OutletStatus`); `displayName` readable; `tags` comma separated; `group` if the portal uses them.
- `appliesTo` decides which devices get it. Ask what identifies them (a device category such as `hasCategory("APCRackPDU")`, or a property). Create with `false()`, test, then `update_datasource` the real expression. `appliesTo` supports `/* ... */` comments, so while the DataSource is held back, write the **complete intended expression** in a comment after `false()` so anyone opening it sees what it will apply to:

  ```text
  false()
  /* Intended: hasCategory("APCRackPDU") && MyDS.includeRegEx && MyDS.excludeRegEx */
  ```

  **Break long lines.** The `appliesTo` editor in the UI scrolls sideways when a line is wider than the box, which makes a long expression or comment hard to read and review. Put each clause (`&&` / `||` term) and each parenthetical group on its own line, for readability as well as width, and each sentence of a comment on its own line. Keep lines to roughly 140 characters at most (a rule of thumb, not a measured limit; property names and compared values can be long). Whitespace and line breaks do not change what the expression matches. This applies to every `appliesTo`, not only held-back ones:

  ```text
  false()
  /* Intended:
     hasCategory("APCRackPDU")
     && MyDS.includeRegEx
     && MyDS.excludeRegEx
  */
  ```

  If the expression is not settled, say what is missing in the comment (for example "device category to be confirmed"). Switching on is then a matter of deleting `false()` and the comment markers.
- Check the portal for a similar DataSource first (`list_datasources` with a name filter) so you improve or reuse it rather than duplicate it.

## Create, update, and the datapoint trap

- `create_datasource` sends the shape above through unchanged for SNMP.
- `hasMultiInstances` is set at creation only; getting it wrong means delete and recreate.
- **`update_datasource` replaces the whole datapoint list.** A saved datapoint left out of `dataPoints` is deleted with all of its history (the tool refuses such an update unless `allowDatapointRemoval:true`, which is only for when the user has asked for deletion), so send every datapoint, each with its `id`, getting them first from `get_datasource` with `fields:"dataPoints"`. Fields you leave out of a datapoint sent with an `id` are filled in from the saved one, so an id alone keeps it unchanged; without the fill-in, a datapoint resent with only its id lost its `description` and went back to the default `alertTransitionInterval`. See `lm://knowledge/script-datasource` (Updating datapoints without losing data).

## Test it

`test_datasource` only handles script DataSources, so SNMP is tested by hand, through a collector that can reach a real device (use `list_resources` to find one, and `get_resource` for its collector):

1. `execute_debug_command` with `!snmpwalk <host> <column OID>` to confirm the OID exists and see the indexes; `!snmpget <host> <column OID>.<index>` for a single value.
2. Set `appliesTo` so the device matches, then `schedule_resource_discovery` and check `list_resource_instances`.
3. `get_resource_instance_data` for each datapoint; compare with the walk, and check the unit and any scaling.
4. Confirm each state shows its display name and that an alert fires or not as the thresholds say.

Say what you checked and what you could not. If no suitable device is available, state that the DataSource is untested.

## Verified

Checked against a real portal: an SNMP table DataSource with `ad_snmp` wildcard discovery, `descriptionOID`, per-datapoint `userParam1` OIDs and `statusDisplayNames` was created, read back and updated through `create_datasource` and `update_datasource`; the `update_datasource` datapoint reset described above was observed. The `value` and `wildcard` discovery types were seen on existing DataSources. The `wildalias` behaviour of each type is as described by the DataSource's owner and was not re-measured against a device. Not verified: discovery and collection against a device, the `lookup` type, counters, scalar (single-instance) SNMP DataSources, composite indexes.
