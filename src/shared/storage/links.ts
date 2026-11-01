import type { AppData, LinkGroup, LinkItem, LinksWidget, Widget } from '@shared/types';
import { generateId } from '@shared/types/defaults';
import { t } from '@shared/i18n';
import { normalizeUrl } from '@shared/utils/url';
import { applyTopLevelEntryOrder, getTopLevelEntries, normalizeTopLevelOrder } from '@shared/utils/linkOrder';
import { getResponsiveWidgetPositions } from '@shared/utils/widgetPositions';
import { getWorkspaces, updateWidgetInWorkspace } from './index';
import { createWidget } from './widgets';

export interface LinkPlacement {
  kind: 'link' | 'group';
  id: string;
  position: 'before' | 'after';
}

/**
 * Próxima ordem livre no fim das entradas de topo: `max(order) + 1`.
 * Entradas sem `order` usam o fallback posicional, então o piso é `n - 1`.
 */
function getNextTopLevelOrder(widget: LinksWidget): number {
  const groupIds = new Set((widget.groups ?? []).map((group) => group.id));
  let max = -1;
  for (const item of widget.items) {
    if (item.groupId && groupIds.has(item.groupId)) continue;
    if (typeof item.order === 'number' && Number.isFinite(item.order)) max = Math.max(max, item.order);
  }
  for (const group of widget.groups ?? []) {
    if (typeof group.order === 'number' && Number.isFinite(group.order)) max = Math.max(max, group.order);
  }
  const fallbackMax = getTopLevelEntries(widget).length - 1;
  return Math.max(max, fallbackMax) + 1;
}

export function createLink(title: string, url: string, icon?: string | null, groupId?: string | null): LinkItem {
  const now = Date.now();
  return {
    id: generateId('link'),
    title: title.trim() || t('defaults.newLink'),
    url: normalizeUrl(url),
    icon: icon || undefined,
    ...(groupId ? { groupId } : {}),
    createdAt: now,
    updatedAt: now
  };
}

export function createGroup(title = ''): LinkGroup {
  return {
    id: generateId('group'),
    title,
  };
}

export function addGroup(data: AppData, boardId: string, widgetId: string, group: LinkGroup): AppData {
  return updateWidgetInWorkspace(
    data,
    boardId,
    widgetId,
    (w) => {
      if (w.type !== 'links') return w;
      const groups = w.groups ?? [];
      // A subpasta entra no fim das entradas de topo (links soltos + subpastas).
      const nextOrder = getNextTopLevelOrder(w);
      return normalizeTopLevelOrder({ ...w, groups: [...groups, { ...group, order: nextOrder }] });
    },
    true,
  );
}

export function renameGroup(data: AppData, boardId: string, widgetId: string, groupId: string, title: string): AppData {
  const workspace = getWorkspaces(data).find((w) => w.id === boardId && !w.deletedAt);
  const widget = workspace?.widgets.find(
    (w): w is LinksWidget => w.id === widgetId && w.type === 'links'
  );
  const group = widget?.groups?.find((g) => g.id === groupId);
  if (group?.title === title) return data;

  return updateWidgetInWorkspace(
    data,
    boardId,
    widgetId,
    (w) => w.type === 'links' && w.groups
      ? { ...w, groups: w.groups.map((g) => (g.id === groupId ? { ...g, title } : g)) }
      : w,
    true,
  );
}

