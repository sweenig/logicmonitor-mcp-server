import { InvalidArgumentError } from '../core/error-handler.js';

/** One change to an alert list widget's column list (see applyColumnChanges). */
export interface ColumnChange {
  /** Existing column to change, for example "alert-static-threshold" or "alert-began". */
  columnKey?: string;
  /** Custom column: a property name (auto.sdt.admin) or an alert token (##ALERTVALUEDISPLAYSTATUSNAME##). Added if not there yet. */
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
