import type { AppData, Board, LinkGroup, LinkItem, LinksWidget, ThemeConfig, TopWidgetConfig, Widget } from '@shared/types';
import { t } from '@shared/i18n';
import { DEFAULT_THEME } from '@shared/types/constants';
import { generateId, generateWorkspaceId, getDefaultData } from '@shared/types/defaults';
import { applyTopLevelEntryOrder, getTopLevelEntries, normalizeTopLevelOrder } from '@shared/utils/linkOrder';
import type { TopLevelEntry } from '@shared/utils/linkOrder';
import { migrateAppData } from './migrate';
import { getBoards } from './index';

export interface TemplateWidgetPosition {
  column: number;
  row: number;
}

export interface TemplateTheme {
  primaryColor: string;
  boardColor: string;
  boardOpacity: number;
  boardBlur: number;
}

/** Posição de uma entrada de topo dentro do template (`items` ou `groups`). */
export interface TemplateTopLevelEntry {
  kind: 'link' | 'group';
  index: number;
}

interface TemplateLinkItem {
  title: string;
  url: string;
  icon?: string;
  favicon?: string;
  groupId?: number;
}

interface TemplateWidgetBase {
  title: string;
  colSpan: number;
  height?: number;
  position: TemplateWidgetPosition;
}

export type TemplateWidget =
  | (TemplateWidgetBase & {
      type: 'links';
      /** `groupId` is the index of the group in `groups` (group ids are recreated on import). */
      items: TemplateLinkItem[];
      groups?: { title: string }[];
      /** Ordem efetiva das entradas de topo (links soltos intercalados com subpastas). */
      topLevel?: TemplateTopLevelEntry[];
    })
  | (TemplateWidgetBase & { type: 'calendar' })
  | (TemplateWidgetBase & { type: 'clock'; timezone?: string; label?: string })
  | (TemplateWidgetBase & { type: 'weather'; city?: string })
  | (TemplateWidgetBase & { type: 'todo'; items: { text: string; done: boolean }[] });

export interface TemplateBoard {
  title: string;
  widgets: TemplateWidget[];
}

export interface TemplateData {
  format: 'prismi-template';
  version: 5;
  columns: number;
  headerWidgets?: TopWidgetConfig[];
  theme: TemplateTheme;
  boards: TemplateBoard[];
}

