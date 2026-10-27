import { describe, it, expect } from '@jest/globals';
import { findWidgetReferences } from './widget-references.js';

const widgets = [
  { id: 1, name: 'Alerts', type: 'alert', dashboardId: 9, filters: { dataSource: 'LM Manage SDTs', dataPoint: 'x' }, parsedFilters: { dataSource: 'LM Manage SDTs' } },
  { id: 2, name: 'NOC', type: 'noc', dashboardId: 9, items: [{ dataSourceDisplayName: 'Other' }, { dataSourceDisplayName: 'lm manage sdts' }] },
  { id: 3, name: 'LM Manage SDTs title only', type: 'alert', dashboardId: 9, filters: { dataSource: 'Collector*' } },
  { id: 4, name: 'Graph', type: 'ograph', dashboardId: 10, graphInfo: { dataPoints: [{ dataSourceFullName: 'LM_Manage_SDTs' }] } },
];

describe('findWidgetReferences', () => {
  it('finds the widgets naming the text, case-insensitively, with where it matched', () => {
    const result = findWidgetReferences(widgets, 'LM Manage SDTs');
    expect(result.map(r => r.widgetId)).toEqual([1, 2]);
    expect(result[0].matchedIn).toEqual([{ path: 'filters.dataSource', value: 'LM Manage SDTs' }]);
    expect(result[1].matchedIn).toEqual([{ path: 'items[1].dataSourceDisplayName', value: 'lm manage sdts' }]);
  });

  it('finds the internal name in graph settings and ignores the widget\'s own name', () => {
    expect(findWidgetReferences(widgets, 'LM_Manage_SDTs').map(r => r.widgetId)).toEqual([4]);
  });

  it('returns nothing for empty text or no match', () => {
    expect(findWidgetReferences(widgets, '  ')).toEqual([]);
    expect(findWidgetReferences(widgets, 'nothing here')).toEqual([]);
  });
});