export function deleteGroup(data: AppData, boardId: string, widgetId: string, groupId: string): AppData {
  return updateWidgetInWorkspace(
    data,
    boardId,
    widgetId,
    (w) => {
      if (w.type !== 'links' || !w.groups) return w;
      const group = w.groups.find((entry) => entry.id === groupId);
      if (!group) return w;

      // Os links do grupo removido voltam a ser soltos na posição do grupo,
      // preservando a ordem relativa entre eles.
      const groupLinks = w.items.filter((item) => item.groupId === groupId);
      const entries = getTopLevelEntries(w);
      const groupIndex = entries.findIndex((entry) => entry.kind === 'group' && entry.id === groupId);
      const withoutGroup = groupIndex === -1
        ? entries.filter((entry) => !(entry.kind === 'group' && entry.id === groupId))
        : [...entries.slice(0, groupIndex), ...entries.slice(groupIndex + 1)];
      const insertAt = groupIndex === -1 ? withoutGroup.length : groupIndex;
      const nextEntries = [
        ...withoutGroup.slice(0, insertAt),
        ...groupLinks.map((link) => ({ kind: 'link' as const, id: link.id, order: 0 })),
        ...withoutGroup.slice(insertAt),
      ];

      return normalizeTopLevelOrder(applyTopLevelEntryOrder({
        ...w,
        items: w.items.map((item) => {
          if (item.groupId !== groupId) return item;
          const next = { ...item };
          delete next.groupId;
          return next;
        }),
        groups: w.groups.filter((entry) => entry.id !== groupId),
      }, nextEntries));
    },
    true,
  );
}

export function addLink(data: AppData, boardId: string, widgetId: string, link: LinkItem): AppData {
  return updateWidgetInWorkspace(
    data,
    boardId,
    widgetId,
    (w) => {
      if (w.type !== 'links') return w;
      const groups = w.groups ?? [];
      const next: LinkItem = { ...link };
      delete next.order;

      const targetGroupId = next.groupId;
      if (targetGroupId && groups.some((group) => group.id === targetGroupId)) {
        return normalizeTopLevelOrder({ ...w, items: [...w.items, next] });
      }

      // Link solto entra no fim das entradas de topo.
      delete next.groupId;
      if (groups.length > 0) next.order = getNextTopLevelOrder(w);
      return normalizeTopLevelOrder({ ...w, items: [...w.items, next] });
    },
    true,
  );
}

export function deleteLink(data: AppData, boardId: string, widgetId: string, linkId: string): AppData {
  return updateWidgetInWorkspace(
    data,
    boardId,
    widgetId,
    (w) => w.type === 'links'
      ? normalizeTopLevelOrder({ ...w, items: w.items.filter((l) => l.id !== linkId) })
      : w,
    true,
  );
}

export function updateLink(
  data: AppData,
  boardId: string,
  widgetId: string,
  linkId: string,
  updates: Partial<LinkItem>
): AppData {
  const hasGroupUpdate = Object.prototype.hasOwnProperty.call(updates, 'groupId');
  const groupId = (updates as { groupId?: string | null }).groupId;
  const clearsGroup = hasGroupUpdate && (groupId === undefined || groupId === null);
  const patch: Partial<LinkItem> = { ...updates };
  if (clearsGroup) delete patch.groupId;

  return updateWidgetInWorkspace(
    data,
    boardId,
    widgetId,
    (w) => w.type === 'links'
      ? normalizeTopLevelOrder({
          ...w,
          items: w.items.map((l) => {
            if (l.id !== linkId) return l;
            const next: LinkItem = { ...l, ...patch, updatedAt: Date.now() };
            if (clearsGroup) delete next.groupId;
            return next;
          }),
        })
      : w,
    true,
  );
}

export function searchLinks(data: AppData, query: string): LinkItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const matches: LinkItem[] = [];
  for (const workspace of getWorkspaces(data)) {
    if (workspace.deletedAt) continue;
    for (const widget of workspace.widgets) {
      if (widget.type !== 'links') continue;
      for (const item of widget.items) {
        if (item.title.toLowerCase().includes(q) || item.url.toLowerCase().includes(q)) {
          matches.push(item);
        }
      }
    }
  }
  return matches;
}

interface MoveLinkOptions {
  toIndex: number;
  groupId?: string;
  placement?: LinkPlacement | null;
  originalIndex: number;
  sameWidget: boolean;
}

