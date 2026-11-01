import { useRef, useState, useMemo } from 'preact/hooks';
import type { Widget } from '@shared/types';
import { useI18n } from '@shared/i18n';
import { WidgetCard } from './WidgetCard';
import { LinksWidgetView } from './LinksWidget';
import { CalendarWidgetView } from './CalendarWidget';
import { ClockWidgetView } from './ClockWidget';
import { WeatherWidgetView } from './WeatherWidget';
import { TodoWidgetView, type TodoDragState } from './TodoWidget';
import { useColumnCount } from '../../hooks/useColumnCount';
import { getResponsiveWidgetPositions } from '@shared/utils/widgetPositions';
import type { LinkPlacement } from '@shared/storage/links';

interface WidgetGridProps {
  widgets: Widget[];
  openInNewTab: boolean;
  onOpenLink?: (url: string) => void;
  onReorder: (widgets: Widget[]) => void;
  onEditWidget: (widget: Widget) => void;
  onDeleteWidget: (widgetId: string) => void;
  onDeleteLink: (widgetId: string, linkId: string) => void;
  onEditLink?: (widgetId: string, linkId: string) => void;
  onAddLink?: (widget: Widget) => void;
  onAddGroup?: (widget: Widget) => void;
  onResizeWidget?: (widgetId: string, height: number) => void;
  onAddWidget?: () => void;
  onMoveLink?: (
    fromWidgetId: string,
    toWidgetId: string,
    linkId: string,
    toIndex: number,
    toGroupId?: string | null,
    placement?: LinkPlacement | null
  ) => void;
  onMoveGroup?: (fromWidgetId: string, toWidgetId: string, groupId: string) => void;
  onRenameGroup?: (widgetId: string, groupId: string, title: string) => void;
  onDeleteGroup?: (widgetId: string, groupId: string) => void;
  onReorderGroup?: (widgetId: string, groupId: string, toIndex: number) => void;
  onExplodeGroup?: (
    fromWidgetId: string,
    groupId: string,
    target: { col: number; targetId: string | null; position: 'before' | 'after' | 'into'; columnCount: number }
  ) => void;
  onMergeWidget?: (fromWidgetId: string, toWidgetId: string) => void;
  onAddTodo?: (widgetId: string, text: string) => void;
  onToggleTodo?: (widgetId: string, todoId: string) => void;
  onUpdateTodo?: (widgetId: string, todoId: string, text: string) => void;
  onDeleteTodo?: (widgetId: string, todoId: string) => void;
  onMoveTodo?: (fromWidgetId: string, toWidgetId: string, todoId: string, toIndex: number) => void;
  isEditing?: boolean;
}

interface DragTarget {
  widgetId: string | null;
  col: number | null;
  targetId: string | null;
  position: 'before' | 'after' | 'into' | null;
}

interface LinkDragState {
  linkId: string | null;
  fromWidgetId: string | null;
}

interface GroupDragState {
  groupId: string | null;
  fromWidgetId: string | null;
}