export interface ImportResult {
  data: AppData;
  theme?: TemplateTheme;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getWidgetPositions(widgets: Widget[], targetColumns: number): TemplateWidgetPosition[] {
  const sourceColumns = Math.max(
    1,
    ...widgets.map((widget) => widget.layoutColumns ?? 0),
    ...widgets
      .filter((widget) => widget.layoutColumns === undefined)
      .map((widget) => (widget.col ?? 0) + 1)
  );
  const nextRows = new Map<number, number>();
  const positions = new Map<number, TemplateWidgetPosition>();

  widgets
    .map((widget, index) => ({
      index,
      column: clamp(widget.col ?? 0, 0, sourceColumns - 1),
      row: Math.max(0, widget.order)
    }))
    .sort((a, b) => a.column - b.column || a.row - b.row || a.index - b.index)
    .forEach(({ index, column: sourceColumn }) => {
      const column = sourceColumns === 1
        ? 0
        : Math.round(sourceColumn * (targetColumns - 1) / (sourceColumns - 1));
      const row = nextRows.get(column) ?? 0;
      nextRows.set(column, row + 1);
      positions.set(index, {
        column: clamp(column, 0, targetColumns - 1),
        row
      });
    });

  return widgets.map((_, index) => positions.get(index) ?? { column: 0, row: index });
}

function serializeWidget(widget: Widget, position: TemplateWidgetPosition): TemplateWidget {
  const base = {
    type: widget.type,
    title: widget.title,
    colSpan: widget.colSpan,
    ...(widget.height !== undefined ? { height: widget.height } : {}),
    position
  };

  switch (widget.type) {
    case 'links': {
      const groups = (widget.groups ?? [])
        .map((group, index) => ({ group, index }))
        .sort((a, b) => (a.group.order ?? a.index) - (b.group.order ?? b.index))
        .map(({ group }) => group);
      const groupIndex = new Map(groups.map((group, index) => [group.id, index]));
      const itemIndex = new Map(widget.items.map((item, index) => [item.id, index]));
      const topLevel = groups.length > 0
        ? getTopLevelEntries(widget)
          .map((entry): TemplateTopLevelEntry => (
            entry.kind === 'link'
              ? { kind: 'link', index: itemIndex.get(entry.id) ?? -1 }
              : { kind: 'group', index: groupIndex.get(entry.id) ?? -1 }
          ))
          .filter((entry) => entry.index >= 0)
        : [];
      return {
        ...base,
        type: 'links',
        items: widget.items.map(({ title, url, icon, favicon, groupId }) => {
          const index = groupId !== undefined ? groupIndex.get(groupId) : undefined;
          return {
            title,
            url,
            ...(icon ? { icon } : {}),
            ...(favicon ? { favicon } : {}),
            ...(index !== undefined ? { groupId: index } : {}),
          };
        }),
        ...(groups.length > 0
          ? {
              groups: groups.map(({ title }) => ({ title })),
            }
          : {}),
        ...(topLevel.length > 0 ? { topLevel } : {}),
      };
    }
    case 'calendar':
      return { ...base, type: 'calendar' };
    case 'clock':
      return {
        ...base,
        type: 'clock',
        ...(widget.timezone ? { timezone: widget.timezone } : {}),
        ...(widget.label ? { label: widget.label } : {})
      };
    case 'weather':
      return { ...base, type: 'weather', ...(widget.city ? { city: widget.city } : {}) };
    case 'todo':
      return {
        ...base,
        type: 'todo',
        items: widget.items.map(({ text, done }) => ({ text, done }))
      };
  }
}

export function createTemplate(data: AppData, theme: Pick<ThemeConfig, 'primaryColor' | 'boardColor' | 'boardOpacity' | 'boardBlur'>): TemplateData {
  const columns = getCurrentColumnCount();
  const boards = getBoards(data);
  return {
    format: 'prismi-template',
    version: 5,
    columns,
    headerWidgets: data.settings.topWidgets ?? [],
    theme: {
      primaryColor: theme.primaryColor,
      boardColor: theme.boardColor,
      boardOpacity: theme.boardOpacity,
      boardBlur: theme.boardBlur
    },
    boards: boards.map((board) => {
      const positions = getWidgetPositions(board.widgets, columns);
      return {
        title: board.title,
        widgets: board.widgets.map((widget, index) => serializeWidget(widget, positions[index]))
      };
    })
  };
}

export function exportData(data: AppData, theme: Pick<ThemeConfig, 'primaryColor' | 'boardColor' | 'boardOpacity' | 'boardBlur'>): void {
  const blob = new Blob([JSON.stringify(createTemplate(data, theme), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `prismi-template-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function getCurrentColumnCount(): number {
  const grid = typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('.widgets-grid');
  const width = grid?.clientWidth ?? (typeof window === 'undefined' ? 1920 : window.innerWidth);
  if (width >= 1920) return 6;
  if (width >= 1600) return 5;
  if (width >= 1280) return 4;
  if (width >= 900) return 3;
  if (width >= 480) return 2;
  return 1;
}

/**
 * Converte `topLevel` do template em entradas com ids reais, ignorando índices
 * inválidos e duplicados. Retorna [] quando nada é aproveitado (fallback).
 */
function resolveTemplateTopLevel(
  topLevel: TemplateTopLevelEntry[] | undefined,
  items: LinkItem[],
  groups: LinkGroup[]
): TopLevelEntry[] {
  if (!topLevel || topLevel.length === 0) return [];
  const seen = new Set<string>();
  const entries: TopLevelEntry[] = [];

  for (const entry of topLevel) {
    if (!entry || (entry.kind !== 'link' && entry.kind !== 'group')) continue;
    if (typeof entry.index !== 'number' || !Number.isInteger(entry.index) || entry.index < 0) continue;

    if (entry.kind === 'link') {
      const item = items[entry.index];
      // Índice inválido ou link que está dentro de subpasta: não é entrada de topo.
      if (!item || item.groupId) continue;
      const key = `link:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ kind: 'link', id: item.id, order: entries.length });
      continue;
    }

    const group = groups[entry.index];
    if (!group) continue;
    const key = `group:${group.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ kind: 'group', id: group.id, order: entries.length });
  }

  return entries;
}

function deserializeWidget(widget: TemplateWidget, position: TemplateWidgetPosition, columns: number): Widget {
  const now = Date.now();
  const base = {
    id: generateId('widget'),
    title: widget.title,
    colSpan: widget.colSpan,
    order: position.row,
    ...(widget.height !== undefined ? { height: widget.height } : {}),
    col: position.column,
    layoutColumns: columns
  };

  switch (widget.type) {
    case 'links': {
      const groups = (widget.groups ?? []).map((group) => ({
        id: generateId('group'),
        title: group.title,
      }));
      const items: LinkItem[] = widget.items.map((item) => {
        const group = item.groupId !== undefined ? groups[item.groupId] : undefined;
        return {
          id: generateId('link'),
          title: item.title,
          url: item.url,
          createdAt: now,
          updatedAt: now,
          ...(item.icon ? { icon: item.icon } : {}),
          ...(item.favicon ? { favicon: item.favicon } : {}),
          ...(group ? { groupId: group.id } : {}),
        };
      });

      const linksWidget: LinksWidget = {
        ...base,
        type: 'links',
        ...(groups.length > 0 ? { groups } : {}),
        items,
      };

      const entries = resolveTemplateTopLevel(widget.topLevel, items, groups);
      if (entries.length === 0) return normalizeTopLevelOrder(linksWidget);
      return normalizeTopLevelOrder(applyTopLevelEntryOrder(linksWidget, entries));
    }
    case 'calendar':
      return { ...base, type: 'calendar' };
    case 'clock':
      return {
        ...base,
        type: 'clock',
        ...(widget.timezone ? { timezone: widget.timezone } : {}),
        ...(widget.label ? { label: widget.label } : {})
      };
    case 'weather':
      return { ...base, type: 'weather', ...(widget.city ? { city: widget.city } : {}) };
    case 'todo':
      return {
        ...base,
        type: 'todo',
        items: widget.items.map((item) => ({ id: generateId('todo'), text: item.text, done: item.done, createdAt: now, updatedAt: now }))
      };
  }
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function asPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeTheme(value: unknown): TemplateTheme {
  const theme = isRecord(value) ? value : {};
  return {
    primaryColor: asString(theme.primaryColor, DEFAULT_THEME.primaryColor),
    boardColor: asString(theme.boardColor, DEFAULT_THEME.boardColor),
    boardOpacity: typeof theme.boardOpacity === 'number' && Number.isFinite(theme.boardOpacity)
      ? Math.min(Math.max(theme.boardOpacity, 0), 1)
      : DEFAULT_THEME.boardOpacity,
    boardBlur: typeof theme.boardBlur === 'number' && Number.isFinite(theme.boardBlur)
      ? Math.max(theme.boardBlur, 0)
      : DEFAULT_THEME.boardBlur,
  };
}

function normalizeTopWidgets(value: unknown): TopWidgetConfig[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const widgets = value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const type = entry.type;
    if (type !== 'clock' && type !== 'weather' && type !== 'search') return [];

    const widget: TopWidgetConfig = { type };
    if (typeof entry.city === 'string') widget.city = entry.city;
    if (typeof entry.timezone === 'string') widget.timezone = entry.timezone;
    if (typeof entry.label === 'string') widget.label = entry.label;
    if (entry.searchEngine === 'google' || entry.searchEngine === 'yahoo' || entry.searchEngine === 'bing' || entry.searchEngine === 'duckduckgo') {
      widget.searchEngine = entry.searchEngine;
    }
    return [widget];
  });

  return widgets;
}

function getLegacyWidgetPosition(widget: JsonRecord, index: number): TemplateWidgetPosition {
  const nested = isRecord(widget.position) ? widget.position : {};
  const column = typeof nested.column === 'number'
    ? nested.column
    : typeof widget.col === 'number' ? widget.col : 0;
  const row = typeof nested.row === 'number'
    ? nested.row
    : typeof widget.order === 'number' ? widget.order : index;

  return {
    column: Math.max(0, Math.floor(column)),
    row: Math.max(0, Math.floor(row)),
  };
}

function getLegacyColumnCount(boards: unknown[]): number {
  let columns = 1;
  for (const board of boards) {
    if (!isRecord(board) || !Array.isArray(board.widgets)) continue;
    board.widgets.forEach((entry, index) => {
      if (!isRecord(entry)) return;
      columns = Math.max(columns, getLegacyWidgetPosition(entry, index).column + 1);
    });
  }
  return columns;
}

/**
 * Normaliza `topLevel` de um template cru, mapeando índices de origem para os
 * índices do template normalizado. Ignora itens inválidos/duplicados e links
 * que pertencem a subpastas.
 */
function normalizeTemplateTopLevel(
  value: unknown,
  itemIndexMap: Map<number, number>,
  groupIndexMap: Map<number, number>,
  items: TemplateLinkItem[]
): TemplateTopLevelEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const seen = new Set<string>();
  const entries: TemplateTopLevelEntry[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const kind = entry.kind;
    const index = entry.index;
    if (kind !== 'link' && kind !== 'group') continue;
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) continue;

    if (kind === 'link') {
      const mapped = itemIndexMap.get(index);
      if (mapped === undefined) continue;
      const item = items[mapped];
      if (!item || item.groupId !== undefined) continue;
      const key = `link:${mapped}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ kind: 'link', index: mapped });
      continue;
    }

    const mapped = groupIndexMap.get(index);
    if (mapped === undefined) continue;
    const key = `group:${mapped}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ kind: 'group', index: mapped });
  }

  return entries.length > 0 ? entries : undefined;
}

function normalizeTemplateWidget(value: unknown, index: number): TemplateWidget | null {
  if (!isRecord(value)) return null;

  const type = value.type;
  if (type !== 'links' && type !== 'calendar' && type !== 'clock' && type !== 'weather' && type !== 'todo') return null;

  const base = {
    title: asString(value.title, t(`defaults.${type === 'todo' ? 'todoWidget' : `${type}Widget`}`)),
    colSpan: asPositiveNumber(value.colSpan, 1),
    ...(typeof value.height === 'number' && Number.isFinite(value.height) && value.height > 0 ? { height: value.height } : {}),
    position: getLegacyWidgetPosition(value, index),
  };

  switch (type) {
    case 'links': {
      const groups: { title: string }[] = [];
      const groupIndexMap = new Map<number, number>();
      if (Array.isArray(value.groups)) {
        value.groups.forEach((group, groupIndex) => {
          if (!isRecord(group)) return;
          groupIndexMap.set(groupIndex, groups.length);
          groups.push({
            title: asString(group.title, t('defaults.newGroup')),
          });
        });
      }

      const items: TemplateLinkItem[] = [];
      const itemIndexMap = new Map<number, number>();
      if (Array.isArray(value.items)) {
        value.items.forEach((item, itemIndex) => {
          if (!isRecord(item) || typeof item.url !== 'string') return;
          const groupIndex = typeof item.groupId === 'number' && Number.isInteger(item.groupId)
            ? groupIndexMap.get(item.groupId)
            : undefined;
          itemIndexMap.set(itemIndex, items.length);
          items.push({
            title: asString(item.title, t('defaults.newLink')),
            url: item.url,
            ...(typeof item.icon === 'string' && item.icon ? { icon: item.icon } : {}),
            ...(typeof item.favicon === 'string' && item.favicon ? { favicon: item.favicon } : {}),
            ...(groupIndex !== undefined ? { groupId: groupIndex } : {}),
          });
        });
      }

      const topLevel = normalizeTemplateTopLevel(value.topLevel, itemIndexMap, groupIndexMap, items);

      return {
        ...base,
        type,
        ...(groups.length > 0 ? { groups } : {}),
        items,
        ...(topLevel ? { topLevel } : {}),
      };
    }
    case 'calendar':
      return { ...base, type };
    case 'clock':
      return {
        ...base,
        type,
        ...(typeof value.timezone === 'string' ? { timezone: value.timezone } : {}),
        ...(typeof value.label === 'string' ? { label: value.label } : {}),
      };
    case 'weather':
      return { ...base, type, ...(typeof value.city === 'string' ? { city: value.city } : {}) };
    case 'todo':
      return {
        ...base,
        type,
        items: Array.isArray(value.items)
          ? value.items.flatMap((item) => {
              if (!isRecord(item)) return [];
              return [{
                text: asString(item.text, t('defaults.newNote')),
                done: item.done === true,
              }];
            })
          : [],
      };
  }
}

function normalizeTemplate(value: unknown): TemplateData {
  if (!isRecord(value) || value.format !== 'prismi-template') {
    throw new Error(t('storage.invalidFileFormat'));
  }

  const version = value.version === undefined ? 1 : value.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error(t('storage.invalidFileFormat'));
  }
  if (version > 5) {
    throw new Error(t('storage.unsupportedVersion', { version }));
  }
  if (!Array.isArray(value.boards)) {
    throw new Error(t('storage.invalidFileFormat'));
  }

  const columns = Number.isInteger(value.columns) && Number(value.columns) > 0
    ? Number(value.columns)
    : getLegacyColumnCount(value.boards);
  const boards: TemplateBoard[] = value.boards.map((entry, boardIndex) => {
    if (!isRecord(entry)) {
      return { title: t('defaults.newBoard'), widgets: [] };
    }
    const widgets = Array.isArray(entry.widgets)
      ? entry.widgets.flatMap((widget, index) => {
          const normalized = normalizeTemplateWidget(widget, index);
          return normalized ? [normalized] : [];
        })
      : [];
    return {
      title: asString(entry.title, `${t('defaults.newBoard')} ${boardIndex + 1}`),
      widgets,
    };
  });

  return {
    format: 'prismi-template',
    version: 5,
    columns,
    theme: normalizeTheme(value.theme),
    ...(normalizeTopWidgets(value.headerWidgets ?? value.topWidgets) ? { headerWidgets: normalizeTopWidgets(value.headerWidgets ?? value.topWidgets) } : {}),
    boards,
  };
}

function isAppDataLike(value: unknown): value is AppData {
  if (!isRecord(value) || !isRecord(value.settings)) return false;
  return Array.isArray(value.workspaces) || Array.isArray(value.boards);
}

function importTemplate(template: TemplateData): ImportResult {
  const now = Date.now();
  const boards: Board[] = template.boards.map((board) => {
    return {
      id: generateWorkspaceId(),
      title: board.title,
      widgets: board.widgets.map((widget) => deserializeWidget(widget, widget.position, template.columns)),
      createdAt: now,
      updatedAt: now
    };
  });
  const defaults = getDefaultData();
  const importedWorkspaces = boards.length > 0 ? boards.map((b) => ({ ...b })) : defaults.workspaces;

  return {
    data: {
      workspaces: importedWorkspaces,
      settings: {
        ...defaults.settings,
        themeConfig: template.theme,
        topWidgets: template.headerWidgets ?? defaults.settings.topWidgets,
        lastBoardId: importedWorkspaces[0].id
      },
      installedAt: now
    },
    theme: template.theme
  };
}

export function importData(file: File): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(reader.result as string);
      } catch {
        reject(new Error(t('storage.invalidFileParse')));
        return;
      }

      try {
        if (isRecord(parsed) && parsed.format === 'prismi-template') {
          const template = normalizeTemplate(parsed);
          resolve(importTemplate(template));
          return;
        }
        if (isAppDataLike(parsed)) {
          resolve({ data: migrateAppData(parsed) });
          return;
        }
        reject(new Error(t('storage.invalidFileFormat')));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(t('storage.invalidFileFormat')));
      }
    };
    reader.onerror = () => reject(new Error(t('storage.errorReadingFile')));
    reader.readAsText(file);
  });
}