function insertMovedLink(widget: LinksWidget, link: LinkItem, options: MoveLinkOptions): LinksWidget {
  const groups = widget.groups ?? [];
  const groupIds = new Set(groups.map((group) => group.id));

  if (options.groupId && groupIds.has(options.groupId)) {
    // Dentro de subpasta: a ordem é a do array `items`, sem `order`.
    const next: LinkItem = { ...link, groupId: options.groupId };
    delete next.order;
    const items = [...widget.items];
    let index = options.toIndex;
    if (options.sameWidget && options.originalIndex < index) index -= 1;
    const clampedIndex = Math.max(0, Math.min(Number.isFinite(index) ? index : items.length, items.length));
    items.splice(clampedIndex, 0, next);
    return normalizeTopLevelOrder({ ...widget, items });
  }

  const next: LinkItem = { ...link };
  delete next.groupId;
  delete next.order;

  if (groups.length === 0) {
    // Ramo plano: mantém a semântica antiga (índice no array `items`).
    const items = [...widget.items];
    let index = options.toIndex;
    if (options.sameWidget && options.originalIndex < index) index -= 1;
    const clampedIndex = Math.max(0, Math.min(Number.isFinite(index) ? index : items.length, items.length));
    items.splice(clampedIndex, 0, next);
    return normalizeTopLevelOrder({ ...widget, items });
  }

  // Destino solto em widget com subpastas: posiciona entre as entradas de topo.
  const entries = getTopLevelEntries(widget);
  let insertIndex = entries.length;
  if (options.placement) {
    const { kind, id, position } = options.placement;
    const targetIndex = entries.findIndex((entry) => entry.kind === kind && entry.id === id);
    if (targetIndex !== -1) {
      insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
    }
  }
  entries.splice(insertIndex, 0, { kind: 'link', id: next.id, order: insertIndex });

  return normalizeTopLevelOrder(
    applyTopLevelEntryOrder({ ...widget, items: [...widget.items, next] }, entries)
  );
}

export function moveLink(
  data: AppData,
  boardId: string,
  fromWidgetId: string,
  toWidgetId: string,
  linkId: string,
  toIndex: number,
  toGroupId?: string | null,
  placement?: LinkPlacement | null
): AppData {
  // Soltar o link sobre ele mesmo é no-op (I1).
  if (placement && placement.kind === 'link' && placement.id === linkId) return data;
  const workspace = getWorkspaces(data).find((w) => w.id === boardId && !w.deletedAt);
  if (!workspace) return data;

  const fromWidget = workspace.widgets.find(
    (w): w is LinksWidget => w.id === fromWidgetId && w.type === 'links'
  );
  const toWidget = workspace.widgets.find(
    (w): w is LinksWidget => w.id === toWidgetId && w.type === 'links'
  );
  if (!fromWidget || !toWidget) return data;

  const originalIndex = fromWidget.items.findIndex((item) => item.id === linkId);
  if (originalIndex === -1) return data;

  const now = Date.now();
  const targetGroupIds = new Set((toWidget.groups ?? []).map((group) => group.id));
  const groupId = toGroupId && targetGroupIds.has(toGroupId) ? toGroupId : undefined;
  const movedLink: LinkItem = { ...fromWidget.items[originalIndex], updatedAt: now };
  const touched = new Set([fromWidgetId, toWidgetId]);

  const widgets = workspace.widgets
    .map((widget) => {
      if (widget.id !== fromWidgetId || widget.type !== 'links') return widget;
      return { ...widget, items: widget.items.filter((item) => item.id !== linkId) };
    })
    .map((widget) => {
      if (widget.id !== toWidgetId || widget.type !== 'links') return widget;
      return insertMovedLink(widget, movedLink, {
        toIndex,
        groupId,
        placement,
        originalIndex,
        sameWidget: fromWidgetId === toWidgetId,
      });
    });

  return {
    ...data,
    workspaces: data.workspaces.map((w) => (
      w.id === boardId
        ? {
            ...w,
            widgets: widgets.map((widget) => (
              widget.type === 'links' && touched.has(widget.id)
                ? normalizeTopLevelOrder(widget)
                : widget
            )),
            updatedAt: now,
          }
        : w
    )),
  };
}

