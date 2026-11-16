import { InvalidArgumentError } from '../core/error-handler.js';

/** One change to an alert list widget's column list (see applyColumnChanges). */
export interface ColumnChange {
  /** Existing column to change, for example "alert-static-threshold" or "alert-began". */
  columnKey?: string;
  /**
   * Custom column: a property or alert token, written as ##auto.sdt.admin## for an instance or resource
   * property (instance properties carry the auto. prefix) or ##ALERTVALUEDISPLAYSTATUSNAME## for an alert
   * token; a resource property also works as a bare name (system.hostname). Added if not there yet.
   * LogicMonitor looks the value up by the column's label, so the label of a custom column is the token
   * itself and cannot be renamed.
   */
  token?: string;
  visible?: boolean;
  columnLabel?: string;
  columnSize?: number;
  /** columnKey to place the column after; for a new visible column the default is after the last visible one. */
  after?: string;
}

/** columnKey LogicMonitor's UI gives a custom column: "#" becomes "_23" and the first "." becomes "_". */
export function customColumnKey(token: string): string {
  return token.replace(/#/g, '_23').replace('.', '_');
}

function toBoolean(value: unknown): boolean {
  return value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true');
}

/**
 * Applies column changes to an alert widget's displaySettings.columns and returns the new list;
 * the input is not modified. Existing columns are changed in place (visibility, label, size,
 * position), a custom column named by "token" is created when missing.
 */
export function applyColumnChanges(columns: any[], changes: ColumnChange[]): any[] {
  const result = columns.map(column => ({ ...column }));

  for (const change of changes) {
    if (!change || (!change.columnKey && !change.token)) {
      throw new InvalidArgumentError(`Each column change needs a columnKey (existing column) or a token (custom column), got ${JSON.stringify(change)}.`);
    }
    const key = change.columnKey ?? customColumnKey(change.token as string);
    let after = change.after;
    let index = result.findIndex(column => column.columnKey === key);

    if (index === -1) {
      if (!change.token) {
        throw new InvalidArgumentError(
          `The widget has no column with columnKey "${change.columnKey}". Its columns: ${result.map(column => column.columnKey).join(', ')}.`
        );
      }
      result.push({
        isDynamic: true,
        visible: true,
        columnLabel: change.token,
        columnSize: 150,
        isSortable: false,
        componentName: 'AlertList',
        columnKey: key,
        dataPath: ['customColumns', change.token],
      });
      index = result.length - 1;
      // a new column goes after the last visible one unless "after" says otherwise
      if (after === undefined) {
        const lastVisible = result.map((column, i) => (i < index && column.visible ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
        after = lastVisible === -1 ? undefined : result[lastVisible].columnKey;
      }
    }

    const column = result[index];
    if (column.isDynamic && change.columnLabel !== undefined && change.columnLabel !== column.columnLabel) {
      throw new InvalidArgumentError(
        `The label of a custom column is the token LogicMonitor looks up ("${column.columnLabel}"); renaming it to "${change.columnLabel}" would leave the column blank. Leave columnLabel out.`
      );
    }
    if (change.visible !== undefined) column.visible = toBoolean(change.visible);
    if (change.columnLabel !== undefined) column.columnLabel = change.columnLabel;
    if (change.columnSize !== undefined) column.columnSize = Number(change.columnSize);

    if (after !== undefined) {
      const [moved] = result.splice(index, 1);
      const afterIndex = result.findIndex(other => other.columnKey === after);
      if (afterIndex === -1) {
        throw new InvalidArgumentError(`"after" column "${after}" not found. Columns: ${result.map(other => other.columnKey).join(', ')}.`);
      }
      result.splice(afterIndex + 1, 0, moved);
    }
  }
  return result;
}

/** Standard alert list columns as LogicMonitor's UI writes them: [columnKey, label, size, component, dataPath, visible by default, extra]. */
const STANDARD_ALERT_COLUMNS: Array<[string, string, number, string | undefined, string[], boolean, Record<string, unknown>?, boolean?]> = [
  ['alert-severity', 'Severity', 90, 'AlertSeverityChipCell', [], true, { isRightAligned: true, minSize: 82 }, true],
  ['alert-began', 'Reported At', 130, 'SpaceDateTime', ['reportedAtMS'], true, { passthroughProps: { hasRelativeTime: true } }, true],
  ['alert-device', 'Resource/Website', 200, 'ForeignKeyCell', ['monitoredObjectId'], true, { passthroughProps: { hasDisplayName: true, hasIcon: false } }, true],
  ['alert-datasource-instance', 'Instance', 280, 'ForeignKeyCell', ['instanceId'], true, { passthroughProps: { hasDisplayName: true, hasIcon: false } }, true],
  ['alert-datasource', 'LogicModule', 120, 'ForeignKeyCell', ['moduleId'], false, { passthroughProps: { hasDisplayName: true, hasIcon: false } }, true],
  ['alert-datapoint', 'Datapoint', 150, 'SpaceId', ['datapointId'], true, {}, true],
  ['alert-value', 'Alert Value', 100, 'AlertValue', ['alertValue'], true],
  ['alert-static-threshold', 'Static Threshold', 120, 'ThresholdCell', ['threshold'], false],
  ['alert-group', 'Group', 120, 'AlertWidgetGroupsCell', ['monitoredObjectGroups'], false, { passthroughProps: { hasIcon: false, type: 'dg' } }],
  ['alert-notes', 'Notes', 120, 'Body1', ['notes'], false],
  ['alert-acked-by', 'ACK By', 120, 'Body1', ['ACKBy'], false],
  ['alert-in-sdt', 'Is In SDT', 120, 'Body1', ['isSDT'], false],
  ['alert-dynamic-threshold', 'Dynamic Threshold', 120, 'ThresholdCell', ['threshold'], false],
  ['alertExternalTicketUrl', 'ServiceNow incident', 120, 'SNIncidentCell', ['alertExternalTicketUrl'], false],
  ['connectwiseTicketLinks', 'ConnectWise incident', 120, 'ExternalTicketLinksCell', ['alertExternalTicketUrl', 'connectwiseTicketLinks'], false],
  ['pagerdutyIncidentLinks', 'PagerDuty incident', 120, 'ExternalTicketLinksCell', ['alertExternalTicketUrl', 'pagerdutyIncidentLinks'], false],
  ['jsmIssueLinks', 'JSM incident', 120, 'ExternalTicketLinksCell', ['alertExternalTicketUrl', 'jsmIssueLinks'], false],
  ['customHttpTicketLinks', 'Custom HTTP incident', 120, 'ExternalTicketLinksCell', ['alertExternalTicketUrl', 'customHttpTicketLinks'], false],
  ['autotaskTicketLinks', 'Autotask incident', 120, 'ExternalTicketLinksCell', ['alertExternalTicketUrl', 'autotaskTicketLinks'], false],
  ['alert-acked-on', 'ACK At', 120, 'SpaceDateTime', ['ACKAtMS'], false, { passthroughProps: { hasRelativeTime: false } }],
  ['alert-cleared-on', 'Cleared At', 120, 'SpaceDateTime', ['clearedAtMS'], false, { passthroughProps: { hasRelativeTime: true } }],
  ['alert-historical-sdt', 'Historical SDT', 120, 'HistoricalSdtCell', ['sdtIds'], false],
  ['alert-rule-name', 'Alert Rule', 120, 'SpaceId', ['ruleId'], false],
  ['alert-escalation-chain', 'Escalation Chain', 120, 'SpaceId', ['escalationChainId'], false],
  ['alert-datasource-instance-description', 'Instance Description', 120, 'Body1', ['instanceDescription'], false],
  ['alert-full-path', 'Full Path', 120, 'Body1', ['fullPath'], false],
  ['alert-routing-state', 'Notification State', 120, undefined, ['dependencyRoutingState'], false],
  ['alert-dependency-role', 'Dependency Role', 120, 'Body1', ['dependencyRole'], false],
  ['alert-suppression-type', 'Suppression Type', 120, 'Body1', ['suppressionType'], false],
  ['alert-dependent-alerts', 'Dependent Alerts Count', 120, 'Body1', ['dependentAlertsCount'], false],
  ['alert-grouping-criteria', 'Alert Grouping Criteria', 120, 'Body1', ['alertGroupEntityValue'], false],
  ['alert-log-metadata', 'Log Metadata', 120, 'Body1', ['logMetaData'], false],
  ['alert-log-partition', 'Logs Partition', 120, 'Body1', ['logPartition'], false],
];

/**
 * The column list LogicMonitor's UI gives a new alert list widget, with the columns worth showing by
 * default visible (severity, reported at, resource, instance, datapoint, value) and the rest hidden.
 * LogicMonitor creates an alert widget with no columns when none are sent.
 */
export function defaultAlertColumns(): any[] {
  return STANDARD_ALERT_COLUMNS.map(([columnKey, columnLabel, columnSize, componentName, dataPath, visible, extra, sortable]) => {
    const column: any = { visible, columnLabel, columnSize, isSortable: sortable === true, columnKey };
    if (componentName) column.componentName = componentName;
    if (dataPath.length) column.dataPath = dataPath;
    return Object.assign(column, extra ?? {});
  });
}

/** One change to a dynamic table widget's columns (see applyTableColumnChanges). */
export interface TableColumnChange {
  /** Instance property to show as a column, without hashes or auto. changes (for example auto.lm.token.owner). */
  instanceProperty?: string;
  /** Column heading. For a datapoint column it names the existing column (or the new one); for a property column it defaults to the property name. */
  columnName?: string;
  /** Datapoint to show as a column; for a new column dataPointId is needed too (get_datasource lists both). */
  dataPointName?: string;
  dataPointId?: number;
  remove?: boolean;
  columnSize?: number;
  displayType?: string;
  minValue?: number;
  maxValue?: number;
  unitLabel?: string;
  roundingDecimal?: number;
  rpn?: string;
  colorThresholds?: Array<{ relation: string; threshold: number; level: number }>;
}

/** LogicMonitor refuses an 11th datapoint column. */
export const MAX_TABLE_DATAPOINT_COLUMNS = 10;

const DATAPOINT_FIELDS = ['displayType', 'minValue', 'maxValue', 'unitLabel', 'roundingDecimal', 'rpn', 'colorThresholds'] as const;

/**
 * Applies column changes to a dynamic table widget and returns the new `displaySettings` and `columns`.
 * LogicMonitor keeps the datapoint columns three times (top-level `columns`, `displaySettings.columnsV4`
 * and `displaySettings.columns`) and the instance property columns in `displaySettings.instanceColumns`
 * with an index that continues after the datapoint columns; all of them are kept in step here.
 * The inputs are not modified.
 */
export function applyTableColumnChanges(
  widget: { displaySettings?: any; columns?: any[] },
  changes: TableColumnChange[]
): { displaySettings: any; columns: any[] } {
  const settings: any = JSON.parse(JSON.stringify(widget.displaySettings ?? {}));
  let dpColumns: any[] = JSON.parse(JSON.stringify(widget.columns ?? []));
  let v4: any[] = Array.isArray(settings.columnsV4) ? settings.columnsV4 : [];
  let display: any[] = Array.isArray(settings.columns) ? settings.columns : [];
  // instanceColumns is [{ "<property>": { index, columnName } }]; keep it as property/name pairs while editing
  let props: Array<{ property: string; columnName: string }> = (Array.isArray(settings.instanceColumns) ? settings.instanceColumns : []).map((entry: any) => {
    const property = Object.keys(entry)[0];
    return { property, columnName: entry[property]?.columnName ?? property };
  });

  const displayIndex = (label: string) => display.findIndex(column => column.columnLabel === label);

  for (const change of changes) {
    if (!change || (!change.instanceProperty && !change.columnName)) {
      throw new InvalidArgumentError(`Each table column change needs an instanceProperty (property column) or a columnName (datapoint column), got ${JSON.stringify(change)}.`);
    }

    if (change.instanceProperty) {
      const property = change.instanceProperty.replace(/^#+|#+$/g, '');
      const existing = props.findIndex(p => p.property === property);
      if (change.remove) {
        if (existing === -1) throw new InvalidArgumentError(`The table has no instance property column "${property}". It has: ${props.map(p => p.property).join(', ') || 'none'}.`);
        const [gone] = props.splice(existing, 1);
        const at = displayIndex(gone.columnName);
        if (at !== -1) display.splice(at, 1);
        continue;
      }
      const columnName = change.columnName ?? (existing === -1 ? property : props[existing].columnName);
      if (existing === -1) {
        props.push({ property, columnName });
        display.push({ visible: true, columnLabel: columnName, columnSize: change.columnSize ?? 150, columnKey: columnName });
      } else {
        const at = displayIndex(props[existing].columnName);
        props[existing].columnName = columnName;
        if (at !== -1) {
          display[at].columnLabel = columnName;
          display[at].columnKey = columnName;
          if (change.columnSize !== undefined) display[at].columnSize = Number(change.columnSize);
        }
      }
      continue;
    }

    // datapoint column
    const name = change.columnName as string;
    const existing = dpColumns.findIndex(column => column.columnName === name);
    if (change.remove) {
      if (existing === -1) throw new InvalidArgumentError(`The table has no datapoint column "${name}". It has: ${dpColumns.map(c => c.columnName).join(', ') || 'none'}.`);
      dpColumns.splice(existing, 1);
      v4 = v4.filter(column => column.columnName !== name);
      const at = displayIndex(name);
      if (at !== -1) display.splice(at, 1);
      continue;
    }
    if (existing === -1) {
      if (!change.dataPointName || change.dataPointId === undefined) {
        throw new InvalidArgumentError(`"${name}" is not a column of the table. To add a datapoint column send dataPointName and dataPointId as well (get_datasource lists them); the table has: ${dpColumns.map(c => c.columnName).join(', ') || 'none'}.`);
      }
      if (dpColumns.length >= MAX_TABLE_DATAPOINT_COLUMNS) {
        throw new InvalidArgumentError(`A table accepts ${MAX_TABLE_DATAPOINT_COLUMNS} datapoint columns; remove one before adding "${name}".`);
      }
      dpColumns.push({
        columnName: name,
        dataPointId: Number(change.dataPointId),
        dataPointName: change.dataPointName,
        unitLabel: '',
        enableForecast: false,
        roundingDecimal: 0,
        rpn: '',
        displayType: 'raw',
        colorThresholds: [],
      });
      v4.push({ columnName: name, dataPointName: change.dataPointName, enableForecast: false, propertiesOptions: '1', unitLabel: '', roundingDecimal: 0, rpn: '', displayType: 'raw', colorThresholds: [] });
      // a datapoint column goes after the last datapoint column, ahead of the property columns
      const entry = { visible: true, columnLabel: name, columnSize: change.columnSize ?? 150, columnKey: name };
      const lastDp = dpColumns.slice(0, -1).map(c => displayIndex(c.columnName)).reduce((a, b) => Math.max(a, b), 0);
      display.splice(lastDp + 1, 0, entry);
    }
    const at = dpColumns.findIndex(column => column.columnName === name);
    const target = dpColumns[at];
    const v4Target = v4.find(column => column.columnName === name);
    for (const field of DATAPOINT_FIELDS) {
      if (change[field] === undefined) continue;
      const value = field === 'colorThresholds' ? change.colorThresholds : change[field];
      target[field] = value;
      if (v4Target) v4Target[field] = value;
    }
    if (change.columnSize !== undefined) {
      const d = displayIndex(name);
      if (d !== -1) display[d].columnSize = Number(change.columnSize);
    }
  }

  // reindex: datapoint columns 0..n-1, property columns continue after them
  v4 = dpColumns.map((column, i) => {
    const { dataPointId, ...fromColumn } = column;
    const found = v4.find(other => other.columnName === column.columnName) ?? { ...fromColumn, propertiesOptions: '1' };
    return { ...found, index: i, position: i, id: found.id ?? `${column.columnName}_${i}`, columnName: column.columnName };
  });
  settings.columnsV4 = v4;
  settings.columns = display;
  settings.instanceColumns = props.map((p, i) => ({ [p.property]: { index: dpColumns.length + i, columnName: p.columnName } }));
  if (!Array.isArray(settings.propertyColumns)) settings.propertyColumns = [];
  return { displaySettings: settings, columns: dpColumns };
}
