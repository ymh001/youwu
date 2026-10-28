export type WidgetSize = 'short' | 'tall';
export type WidgetPlacement = { id: string; column: 0 | 1 };
export type WidgetDefinition = { id: string; size?: WidgetSize };
export const WIDGET_SHORT_HEIGHT = 300;
export const WIDGET_GAP = 20;
export const widgetSpan = (size?: WidgetSize) => size === 'tall' ? 2 : 1;

/** Saved order is also the reading order on a one-column screen. */
export function defaultLayout(ids: string[], definitions: WidgetDefinition[]): WidgetPlacement[] {
  const heights = [0, 0];
  return ids.map(id => {
    const column = heights[0] <= heights[1] ? 0 : 1;
    heights[column] += widgetSpan(definitions.find(w => w.id === id)?.size);
    return { id, column };
  });
}

export function restoreLayout(saved: unknown, legacy: unknown, definitions: WidgetDefinition[]): WidgetPlacement[] {
  const valid = new Set(definitions.map(w => w.id));
  if (Array.isArray(saved) && saved.every(p => p && typeof p.id === 'string' && (p.column === 0 || p.column === 1))) {
    const seen = new Set<string>();
    return saved.filter(p => valid.has(p.id) && !seen.has(p.id) && !!seen.add(p.id)).map(p => ({ id: p.id, column: p.column }));
  }
  if (Array.isArray(legacy) && legacy.every(id => typeof id === 'string')) {
    return defaultLayout([...new Set<string>(legacy)].filter(id => valid.has(id)), definitions);
  }
  return defaultLayout(definitions.map(w => w.id), definitions);
}

export function layoutRows(layout: WidgetPlacement[], definitions: WidgetDefinition[]) {
  const rows = [1, 1];
  return layout.map(item => {
    const span = widgetSpan(definitions.find(w => w.id === item.id)?.size);
    const row = rows[item.column];
    rows[item.column] += span;
    return { ...item, row, span };
  });
}

/** Insert into a column, including an entirely empty column or its tail. */
export function moveToColumn(layout: WidgetPlacement[], id: string, column: 0 | 1, index: number): WidgetPlacement[] {
  if (!layout.some(p => p.id === id)) return layout;
  const rest = layout.filter(p => p.id !== id);
  const lane = rest.filter(p => p.column === column);
  const at = Math.max(0, Math.min(lane.length, index));
  const globalIndex = at < lane.length ? rest.findIndex(p => p.id === lane[at].id)
    : lane.length ? rest.findIndex(p => p.id === lane[lane.length - 1].id) + 1 : rest.length;
  rest.splice(globalIndex, 0, { id, column });
  return rest;
}

export function moveInReadingOrder(layout: WidgetPlacement[], id: string, index: number): WidgetPlacement[] {
  const item = layout.find(p => p.id === id);
  if (!item) return layout;
  const rest = layout.filter(p => p.id !== id);
  rest.splice(Math.max(0, Math.min(rest.length, index)), 0, item);
  return rest;
}

export function appendWidget(layout: WidgetPlacement[], id: string, definitions: WidgetDefinition[]): WidgetPlacement[] {
  if (layout.some(p => p.id === id)) return layout;
  const heights = [0, 0];
  layout.forEach(p => { heights[p.column] += widgetSpan(definitions.find(w => w.id === p.id)?.size); });
  return [...layout, { id, column: heights[0] <= heights[1] ? 0 : 1 }];
}