export function moveGroup(
  data: AppData,
  boardId: string,
  fromWidgetId: string,
  toWidgetId: string,
  groupId: string
): AppData {
  if (fromWidgetId === toWidgetId) return data;

  const workspace = getWorkspaces(data).find((w) => w.id === boardId && !w.deletedAt);
  if (!workspace) return data;

  const fromWidget = workspace.widgets.find(
    (w): w is LinksWidget => w.id === fromWidgetId && w.type === 'links'
  );
  const toWidget = workspace.widgets.find(
    (w): w is LinksWidget => w.id === toWidgetId && w.type === 'links'
  );
  const group = fromWidget?.groups?.find((g) => g.id === groupId);
  if (!fromWidget || !toWidget || !group) return data;

  const now = Date.now();
  const targetGroups = toWidget.groups ?? [];
  const hasIdCollision = targetGroups.some((g) => g.id === groupId);
  const nextGroupId = hasIdCollision ? generateId('group') : groupId;
  const movedLinks = fromWidget.items
    .filter((item) => item.groupId === groupId)
    .map((item) => {
      const next: LinkItem = { ...item, groupId: nextGroupId, updatedAt: now };
      delete next.order;
      return next;
    });
  const nextOrder = getNextTopLevelOrder(toWidget);

  const widgets = workspace.widgets.map((widget) => {
    if (widget.id === fromWidgetId && widget.type === 'links') {
      return normalizeTopLevelOrder({
        ...widget,
        groups: (widget.groups ?? []).filter((g) => g.id !== groupId),
        items: widget.items.filter((item) => item.groupId !== groupId),
      });
    }
    if (widget.id === toWidgetId && widget.type === 'links') {
      return normalizeTopLevelOrder({
        ...widget,
        groups: [...(widget.groups ?? []), { ...group, id: nextGroupId, order: nextOrder }],
        items: [...widget.items, ...movedLinks],
      });
    }
    return widget;
  });

  return {
    ...data,
    workspaces: data.workspaces.map((w) => (
      w.id === boardId ? { ...w, widgets, updatedAt: now } : w
    )),
  };
}

export function reorderGroup(
  data: AppData,
  boardId: string,
  widgetId: string,
  groupId: string,
  toIndex: number
): AppData {
  const workspace = getWorkspaces(data).find((w) => w.id === boardId && !w.deletedAt);
  if (!workspace) return data;

  const widget = workspace.widgets.find(
    (w): w is LinksWidget => w.id === widgetId && w.type === 'links'
  );
  if (!widget) return data;

  // `toIndex` é o índice de inserção na lista unificada de entradas
  // (links soltos + subpastas), contando a própria entrada arrastada.
  const entries = getTopLevelEntries(widget);
  const total = entries.length;
  const currentIndex = entries.findIndex((entry) => entry.kind === 'group' && entry.id === groupId);
  if (currentIndex === -1) return data;

  const target = Math.max(0, Math.min(toIndex, total));
  const nextIndex = target > currentIndex ? target - 1 : target;
  if (nextIndex === currentIndex) return data;

  const [moved] = entries.splice(currentIndex, 1);
  entries.splice(Math.min(nextIndex, entries.length), 0, moved);
  const nextWidget = normalizeTopLevelOrder(applyTopLevelEntryOrder(widget, entries));

  return {
    ...data,
    workspaces: data.workspaces.map((w) => (
      w.id === boardId
        ? {
            ...w,
            widgets: w.widgets.map((entry) => (
              entry.id === widgetId && entry.type === 'links' ? nextWidget : entry
            )),
            updatedAt: Date.now(),
          }
        : w
    )),
  };
}

