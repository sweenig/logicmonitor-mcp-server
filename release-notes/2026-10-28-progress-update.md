# LogicMonitor MCP Server: Progress Update

**October 26–28, 2026**

This period focused on building and maintaining DataSources and dashboards, with fewer manual steps along the way.

## New capabilities
- **DataSource graphs:** view, create, update, and delete DataSource overview and instance graphs.
- **Building DataSources:** easier script-based DataSources with sensible defaults, plus a way to test a DataSource against a device before rolling it out. A guided prompt now builds an SNMP DataSource from a MIB table, proposing instances, datapoints, and thresholds for your review.
- **DataSource usage:** find the resources a DataSource is applied to, and the dashboard widgets that reference it, which makes renaming a DataSource much safer.
- **Dashboards and widgets:** make dashboards in a folder public, set dashboard-level property filters, and change an alert list widget's columns without resending the whole widget.

## Smarter, faster responses
- **Unique instance identifiers:** DataSources can now be created or updated to name instances by their unique value.

## Reliability and clarity
- **Clearer guidance:** creating a DataSource graph now asks for the vertical label up front, and column changes that can't work are refused with an explanation rather than silently ignored.
- **Safer testing:** the full test suite now passes in a clean environment, so changes are checked more reliably before they reach your portals.

More DataSource and dashboard coverage is on the way.
