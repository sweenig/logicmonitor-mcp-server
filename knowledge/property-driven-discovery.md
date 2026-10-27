# Property-driven discovery filters

A good practice for **any** multi-instance DataSource (SNMP, script, WMI, and so on): instead of hard-coding which instances to keep in the DataSource, make the discovery filters read **properties**. Anyone can then change what is monitored by setting a property on a resource or resource group, without editing the DataSource. Because properties are inherited down the resource tree, the same DataSource can behave differently per group, with exceptions per device.

The example this is modelled on is a set of process and service DataSources (`Win_Service_Select`, `Win_Process_Stats_Groovy`, `Linux_SSH_Processes_Select`) in https://github.com/sweenig/lm/tree/main/ProcessMonitoring. Monitoring every service or process on every server is wasteful and can overload a collector, so each one lets the operator say which to include and which to exclude.

## The pattern

1. **Name two properties after the DataSource**: `<DataSourceName>.includeRegEx` and `<DataSourceName>.excludeRegEx`. The DataSource name prefix keeps them unique and obvious. The values are regular expressions.
2. **Reference them in the discovery filters with `##property##` tokens.** The filter's attribute is what is tested, and its value is the token:

```
filters: [
  { attribute: "##WILDALIAS##", operation: "RegexNotMatch", value: "##MyDS.excludeRegEx##", comment: "Instances to exclude, set as a property on the resource or group." },
  { attribute: "##WILDALIAS##", operation: "RegexMatch",    value: "##MyDS.includeRegEx##", comment: "Instances to include, set as a property on the resource or group." }
]
```

3. **Make `appliesTo` require the properties**, so the DataSource applies only to resources where both properties are defined:

```
appliesTo: "isWindows() && MyDS.includeRegEx && MyDS.excludeRegEx"
```

4. **Create the properties with defaults on the root resource group** (see "Defaults on the root group" below). This is not optional: the properties must exist, **even where nobody uses them**, or the DataSource will not apply to those resources at all.
5. **Document the properties** in the DataSource's `technology` field (the free-text notes field) and in each filter's `comment`, including the default values.

## Defaults on the root group

Because `appliesTo` requires the properties, a DataSource that has been created but whose properties are not defined anywhere applies to nothing. So whenever you build a property-driven DataSource, also create its two properties on the **root resource group** (find it with `list_resource_groups`; it is normally id 1) with defaults that mean "include everything, exclude nothing":

- `MyDS.includeRegEx` = `.*`
- `MyDS.excludeRegEx` = `a^`

With only those, every matching resource gets everything, exactly as a DataSource with no filters would. Narrowing is then opt-in: set different values on a group or a resource and the inherited default is overridden there. Offer to create them (`update_resource_group_property`, once per property), and say that the DataSource will apply nowhere until they exist. If the user wants the DataSource to stay dormant until someone opts in, leave the root properties out and say so, since that is the opposite behaviour.

## Setting the properties

Set them on the resource group that holds the right devices (for example a "Linux Servers" folder), on the root group for everything, or on a single resource. Children inherit; a property on a resource **overrides** the value inherited from its group, so a group can keep the default include `.*` while one device overrides the exclude. Use `update_resource_group_property` and `update_resource_property` (they create the property if it does not exist; `delete_resource_property` and `delete_resource_group_property` remove one). Datasources that do not use a property ignore it.

## Values and placeholders

- To include everything, set `includeRegEx` to `.*`.
- To exclude nothing, set `excludeRegEx` to a regular expression that can never match, `a^` (an `a` followed by a start-of-string anchor, which cannot both hold). Prefer it to a readable placeholder such as `DO NOT EXCLUDE ANYTHING`, which is a literal that could in principle match a name. Do not leave the property empty: with the `appliesTo` above, an empty property is false, so the DataSource would not apply (inferred, not stated by LogicMonitor).
- Filters are **ANDed**: an instance is kept only if it passes every filter. Regular expressions can match more than intended (a short pattern can match two different names), so check what a pattern discovers before relying on it.

## What can be tested

- `##WILDALIAS##`: the instance's name. This is the common choice for include/exclude patterns. It only works well when the name is meaningful, so with SNMP use `value` discovery on a name column, not `wildcard`, whose alias is the bare index (see `lm://knowledge/snmp-datasource-from-mib`).
- An **instance property** (`auto.<something>`), such as one set by an ILP or a discovery script: for example filter out services whose `auto.WinServiceStartMode` is `Manual` or `Disabled`.
- For SNMP, an OID (see the filters section in the SNMP knowledge doc).

Operations seen: `Equal`, `NotEqual`, `GreaterThan`, `RegexMatch`, `RegexNotMatch`. Take others from an existing DataSource.

## When to use it

Use property-driven filters whenever "which instances matter" differs by customer, site or device, which is most of the time for processes, services, interfaces, databases and queues. For a fixed rule that is always true (for example "skip outlets that do not exist"), a hard-coded filter is fine; say why in its comment. Ask the user which they want, and propose the property names and values before building.

## Verified

Checked on a real portal: `create_datasource` accepted and stored the token filters and the property-based `appliesTo` shown above (a throwaway DataSource, since deleted). The pattern itself comes from the example DataSources linked above. Not verified here: how a given pattern behaves at discovery on a live device.