export function explodeGroupToWidget(
  data: AppData,
  boardId: string,
  fromWidgetId: string,
  groupId: string,
  target: { col: number; targetId: string | null; position: 'before' | 'after' | 'into'; columnCount: number }
): AppData {
  const workspace = getWorkspaces(data).find((w) => w.id === boardId && !w.deletedAt);
  if (!workspace) return data;

  const fromWidget = workspace.widgets.find(
    (w): w is LinksWidget => w.id === fromWidgetId && w.type === 'links'
  );
  const group = fromWidget?.groups?.find((entry) => entry.id === groupId);
  if (!fromWidget || !group) return data;

  const now = Date.now();
  const movedLinks: LinkItem[] = fromWidget.items
    .filter((item) => item.groupId === groupId)
    .map((item) => {
      const next: LinkItem = { ...item, updatedAt: now };
      delete next.groupId;
      delete next.order;
      return next;
    });

  const columnCount = Math.max(1, target.columnCount);
  const targetCol = Math.max(0, Math.min(target.col, columnCount - 1));

  const explodedWidget: LinksWidget = normalizeTopLevelOrder({
    ...createWidget('links', group.title || t('defaults.newGroup')),
    items: movedLinks,
    col: targetCol,
    layoutColumns: columnCount,
  });

  const widgets = workspace.widgets.map((widget) => {
    if (widget.id !== fromWidgetId || widget.type !== 'links') return widget;
    return normalizeTopLevelOrder({
      ...widget,
      groups: (widget.groups ?? []).filter((entry) => entry.id !== groupId),
      items: widget.items.filter((item) => item.groupId !== groupId),
    });
  });

  const positions = getResponsiveWidgetPositions(widgets, columnCount);
  const byCol: Widget[][] = Array.from({ length: columnCount }, () => []);
  for (const widget of widgets) {
    const column = positions.get(widget.id)?.column ?? 0;
    byCol[column].push(widget);
  }
  for (const column of byCol) {
    column.sort((a, b) => (positions.get(a.id)?.row ?? 0) - (positions.get(b.id)?.row ?? 0));
  }

  let insertIndex = byCol[targetCol].length;
  if (target.targetId && target.position !== 'into') {
    const targetIndex = byCol[targetCol].findIndex((widget) => widget.id === target.targetId);
    if (targetIndex !== -1) {
      insertIndex = target.position === 'after' ? targetIndex + 1 : targetIndex;
    }
  }
  byCol[targetCol].splice(insertIndex, 0, explodedWidget);

  const normalized = byCol.flatMap((column, colIndex) => (
    column.map((widget, order) => ({
      ...widget,
      col: colIndex,
      order,
      layoutColumns: columnCount,
    }))
  ));

  return {
    ...data,
    workspaces: data.workspaces.map((w) => (
      w.id === boardId ? { ...w, widgets: normalized, updatedAt: now } : w
    )),
  };
}

export function absorbWidgetAsGroup(
  data: AppData,
  boardId: string,
  fromWidgetId: string,
  toWidgetId: string
): AppData {
  if (fromWidgetId === toWidgetId) return data;

  const workspace = getWorkspaces(data).find((w) => w.id === boardId && !w.deletedAt);
  if (!workspace) return data;

  const fromWidget = workspace.widgets.find(
    (w): w is LinksWidget => w.id === fromWidgetId && w.type === 'links'
  );
  const toWidget = workspace.widgets.find(
    (w): w is LinksWidget => w.id === toWidgetId && w.type === 'links'
  );
  if (!fromWidget || !toWidget) return data;

  const now = Date.now();
  const nextOrder = getNextTopLevelOrder(toWidget);
  const newGroup: LinkGroup = {
    id: generateId('group'),
    title: fromWidget.title,
    order: nextOrder,
  };
  const movedLinks: LinkItem[] = fromWidget.items.map((item) => {
    const next: LinkItem = { ...item, groupId: newGroup.id, updatedAt: now };
    delete next.order;
    return next;
  });

  const widgets = workspace.widgets
    .filter((widget) => widget.id !== fromWidgetId)
    .map((widget) => {
      if (widget.id !== toWidgetId || widget.type !== 'links') return widget;
      return normalizeTopLevelOrder({
        ...widget,
        groups: [...(widget.groups ?? []), newGroup],
        items: [...widget.items, ...movedLinks],
      });
    })
    .map((widget, index) => ({ ...widget, order: index }));

  return {
    ...data,
    workspaces: data.workspaces.map((w) => (
      w.id === boardId ? { ...w, widgets, updatedAt: now } : w
    )),
  };
}
