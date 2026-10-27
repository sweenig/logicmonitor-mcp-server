/** Where a widget mentions a piece of text, for example filters.dataSource = "LM Manage SDTs". */
export interface WidgetReference {
  widgetId: number;
  widgetName: string;
  widgetType: string;
  dashboardId: number;
  /** Paths inside the widget that hold the text, such as "filters.dataSource" or "items[0].dataSourceDisplayName". */
  matchedIn: Array<{ path: string; value: string }>;
}

/** Fields that can name a DataSource: alert list filters, NOC items, and graph widget settings. */
export const WIDGET_REFERENCE_FIELDS = 'id,name,type,dashboardId,filters,parsedFilters,items,graphInfo,dataPoints,dataSourceFullName,dataSourceDisplayName';

function collectMatches(value: unknown, needle: string, path: string, found: Array<{ path: string; value: string }>): void {
  if (typeof value === 'string') {
    if (value.toLowerCase().includes(needle)) found.push({ path, value });
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => collectMatches(item, needle, `${path}[${i}]`, found));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      collectMatches(item, needle, path ? `${path}.${key}` : key, found);
    }
  }
}

/**
 * The widgets whose settings contain `text` (case-insensitive, anywhere in a string value), with
 * the paths that matched. LogicMonitor stores a DataSource in a widget as plain text, so this is
 * how to find the widgets to fix after renaming one. Only the name/type/id fields and the
 * settings fields (filters, items, graph settings) are searched, not the widget's own name.
 */
export function findWidgetReferences(widgets: any[], text: string): WidgetReference[] {
  const needle = text.trim().toLowerCase();
  if (!needle) return [];
  const references: WidgetReference[] = [];
  const skip = new Set(['id', 'name', 'type', 'dashboardId']);

  for (const widget of widgets) {
    const matchedIn: Array<{ path: string; value: string }> = [];
    for (const [key, value] of Object.entries(widget ?? {})) {
      if (!skip.has(key)) collectMatches(value, needle, key, matchedIn);
    }
    // parsedFilters repeats filters; keep the first spelling only
    const unique = matchedIn.filter(match => !match.path.startsWith('parsedFilters.') ||
      !matchedIn.some(other => other.path === match.path.replace('parsedFilters.', 'filters.')));
    if (unique.length > 0) {
      references.push({
        widgetId: widget.id,
        widgetName: widget.name,
        widgetType: widget.type,
        dashboardId: widget.dashboardId,
        matchedIn: unique,
      });
    }
  }
  return references;
}
