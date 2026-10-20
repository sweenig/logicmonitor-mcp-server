/**
 * Compact default view of a DataSource definition.
 *
 * The full object returned by GET /setting/datasources/{id} embeds every script (collection and
 * discovery), every datapoint with its alert message templates, and access-group details; for a
 * typical DataSource that is tens of thousands of characters, more than most callers can use.
 * This keeps what is needed to understand how a DataSource works (identity, appliesTo, collection
 * method, intervals, datapoint names and thresholds) and replaces the bulky parts with pointers.
 * The raw object stays available by asking for specific fields (for example fields="*"), and the
 * scripts through get_datasource_scripts.
 */

const SCRIPT_FIELDS = new Set(['groovyScript', 'windowsScript', 'linuxScript', 'winScript']);
const MAX_TEXT_LENGTH = 300;

// Datapoint fields kept in the compact view (housekeeping and message templates are dropped).
const DATAPOINT_SCALAR_FIELDS = [
  'id', 'name', 'type', 'dataType', 'postProcessorMethod', 'rawDataFieldName',
  'alertExpr', 'alertTransitionInterval', 'alertClearTransitionInterval', 'alertForNoData',
];
const DATAPOINT_OPTIONAL_FIELDS = ['userParam1', 'userParam2', 'userParam3'];

const SCRIPT_HINT = 'use get_datasource_scripts';

function truncate(text: string, hint: string): string {
  return text.length > MAX_TEXT_LENGTH
    ? `${text.slice(0, MAX_TEXT_LENGTH)}... (${text.length} chars, ${hint})`
    : text;
}

/** Copy of value with embedded script bodies replaced by a size marker; reports whether any were replaced. */
function stripScripts(value: any, state: { replaced: boolean }): any {
  if (Array.isArray(value)) {
    return value.map(item => stripScripts(item, state));
  }
  if (value && typeof value === 'object') {
    const copy: Record<string, any> = {};
    for (const [key, inner] of Object.entries(value)) {
      if (SCRIPT_FIELDS.has(key) && typeof inner === 'string' && inner.length > 0) {
        copy[key] = `<${inner.length} chars; ${SCRIPT_HINT}>`;
        state.replaced = true;
      } else {
        copy[key] = stripScripts(inner, state);
      }
    }
    return copy;
  }
  return value;
}

function compactDataPoint(dataPoint: any): any {
  const compact: Record<string, any> = {};
  for (const field of DATAPOINT_SCALAR_FIELDS) {
    if (dataPoint?.[field] !== undefined && dataPoint[field] !== '') {
      compact[field] = dataPoint[field];
    }
  }
  for (const field of DATAPOINT_OPTIONAL_FIELDS) {
    if (typeof dataPoint?.[field] === 'string' && dataPoint[field] !== '') {
      compact[field] = dataPoint[field];
    }
  }
  if (typeof dataPoint?.description === 'string' && dataPoint.description !== '') {
    compact.description = truncate(dataPoint.description, 'pass fields for the full text');
  }
  if (typeof dataPoint?.postProcessorParam === 'string' && dataPoint.postProcessorParam !== '') {
    compact.postProcessorParam = truncate(dataPoint.postProcessorParam, `${SCRIPT_HINT} or fields`);
  }
  return compact;
}

/**
 * Return a compact copy of a DataSource definition. The input is not modified. A `note` explaining
 * what was left out is added only when something actually was.
 */
export function curateDataSource(dataSource: any): any {
  if (!dataSource || typeof dataSource !== 'object' || Array.isArray(dataSource)) {
    return dataSource;
  }

  const state = { replaced: false };
  let trimmed = false;
  const curated: Record<string, any> = {};

  for (const [key, value] of Object.entries(dataSource)) {
    if (key === 'accessGroups') {
      // accessGroupIds already identifies them; the expanded objects are noise here.
      trimmed = true;
    } else if (key === 'dataPoints' && Array.isArray(value)) {
      curated.dataPoints = value.map(compactDataPoint);
      trimmed = true;
    } else {
      curated[key] = stripScripts(value, state);
    }
  }

  if (state.replaced || trimmed) {
    curated.note =
      'Compact view: script bodies, alert message templates, per-datapoint housekeeping fields and access-group details are omitted. ' +
      'Use get_datasource_scripts for the scripts, or pass fields (for example fields="*") for the full raw definition.';
  }
  return curated;
}