export function WidgetGrid({
  widgets,
  openInNewTab,
  onOpenLink,
  onReorder,
  onEditWidget,
  onDeleteWidget,
  onDeleteLink,
  onEditLink,
  onAddLink,
  onAddGroup,
  onResizeWidget,
  onAddWidget,
  onMoveLink,
  onMoveGroup,
  onRenameGroup,
  onDeleteGroup,
  onReorderGroup,
  onExplodeGroup,
  onMergeWidget,
  onAddTodo,
  onToggleTodo,
  onUpdateTodo,
  onDeleteTodo,
  onMoveTodo,
  isEditing = true
}: WidgetGridProps) {
  const { t } = useI18n();
  const gridRef = useRef<HTMLDivElement>(null);
  const columnCount = useColumnCount(gridRef);
  const [drag, setDrag] = useState<DragTarget>({ widgetId: null, col: null, targetId: null, position: null });
  const [linkDrag, setLinkDrag] = useState<LinkDragState>({ linkId: null, fromWidgetId: null });
  const [groupDrag, setGroupDrag] = useState<GroupDragState>({ groupId: null, fromWidgetId: null });
  const [todoDrag, setTodoDrag] = useState<TodoDragState>({ todoId: null, fromWidgetId: null });
  const widgetPositions = useMemo(
    () => getResponsiveWidgetPositions(widgets, columnCount),
    [widgets, columnCount]
  );

  const columns = useMemo(() => {
    const cols: Widget[][] = Array.from({ length: columnCount }, () => []);
    for (const w of widgets) {
      const col = widgetPositions.get(w.id)?.column ?? 0;
      cols[col].push(w);
    }
    for (const col of cols) {
      col.sort((a, b) => (widgetPositions.get(a.id)?.row ?? 0) - (widgetPositions.get(b.id)?.row ?? 0));
    }
    return cols;
  }, [widgets, columnCount, widgetPositions]);

  const handleDragStart = (e: DragEvent, id: string) => {
    setDrag({ widgetId: id, col: null, targetId: null, position: null });
    e.dataTransfer?.setData('text/plain', id);
    e.dataTransfer?.setDragImage(new Image(), 0, 0);
  };

  const handleDragOverWidget = (e: DragEvent, widget: Widget) => {
    if (groupDrag.groupId) {
      e.preventDefault();
      e.stopPropagation();
      if (widget.type === 'links') {
        const col = widgetPositions.get(widget.id)?.column ?? 0;
        setDrag({ widgetId: null, col, targetId: widget.id, position: 'into' });
        return;
      }
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const position = e.clientY < midY ? 'before' : 'after';
      const col = widgetPositions.get(widget.id)?.column ?? 0;
      setDrag({ widgetId: null, col, targetId: widget.id, position });
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (!drag.widgetId || drag.widgetId === widget.id) {
      setDrag((prev) => ({ ...prev, col: null, targetId: null, position: null }));
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relativeY = (e.clientY - rect.top) / rect.height;
    const draggedWidget = widgets.find((entry) => entry.id === drag.widgetId);
    const bothLinks = draggedWidget?.type === 'links' && widget.type === 'links';
    const position: 'before' | 'after' | 'into' = bothLinks
      ? (relativeY < 0.3 ? 'before' : relativeY > 0.7 ? 'after' : 'into')
      : (e.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
    const col = widgetPositions.get(widget.id)?.column ?? 0;
    setDrag({ widgetId: drag.widgetId, col, targetId: widget.id, position });
  };

  const handleDragOverColumn = (e: DragEvent, colIndex: number) => {
    e.preventDefault();

    if (groupDrag.groupId) {
      const cards = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-widget-id]'));
      const nextCard = cards.find((card) => e.clientY < card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2);

      if (nextCard?.dataset.widgetId) {
        setDrag({ widgetId: null, col: colIndex, targetId: nextCard.dataset.widgetId, position: 'before' });
        return;
      }

      const lastCard = cards[cards.length - 1];
      setDrag({
        widgetId: null,
        col: colIndex,
        targetId: lastCard?.dataset.widgetId ?? null,
        position: lastCard ? 'after' : 'into'
      });
      return;
    }

    if (!drag.widgetId) return;

    const cards = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-widget-id]'))
      .filter((card) => card.dataset.widgetId !== drag.widgetId);
    const nextCard = cards.find((card) => e.clientY < card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2);

    if (nextCard?.dataset.widgetId) {
      setDrag({ widgetId: drag.widgetId, col: colIndex, targetId: nextCard.dataset.widgetId, position: 'before' });
      return;
    }

    const lastCard = cards[cards.length - 1];
    setDrag({
      widgetId: drag.widgetId,
      col: colIndex,
      targetId: lastCard?.dataset.widgetId ?? null,
      position: lastCard ? 'after' : 'into'
    });
  };

  const commitReorder = (fn: (byCol: Widget[][]) => void) => {
    const byCol: Widget[][] = Array.from({ length: columnCount }, () => []);
    const copy = widgets.map((w) => ({ ...w }));
    for (const w of copy) {
      const c = widgetPositions.get(w.id)?.column ?? 0;
      byCol[c].push(w);
    }
    for (const col of byCol) {
      col.sort((a, b) => (widgetPositions.get(a.id)?.row ?? 0) - (widgetPositions.get(b.id)?.row ?? 0));
    }
    fn(byCol);
    byCol.forEach((col, column) => {
      col.forEach((w, i) => {
        w.col = column;
        w.order = i;
        w.layoutColumns = columnCount;
      });
    });
    const result = byCol.flat();
    onReorder(result);
  };

  const handleDropOnWidget = (e: DragEvent, targetWidget: Widget) => {
    if (groupDrag.groupId) {
      e.preventDefault();
      e.stopPropagation();
      if (targetWidget.type === 'links') {
        handleGroupDrop(targetWidget.id);
        return;
      }
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const position = drag.targetId === targetWidget.id && drag.position === 'after'
        ? 'after'
        : e.clientY < midY ? 'before' : 'after';
      const col = widgetPositions.get(targetWidget.id)?.column ?? drag.col ?? 0;
      if (onExplodeGroup && groupDrag.fromWidgetId && groupDrag.groupId) {
        onExplodeGroup(groupDrag.fromWidgetId, groupDrag.groupId, {
          col,
          targetId: targetWidget.id,
          position,
          columnCount
        });
      }
      setDrag({ widgetId: null, col: null, targetId: null, position: null });
      setGroupDrag({ groupId: null, fromWidgetId: null });
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (!drag.widgetId || drag.widgetId === targetWidget.id) {
      setDrag({ widgetId: null, col: null, targetId: null, position: null });
      return;
    }

    const draggedWidget = widgets.find((entry) => entry.id === drag.widgetId);
    if (drag.position === 'into' && targetWidget.type === 'links' && draggedWidget?.type === 'links') {
      onMergeWidget?.(drag.widgetId, targetWidget.id);
      setDrag({ widgetId: null, col: null, targetId: null, position: null });
      return;
    }

    const targetCol = widgetPositions.get(targetWidget.id)?.column ?? 0;
    const position = drag.position;

    commitReorder((byCol) => {
      const moved = byCol.flat().find((w) => w.id === drag.widgetId);
      if (!moved) return;
      for (const col of byCol) {
        const idx = col.findIndex((w) => w.id === drag.widgetId);
        if (idx !== -1) { col.splice(idx, 1); break; }
      }
      moved.col = targetCol;
      const targetIndex = byCol[targetCol].findIndex((w) => w.id === targetWidget.id);
      const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
      byCol[targetCol].splice(insertIndex, 0, moved);
    });

    setDrag({ widgetId: null, col: null, targetId: null, position: null });
  };

  const handleDropOnColumn = (e: DragEvent, colIndex: number) => {
    e.preventDefault();

    if (groupDrag.groupId) {
      const { groupId, fromWidgetId } = groupDrag;
      if (onExplodeGroup && groupId && fromWidgetId) {
        onExplodeGroup(fromWidgetId, groupId, {
          col: drag.col ?? colIndex,
          targetId: drag.targetId,
          position: drag.position ?? 'into',
          columnCount
        });
      }
      setDrag({ widgetId: null, col: null, targetId: null, position: null });
      setGroupDrag({ groupId: null, fromWidgetId: null });
      return;
    }

    if (!drag.widgetId) {
      setDrag({ widgetId: null, col: null, targetId: null, position: null });
      return;
    }

    const targetWidget = drag.targetId ? columns[colIndex].find((widget) => widget.id === drag.targetId) : undefined;
    if (targetWidget && drag.position !== 'into') {
      handleDropOnWidget(e, targetWidget);
      return;
    }

    commitReorder((byCol) => {
      let moved: Widget | undefined;
      for (const col of byCol) {
        const idx = col.findIndex((w) => w.id === drag.widgetId);
        if (idx !== -1) { moved = col.splice(idx, 1)[0]; break; }
      }
      if (!moved) return;
      moved.col = colIndex;
      byCol[colIndex].push(moved);
    });

    setDrag({ widgetId: null, col: null, targetId: null, position: null });
  };

  const handleDragEnd = () => {
    setDrag({ widgetId: null, col: null, targetId: null, position: null });
  };

  const handleLinkDragStart = (e: DragEvent, linkId: string, widgetId: string) => {
    if (groupDrag.groupId) return;
    e.dataTransfer?.setData('text/plain', JSON.stringify({ linkId, widgetId }));
    e.dataTransfer?.setDragImage(new Image(), 0, 0);
    setLinkDrag({ linkId, fromWidgetId: widgetId });
  };

  const handleLinkDragEnd = () => {
    setLinkDrag({ linkId: null, fromWidgetId: null });
  };

  const handleLinkDrop = (
    targetWidgetId: string,
    targetGroupId: string | null,
    targetLinkId: string | null,
    position: 'before' | 'after',
    targetGroupEntryId?: string | null
  ) => {
    if (!linkDrag.linkId || !linkDrag.fromWidgetId) {
      setLinkDrag({ linkId: null, fromWidgetId: null });
      return;
    }

    if (!onMoveLink) {
      setLinkDrag({ linkId: null, fromWidgetId: null });
      return;
    }

    const targetWidget = widgets.find((w) => w.id === targetWidgetId);
    if (!targetWidget || targetWidget.type !== 'links') {
      setLinkDrag({ linkId: null, fromWidgetId: null });
      return;
    }

    // I1: soltar sobre o próprio link não muda nada.
    if (targetLinkId && targetLinkId === linkDrag.linkId) {
      setLinkDrag({ linkId: null, fromWidgetId: null });
      return;
    }

    const targetGroups = targetWidget.groups ?? [];
    const targetGroupExists = !!targetGroupId && targetGroups.some((group) => group.id === targetGroupId);
    const groupId = targetGroupExists ? targetGroupId : null;
    const targetItems = targetWidget.items;
    const belongsToTargetGroup = (item: (typeof targetItems)[number]): boolean => (
      groupId
        ? item.groupId === groupId
        : !item.groupId || !targetGroups.some((group) => group.id === item.groupId)
    );

    let toIndex: number;
    if (targetLinkId) {
      const idx = targetItems.findIndex((l) => l.id === targetLinkId);
      toIndex = idx === -1 ? targetItems.length : (position === 'after' ? idx + 1 : idx);
    } else if (position === 'before') {
      const firstIndex = targetItems.findIndex(belongsToTargetGroup);
      toIndex = firstIndex === -1 ? targetItems.length : firstIndex;
    } else {
      let lastIndex = -1;
      targetItems.forEach((item, index) => {
        if (belongsToTargetGroup(item)) lastIndex = index;
      });
      toIndex = lastIndex === -1 ? targetItems.length : lastIndex + 1;
    }

    const placement = targetGroupEntryId
      ? { kind: 'group' as const, id: targetGroupEntryId, position }
      : targetLinkId
        ? { kind: 'link' as const, id: targetLinkId, position }
        : null;

    onMoveLink(linkDrag.fromWidgetId, targetWidgetId, linkDrag.linkId, toIndex, groupId, placement);
    setLinkDrag({ linkId: null, fromWidgetId: null });
  };

  const handleGroupDragStart = (e: DragEvent, groupId: string, widgetId: string) => {
    e.stopPropagation();
    e.dataTransfer?.setData('text/plain', JSON.stringify({ groupId, widgetId }));
    e.dataTransfer?.setDragImage(new Image(), 0, 0);
    setGroupDrag({ groupId, fromWidgetId: widgetId });
  };

  const handleGroupDragEnd = () => {
    setGroupDrag({ groupId: null, fromWidgetId: null });
    setDrag({ widgetId: null, col: null, targetId: null, position: null });
  };

  const handleGroupDrop = (targetWidgetId: string) => {
    const { groupId, fromWidgetId } = groupDrag;
    if (!groupId || !fromWidgetId || fromWidgetId === targetWidgetId) {
      setGroupDrag({ groupId: null, fromWidgetId: null });
      setDrag({ widgetId: null, col: null, targetId: null, position: null });
      return;
    }
    onMoveGroup?.(fromWidgetId, targetWidgetId, groupId);
    setGroupDrag({ groupId: null, fromWidgetId: null });
    setDrag({ widgetId: null, col: null, targetId: null, position: null });
  };

  const handleTodoDragStart = (e: DragEvent, todoId: string, widgetId: string) => {
    e.dataTransfer?.setData('text/plain', JSON.stringify({ todoId, widgetId }));
    e.dataTransfer?.setDragImage(new Image(), 0, 0);
    setTodoDrag({ todoId, fromWidgetId: widgetId });
  };

  const handleTodoDragEnd = () => {
    setTodoDrag({ todoId: null, fromWidgetId: null });
  };

  const handleTodoDrop = (targetWidgetId: string, targetTodoId: string | null, position: 'before' | 'after') => {
    if (!todoDrag.todoId || !todoDrag.fromWidgetId) {
      setTodoDrag({ todoId: null, fromWidgetId: null });
      return;
    }

    if (!onMoveTodo) {
      setTodoDrag({ todoId: null, fromWidgetId: null });
      return;
    }

    const targetWidget = widgets.find((w) => w.id === targetWidgetId);
    if (!targetWidget || targetWidget.type !== 'todo') {
      setTodoDrag({ todoId: null, fromWidgetId: null });
      return;
    }

    const targetItems = targetWidget.items;
    let toIndex: number;
    if (targetTodoId) {
      const idx = targetItems.findIndex((t) => t.id === targetTodoId);
      toIndex = position === 'after' ? idx + 1 : idx;
    } else {
      toIndex = position === 'after' ? targetItems.length : 0;
    }

    onMoveTodo(todoDrag.fromWidgetId, targetWidgetId, todoDrag.todoId, toIndex);
    setTodoDrag({ todoId: null, fromWidgetId: null });
  };

  return (
    <div className="widgets-grid" ref={gridRef}>
      {columns.map((colWidgets, colIndex) => (
        <div
          key={colIndex}
          className="widgets-column"
          onDragOver={(e) => isEditing && handleDragOverColumn(e, colIndex)}
          onDrop={(e) => isEditing && handleDropOnColumn(e, colIndex)}
        >
          {colWidgets.length === 0 && drag.col === colIndex && drag.position === 'into' && <DropIndicator />}
          {colWidgets.map((widget) => {
            const isTarget = !!drag.targetId && drag.targetId === widget.id && drag.col === (widgetPositions.get(widget.id)?.column ?? 0);
            return (
              <div key={widget.id} className="widget-drop-wrapper">
                {isTarget && drag.position === 'before' && <DropIndicator />}
                <WidgetCard
                  widget={widget}
                  isDragging={widget.id === drag.widgetId}
                  dropHint={
                    drag.targetId === widget.id && drag.position === 'into'
                      ? (groupDrag.groupId ? 'group' : 'into')
                      : null
                  }
                  onDragStart={isEditing ? (e) => handleDragStart(e, widget.id) : undefined}
                  onDragOver={isEditing ? (e) => handleDragOverWidget(e, widget) : undefined}
                  onDrop={isEditing ? (e) => handleDropOnWidget(e, widget) : undefined}
                  onDragEnd={handleDragEnd}
                  onEdit={isEditing ? () => onEditWidget(widget) : undefined}
                  onDelete={isEditing ? () => onDeleteWidget(widget.id) : undefined}
                  onAddLink={isEditing && widget.type === 'links' && onAddLink ? () => onAddLink(widget) : undefined}
                  onAddGroup={isEditing && widget.type === 'links' && onAddGroup ? () => onAddGroup(widget) : undefined}
                  onResize={isEditing && onResizeWidget && (widget.type === 'links' || widget.type === 'todo') ? (h) => onResizeWidget(widget.id, h) : undefined}
                >
                  <WidgetContent
                    widget={widget}
                    linkDrag={linkDrag}
                    groupDrag={groupDrag}
                    todoDrag={todoDrag}
                    openInNewTab={openInNewTab}
                    onOpenLink={onOpenLink}
                    onDeleteLink={isEditing ? (linkId) => onDeleteLink(widget.id, linkId) : undefined}
                    onEditLink={isEditing && onEditLink ? (linkId) => onEditLink(widget.id, linkId) : undefined}
                    onLinkDragStart={isEditing ? (e, linkId) => handleLinkDragStart(e, linkId, widget.id) : undefined}
                    onLinkDragEnd={isEditing ? handleLinkDragEnd : undefined}
                    onLinkDrop={isEditing ? (targetGroupId, targetLinkId, position, targetGroupEntryId) => handleLinkDrop(widget.id, targetGroupId, targetLinkId, position, targetGroupEntryId) : undefined}
                    onRenameGroup={isEditing && onRenameGroup ? (groupId, title) => onRenameGroup(widget.id, groupId, title) : undefined}
                    onDeleteGroup={isEditing && onDeleteGroup ? (groupId) => onDeleteGroup(widget.id, groupId) : undefined}
                    onReorderGroup={isEditing && onReorderGroup ? (groupId, toIndex) => onReorderGroup(widget.id, groupId, toIndex) : undefined}
                    onGroupDragStart={isEditing ? (e, groupId) => handleGroupDragStart(e, groupId, widget.id) : undefined}
                    onGroupDragEnd={isEditing ? handleGroupDragEnd : undefined}
                    onGroupDrop={isEditing ? () => handleGroupDrop(widget.id) : undefined}
                    onAddTodo={onAddTodo}
                    onToggleTodo={onToggleTodo}
                    onUpdateTodo={onUpdateTodo}
                    onDeleteTodo={onDeleteTodo}
                    onTodoDragStart={(e, todoId) => handleTodoDragStart(e, todoId, widget.id)}
                    onTodoDragEnd={handleTodoDragEnd}
                    onTodoDrop={(widgetId, targetTodoId, position) => handleTodoDrop(widgetId, targetTodoId, position)}
                  />
                </WidgetCard>
                {isTarget && drag.position === 'after' && <DropIndicator />}
              </div>
            );
          })}
          {isEditing && onAddWidget && (
            <button
              className="widgets-column__add"
              onClick={() => onAddWidget?.()}
              aria-label={t('widgetGrid.addWidgetColumn', { n: colIndex + 1 })}
              title={t('widgetGrid.addWidgets')}
            >
              <span aria-hidden="true">+</span>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function DropIndicator() {
  return <div className="drop-indicator" />;
}

function WidgetContent({
  widget,
  linkDrag,
  groupDrag,
  openInNewTab,
  onOpenLink,
  onDeleteLink,
  onEditLink,
  onLinkDragStart,
  onLinkDragEnd,
  onLinkDrop,
  onRenameGroup,
  onDeleteGroup,
  onReorderGroup,
  onGroupDragStart,
  onGroupDragEnd,
  onGroupDrop,
  onAddTodo,
  onToggleTodo,
  onUpdateTodo,
  onDeleteTodo,
  todoDrag,
  onTodoDragStart,
  onTodoDragEnd,
  onTodoDrop
}: {
  widget: Widget;
  linkDrag: LinkDragState;
  groupDrag: GroupDragState;
  todoDrag: TodoDragState;
  openInNewTab: boolean;
  onOpenLink?: (url: string) => void;
  onDeleteLink?: (linkId: string) => void;
  onEditLink?: (linkId: string) => void;
  onLinkDragStart?: (e: DragEvent, linkId: string) => void;
  onLinkDragEnd?: () => void;
  onLinkDrop?: (
    targetGroupId: string | null,
    targetLinkId: string | null,
    position: 'before' | 'after',
    targetGroupEntryId?: string | null
  ) => void;
  onRenameGroup?: (groupId: string, title: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  onReorderGroup?: (groupId: string, toIndex: number) => void;
  onGroupDragStart?: (e: DragEvent, groupId: string) => void;
  onGroupDragEnd?: () => void;
  onGroupDrop?: () => void;
  onAddTodo?: (widgetId: string, text: string) => void;
  onToggleTodo?: (widgetId: string, todoId: string) => void;
  onUpdateTodo?: (widgetId: string, todoId: string, text: string) => void;
  onDeleteTodo?: (widgetId: string, todoId: string) => void;
  onTodoDragStart?: (e: DragEvent, todoId: string, widgetId: string) => void;
  onTodoDragEnd?: () => void;
  onTodoDrop?: (widgetId: string, targetTodoId: string | null, position: 'before' | 'after') => void;
}) {
  switch (widget.type) {
    case 'links':
      return (
        <LinksWidgetView
          widget={widget}
          linkDrag={linkDrag}
          groupDrag={groupDrag}
          openInNewTab={openInNewTab}
          onOpenLink={onOpenLink}
          onDeleteLink={onDeleteLink}
          onEditLink={onEditLink}
          onLinkDragStart={onLinkDragStart}
          onLinkDragEnd={onLinkDragEnd}
          onLinkDrop={onLinkDrop}
          onRenameGroup={onRenameGroup}
          onDeleteGroup={onDeleteGroup}
          onReorderGroup={onReorderGroup}
          onGroupDragStart={onGroupDragStart}
          onGroupDragEnd={onGroupDragEnd}
          onGroupDrop={onGroupDrop}
        />
      );
    case 'calendar':
      return <CalendarWidgetView />;
    case 'clock':
      return <ClockWidgetView timezone={widget.timezone} label={widget.label} />;
    case 'weather':
      return <WeatherWidgetView city={widget.city} />;
    case 'todo':
      return (
        <TodoWidgetView
          widget={widget}
          todoDrag={todoDrag}
          onAddTodo={onAddTodo ? (text) => onAddTodo(widget.id, text) : undefined}
          onToggleTodo={onToggleTodo ? (todoId) => onToggleTodo(widget.id, todoId) : undefined}
          onUpdateTodo={onUpdateTodo ? (todoId, text) => onUpdateTodo(widget.id, todoId, text) : undefined}
          onDeleteTodo={onDeleteTodo ? (todoId) => onDeleteTodo(widget.id, todoId) : undefined}
          onTodoDragStart={onTodoDragStart ? (e, todoId) => onTodoDragStart(e, todoId, widget.id) : undefined}
          onTodoDragEnd={onTodoDragEnd}
          onTodoDrop={onTodoDrop ? (targetTodoId, position) => onTodoDrop(widget.id, targetTodoId, position) : undefined}
        />
      );
    default:
      return null;
  }
}
