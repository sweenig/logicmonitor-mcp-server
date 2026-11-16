# Dynamic resource groups, auto properties and why membership lags

A **dynamic resource group** has an `appliesTo` expression instead of (or as well as) hand-picked members. LogicMonitor evaluates the expression against every resource's properties and keeps the matching resources in the group. A common use is location or customer groups: `auto.location.id == "abc123"`.

The thing that surprises people: **editing a property does not move the resource at once when the group rule reads an auto property.** The group is right, the property you edited is right, and the resource still sits in the old group. This page explains why and how to check it.

## Three kinds of property

| Kind | Name looks like | Who writes it | How it changes |
|---|---|---|---|
| Custom | `location.id` | You, or an API client (`update_resource_property`, `update_resource_group_property`) | Immediately |
| System | `system.hostname`, `system.categories` | LogicMonitor and collectors | By the platform |
| Auto | `auto.location.id`, `auto.lm.site` | A **PropertySource** (or the collector, or discovery) | Only when that source runs again |

An auto property is a **copy** made by a script. A PropertySource reads a custom property, an API, or the device itself, and writes the result as `auto.<name>`. You cannot meaningfully edit an auto property; the next run overwrites it. Change the source value (the custom property), then wait for the PropertySource.

## Why membership lags

1. You change the custom property (instant).
2. The PropertySource that derives `auto.<name>` has not run yet, so the auto property still holds the old value.
3. The group's `appliesTo` reads the auto property, so it still matches the old group.
4. The PropertySource runs on its own schedule (see the PropertySource's settings; many run about once a day, not on every poll).
5. The auto property updates, and LogicMonitor then re-evaluates dynamic group membership. That evaluation is also not instant, so allow a few minutes after the auto property changes.

If the group rule reads the **custom** property directly, there is no PropertySource step and only the short re-evaluation delay applies. Prefer that where you can; use an auto property in a rule only when something else has to compute it.

Anything else derived from the auto property lags the same way (for example a site property copied from the location).

## Verify after a change: check in this order

Verification right after an edit looks like a failure unless you know about the lag. Walk the chain from the source forward and stop at the first stale link:

1. **Custom property**: `list_resource_properties` for the resource. Is the value you set there? If not, the write failed or was overridden by an inherited value.
2. **Auto property**: the same call (auto properties appear in the list, but `list_resources` returns them only when asked, e.g. `fields="id,displayName,autoProperties"`). Still the old value? Then the PropertySource has not rerun; the group is not yet wrong, just waiting.
3. **Group membership**: `get_resource_group_membership` for the resource. For each dynamic group it shows the `appliesTo` rule and the resource's own values of the properties the rule names, so you can see at a glance whether the rule would match. It does not evaluate the rule. `find_resource_groups_by_applies_to` (for example `text:"auto.location"`) lists every group that depends on a property.

Report the step where the chain is stale, not just "the device is in the wrong group".

## Forcing a refresh

- `schedule_resource_discovery` asks LogicMonitor to run discovery on the resource now. Use it first. Check the auto property afterwards (step 2); do not assume it worked, and do not assume a PropertySource reran just because discovery was requested.
- If the auto property is still old after a few minutes, the PropertySource is waiting for its own schedule. Check its settings with `get_propertysource`; you can wait, or ask the portal owner to run it from the resource's Manage dialog in the UI.
- Do not "fix" it by writing the auto property by hand. The next PropertySource run overwrites it, and you hide the real state.

## Planning a change

- Tell the user the move may take a while (up to the PropertySource interval) and give the checks above, instead of re-editing the property in the hope that it speeds things up.
- When changing many resources, change the custom property on all of them first, then request discovery, then verify in bulk.
- Group rules that name a property which does not exist yet match nothing, so a brand-new dynamic group may be empty until the property is populated.
- Properties inherit down the group tree; a resource-level value overrides a group-level one. If a custom property "does not stick", look for an override at the resource.
