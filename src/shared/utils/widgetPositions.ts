import type { Widget } from '@shared/types';

export interface WidgetGridPosition {
  column: number;
  row: number;
}

export function getResponsiveWidgetPositions(widgets: Widget[], columnCount: number): Map<string, WidgetGridPosition> {
  const sourceColumns = Math.max(
    1,
    ...widgets.map((widget) => widget.layoutColumns ?? 0),
    ...widgets
      .filter((widget) => widget.layoutColumns === undefined)
      .map((widget) => (widget.col ?? 0) + 1)
  );
  const nextRows = new Map<number, number>();
  const positions = new Map<string, WidgetGridPosition>();

  widgets
    .map((widget, index) => ({
      widget,
      index,
      column: Math.min(Math.max(widget.col ?? 0, 0), sourceColumns - 1),
      row: Math.max(widget.order, 0)
    }))
    .sort((a, b) => a.column - b.column || a.row - b.row || a.index - b.index)
    .forEach(({ widget, column: sourceColumn }) => {
      const column = sourceColumns === 1
        ? 0
        : Math.round(sourceColumn * (columnCount - 1) / (sourceColumns - 1));
      const row = nextRows.get(column) ?? 0;
      nextRows.set(column, row + 1);
      positions.set(widget.id, { column, row });
    });

  return positions;
}
