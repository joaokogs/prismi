import { useEffect, useRef, useState } from 'preact/hooks';
import { useI18n } from '@shared/i18n';
import { createPortal } from 'preact/compat';
import type { LinkGroup, LinkItem, LinksWidget } from '@shared/types';
import { getFaviconUrl } from '@shared/utils/url';
import { getTopLevelEntries } from '@shared/utils/linkOrder';
import type { TopLevelEntry } from '@shared/utils/linkOrder';
import { AnyIcon } from '@shared/icons';
import { ChevronDown, ChevronRight, GripVertical, MoreVertical, Pencil, Trash2 } from 'lucide-preact';
import { notifyMenuOpened, subscribeToMenuClose } from '../../utils/menu';

interface LinkDragState {
  linkId: string | null;
  fromWidgetId: string | null;
}

interface GroupDragState {
  groupId: string | null;
  fromWidgetId: string | null;
}

interface LinksWidgetProps {
  widget: LinksWidget;
  linkDrag: LinkDragState;
  groupDrag?: GroupDragState;
  openInNewTab?: boolean;
  onOpenLink?: (url: string) => void;
  onDeleteLink?: (linkId: string) => void;
  onEditLink?: (linkId: string) => void;
  onRenameGroup?: (groupId: string, title: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  onReorderGroup?: (groupId: string, toIndex: number) => void;
  onLinkDragStart?: (e: DragEvent, linkId: string) => void;
  onLinkDragEnd?: () => void;
  onLinkDrop?: (
    targetGroupId: string | null,
    targetLinkId: string | null,
    position: 'before' | 'after',
    targetGroupEntryId?: string | null
  ) => void;
  onGroupDragStart?: (e: DragEvent, groupId: string) => void;
  onGroupDragEnd?: () => void;
  onGroupDrop?: () => void;
}

interface DropTarget {
  groupId: string | null;
  linkId: string | null;
  /** Entrada de subpasta no topo (antes/depois dela, fora do grupo). */
  groupEntryId?: string | null;
  position: 'before' | 'after';
}

interface GroupSortTarget {
  index: number;
}

export function LinksWidgetView({
  widget,
  linkDrag,
  groupDrag,
  openInNewTab = true,
  onOpenLink,
  onDeleteLink,
  onEditLink,
  onRenameGroup,
  onDeleteGroup,
  onReorderGroup,
  onLinkDragStart,
  onLinkDragEnd,
  onLinkDrop,
  onGroupDragStart,
  onGroupDragEnd,
  onGroupDrop
}: LinksWidgetProps) {
  const { t } = useI18n();
  const listRef = useRef<HTMLUListElement>(null);
  const groupsRef = useRef<HTMLDivElement>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [groupDropActive, setGroupDropActive] = useState(false);
  const [groupSortTarget, setGroupSortTarget] = useState<GroupSortTarget | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const renameTargetRef = useRef<string | null>(null);
  const renameOriginalRef = useRef('');
  const renameDraftRef = useRef('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const widgetIdRef = useRef(widget.id);

  useEffect(() => {
    if (!linkDrag.linkId) {
      setDropTarget(null);
    }
  }, [linkDrag.linkId]);

  useEffect(() => {
    if (!groupDrag?.groupId) {
      setGroupDropActive(false);
      setGroupSortTarget(null);
    }
  }, [groupDrag?.groupId]);

  useEffect(() => {
    if (widgetIdRef.current === widget.id) return;
    widgetIdRef.current = widget.id;
    setCollapsedGroups([]);
    setRenamingGroupId(null);
    setDropTarget(null);
  }, [widget.id]);

  useEffect(() => {
    if (!renamingGroupId) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renamingGroupId]);

  const isGroupReorderDrag = !!groupDrag?.groupId && groupDrag.fromWidgetId === widget.id;

  const groups = widget.groups ?? [];
  const entries = groups.length > 0 ? getTopLevelEntries(widget) : [];
  const linksById = new Map(widget.items.map((item) => [item.id, item]));
  const groupsById = new Map(groups.map((group) => [group.id, group]));

  const getEntryElements = (): HTMLElement[] => {
    const container = groupsRef.current;
    if (!container) return [];
    return Array.from(container.querySelectorAll<HTMLElement>('.links-widget__entry'));
  };

  const getEntrySortIndex = (clientY: number): number => {
    const items = getEntryElements();
    for (let index = 0; index < items.length; index++) {
      const rect = items[index].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return index;
    }
    return items.length;
  };

  const toDropTarget = (entry: TopLevelEntry, position: 'before' | 'after'): DropTarget => (
    entry.kind === 'link'
      ? { groupId: null, linkId: entry.id, groupEntryId: null, position }
      : { groupId: null, linkId: null, groupEntryId: entry.id, position }
  );

  /**
   * Alvo do arrasto de link sobre TODAS as entradas de topo (links + subpastas),
   * pelo ponto médio de cada uma. Abaixo de todas → depois da última.
   */
  const getEntryHoverTarget = (clientY: number): DropTarget | null => {
    if (entries.length === 0) return null;
    const elements = getEntryElements();
    const count = Math.min(elements.length, entries.length);
    for (let index = 0; index < count; index++) {
      const rect = elements[index].getBoundingClientRect();
      if (clientY < rect.top) return toDropTarget(entries[index], 'before');
      if (clientY <= rect.bottom) {
        return toDropTarget(entries[index], clientY < rect.top + rect.height / 2 ? 'before' : 'after');
      }
    }
    return toDropTarget(entries[entries.length - 1], 'after');
  };

  const emitLinkDrop = (target: DropTarget | null) => {
    if (!target || !onLinkDrop || !linkDrag.linkId) return;
    // I1: soltar o link sobre ele mesmo é no-op.
    if (target.linkId && target.linkId === linkDrag.linkId) return;
    onLinkDrop(target.groupId, target.linkId, target.position, target.groupEntryId ?? null);
  };

  const commitGroupSort = (clientY: number) => {
    const groupId = groupDrag?.groupId;
    if (!groupId) return;
    const currentIndex = entries.findIndex((entry) => entry.kind === 'group' && entry.id === groupId);
    const index = getEntrySortIndex(clientY);
    setGroupSortTarget(null);
    if (currentIndex === -1 || index === currentIndex || index === currentIndex + 1) return;
    // O índice é o da lista unificada contando a própria entrada arrastada;
    // `reorderGroup` ajusta isso internamente.
    onReorderGroup?.(groupId, index);
  };

  const getDropTargetInList = (
    list: HTMLUListElement,
    groupId: string | null,
    clientY: number
  ): DropTarget => {
    const items = Array.from(list.querySelectorAll<HTMLLIElement>('.links-widget__item'));

    if (items.length === 0) {
      return { groupId, linkId: null, position: 'after' };
    }

    const firstRect = items[0].getBoundingClientRect();
    if (clientY <= firstRect.top) {
      return { groupId, linkId: items[0].dataset.linkId || null, position: 'before' };
    }

    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      const nextTop = i < items.length - 1 ? items[i + 1].getBoundingClientRect().top : rect.bottom + 20;

      if (clientY >= rect.top && clientY < nextTop) {
        const linkId = items[i].dataset.linkId;
        if (!linkId) continue;
        const midY = rect.top + rect.height / 2;
        return { groupId, linkId, position: clientY < midY ? 'before' : 'after' };
      }
    }

    const last = items[items.length - 1];
    return { groupId, linkId: last.dataset.linkId || null, position: 'after' };
  };

  const getDropPosition = (clientY: number): DropTarget | null => {
    if (!listRef.current) return null;
    return getDropTargetInList(listRef.current, null, clientY);
  };

  const handleDragOver = (e: DragEvent) => {
    if (groupDrag?.groupId) return;
    e.preventDefault();
    if (!linkDrag.linkId) return;
    const pos = getDropPosition(e.clientY);
    if (pos) setDropTarget(pos);
  };

  const handleDragLeave = (e: DragEvent) => {
    if (listRef.current && !listRef.current.contains(e.relatedTarget as Node)) {
      setDropTarget(null);
    }
  };

  const handleDrop = (e: DragEvent) => {
    if (groupDrag?.groupId) return;
    if (!onLinkDrop || !linkDrag.linkId) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = getDropPosition(e.clientY);
    if (pos && pos.linkId !== linkDrag.linkId) {
      onLinkDrop(pos.groupId, pos.linkId, pos.position);
    }
    setDropTarget(null);
  };

  const handleEntriesDragOver = (e: DragEvent) => {
    if (groupDrag?.groupId || !linkDrag.linkId) return;
    e.preventDefault();
    e.stopPropagation();
    const target = getEntryHoverTarget(e.clientY);
    if (target) setDropTarget(target);
  };

  const handleEntriesDrop = (e: DragEvent) => {
    if (groupDrag?.groupId) return;
    if (!onLinkDrop || !linkDrag.linkId) return;
    e.preventDefault();
    e.stopPropagation();
    emitLinkDrop(getEntryHoverTarget(e.clientY));
    setDropTarget(null);
  };

  const getItemDropClasses = (linkId: string): string => {
    const classes = ['links-widget__item'];
    if (dropTarget && linkDrag.linkId && dropTarget.linkId === linkId && dropTarget.linkId !== linkDrag.linkId) {
      if (dropTarget.position === 'before') classes.push('links-widget__item--drop-before');
      if (dropTarget.position === 'after') classes.push('links-widget__item--drop-after');
    }
    return classes.join(' ');
  };

  const getEntryDropClasses = (entry: TopLevelEntry): string => {
    if (!linkDrag.linkId || !dropTarget || groupDrag?.groupId) return '';
    if (entry.kind === 'link') {
      if (entry.id === linkDrag.linkId) return '';
      if (dropTarget.groupId || dropTarget.linkId !== entry.id) return '';
    } else if (dropTarget.groupEntryId !== entry.id) {
      return '';
    }
    return dropTarget.position === 'before'
      ? ' links-widget__entry--drop-before'
      : ' links-widget__entry--drop-after';
  };

  const isGroupCollapsed = (key: string): boolean => collapsedGroups.includes(key);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => (
      prev.includes(key) ? prev.filter((id) => id !== key) : [...prev, key]
    ));
  };

  const startRename = (group: LinkGroup) => {
    renameTargetRef.current = group.id;
    renameOriginalRef.current = group.title;
    renameDraftRef.current = group.title;
    setRenameDraft(group.title);
    setRenamingGroupId(group.id);
  };

  const commitRename = () => {
    const targetId = renameTargetRef.current;
    if (!targetId) return;
    renameTargetRef.current = null;
    const nextTitle = renameDraftRef.current.trim();
    if (!nextTitle || nextTitle === renameOriginalRef.current.trim()) {
      setRenamingGroupId(null);
      return;
    }
    onRenameGroup?.(targetId, nextTitle);
    setRenamingGroupId(null);
  };

  const cancelRename = () => {
    renameTargetRef.current = null;
    setRenamingGroupId(null);
  };

  const handleRenameKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelRename();
    }
  };

  const handleGroupDragOver = (
    e: DragEvent,
    groupId: string | null,
    list: HTMLUListElement
  ) => {
    if (groupDrag?.groupId) return;
    if (!linkDrag.linkId) return;
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(getDropTargetInList(list, groupId, e.clientY));
  };

  /**
   * Header da subpasta: bordas superior/inferior posicionam a entrada
   * (antes/depois da subpasta); o miolo continua entrando no grupo.
   */
  const resolveGroupHeaderTarget = (e: DragEvent, groupId: string): DropTarget => {
    const entry = entries.find((candidate) => candidate.kind === 'group' && candidate.id === groupId);
    if (!entry) return { groupId, linkId: null, position: 'before' };
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const edge = Math.min(8, rect.height / 3);
    if (e.clientY < rect.top + edge) return toDropTarget(entry, 'before');
    if (e.clientY > rect.bottom - edge) return toDropTarget(entry, 'after');
    return { groupId, linkId: null, position: 'before' };
  };

  const handleGroupHeaderDragOver = (e: DragEvent, groupId: string) => {
    if (groupDrag?.groupId) return;
    if (!linkDrag.linkId) return;
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(resolveGroupHeaderTarget(e, groupId));
  };

  const handleGroupHeaderDrop = (e: DragEvent, groupId: string) => {
    if (groupDrag?.groupId) return;
    if (!onLinkDrop || !linkDrag.linkId) return;
    e.preventDefault();
    e.stopPropagation();
    emitLinkDrop(resolveGroupHeaderTarget(e, groupId));
    setDropTarget(null);
  };

  const handleGroupDrop = (
    e: DragEvent,
    groupId: string | null,
    list: HTMLUListElement
  ) => {
    if (groupDrag?.groupId) return;
    if (!onLinkDrop || !linkDrag.linkId) return;
    e.preventDefault();
    e.stopPropagation();
    const target = getDropTargetInList(list, groupId, e.clientY);
    if (target.linkId !== linkDrag.linkId) {
      onLinkDrop(target.groupId, target.linkId, target.position);
    }
    setDropTarget(null);
  };

  const handleGroupDragLeave = (e: DragEvent, groupId: string | null) => {
    const section = e.currentTarget as HTMLElement;
    if (section.contains(e.relatedTarget as Node)) return;
    if (dropTarget?.groupId !== groupId) return;
    setDropTarget(null);
  };

  const handleGroupsDragOver = (e: DragEvent) => {
    if (groupDrag?.groupId) {
      e.preventDefault();
      if (groupDrag.fromWidgetId === widget.id) {
        setGroupDropActive(false);
        setGroupSortTarget({ index: getEntrySortIndex(e.clientY) });
        return;
      }
      setGroupDropActive(true);
      return;
    }
    // N3: a área vazia do bloco também aceita link (resolve como depois da última entrada).
    if (!linkDrag.linkId) return;
    e.preventDefault();
    const target = getEntryHoverTarget(e.clientY);
    if (target) setDropTarget(target);
  };

  const handleGroupsDragLeave = (e: DragEvent) => {
    const container = e.currentTarget as HTMLElement;
    if (container.contains(e.relatedTarget as Node)) return;
    setGroupDropActive(false);
    setGroupSortTarget(null);
    setDropTarget(null);
  };

  const handleGroupsDrop = (e: DragEvent) => {
    if (groupDrag?.groupId) {
      e.preventDefault();
      e.stopPropagation();
      setGroupDropActive(false);
      if (groupDrag.fromWidgetId === widget.id) {
        commitGroupSort(e.clientY);
        return;
      }
      setGroupSortTarget(null);
      onGroupDrop?.();
      return;
    }
    if (!onLinkDrop || !linkDrag.linkId) return;
    e.preventDefault();
    e.stopPropagation();
    emitLinkDrop(getEntryHoverTarget(e.clientY));
    setDropTarget(null);
  };

  const handleGroupSectionDragOver = (e: DragEvent) => {
    if (!isGroupReorderDrag) return;
    e.preventDefault();
    e.stopPropagation();
    setGroupDropActive(false);
    setGroupSortTarget({ index: getEntrySortIndex(e.clientY) });
  };

  const handleGroupSectionDrop = (e: DragEvent) => {
    if (!isGroupReorderDrag) return;
    e.preventDefault();
    e.stopPropagation();
    commitGroupSort(e.clientY);
  };

  const handleGroupStartDrag = (e: DragEvent, groupId: string) => {
    if (!onGroupDragStart || linkDrag.linkId) {
      e.preventDefault();
      return;
    }
    e.stopPropagation();
    e.dataTransfer?.setData('text/plain', JSON.stringify({ groupId, widgetId: widget.id }));
    e.dataTransfer?.setDragImage(new Image(), 0, 0);
    onGroupDragStart(e, groupId);
  };

  const getGroupDropClasses = (groupId: string | null): string => {
    if (!linkDrag.linkId || !dropTarget) return '';
    return dropTarget.groupId === groupId && dropTarget.linkId === null
      ? ' links-widget__group--drop-target'
      : '';
  };

  const getGroupSortClasses = (entryIndex: number): string => {
    if (!groupSortTarget || !groupDrag?.groupId) return '';
    const currentIndex = entries.findIndex((entry) => entry.kind === 'group' && entry.id === groupDrag.groupId);
    if (
      currentIndex === -1 ||
      groupSortTarget.index === currentIndex ||
      groupSortTarget.index === currentIndex + 1
    ) {
      return '';
    }
    if (groupSortTarget.index === entryIndex) return ' links-widget__entry--drop-before';
    if (groupSortTarget.index === entries.length && entryIndex === entries.length - 1) {
      return ' links-widget__entry--drop-after';
    }
    return '';
  };

  const renderLinkRows = (links: LinkItem[]) => links.map((link) => (
    <LinkRow
      key={link.id}
      link={link}
      className={getItemDropClasses(link.id)}
      isDragging={linkDrag.linkId === link.id}
      openInNewTab={openInNewTab}
      onOpenLink={onOpenLink}
      onDelete={onDeleteLink}
      onEdit={onEditLink}
      onDragStart={onLinkDragStart}
      onDragEnd={onLinkDragEnd}
    />
  ));

  const renderGroup = (group: LinkGroup, links: LinkItem[]) => {
    const groupId = group.id;
    const collapsed = isGroupCollapsed(groupId);
    const renaming = renamingGroupId === groupId;
    const bodyId = `links-group-${widget.id}-${groupId}`;
    const labelId = `${bodyId}-label`;
    const renameInputId = `${bodyId}-rename`;
    const displayTitle = group.title || t('defaults.newGroup');
    const canManage = !!(onRenameGroup || onDeleteGroup);
    const canDrag = !!onGroupDragStart && !linkDrag.linkId;

    return (
      <section
        key={groupId}
        data-group-id={groupId}
        className={`links-widget__group${getGroupDropClasses(groupId)}`}
        role="group"
        aria-labelledby={renaming ? undefined : labelId}
        aria-label={renaming ? displayTitle : undefined}
        onDragOver={handleGroupSectionDragOver}
        onDrop={handleGroupSectionDrop}
        onDragLeave={(e) => handleGroupDragLeave(e, groupId)}
      >
        <div
          className="links-widget__group-header"
          draggable={canDrag && !renaming}
          title={canDrag ? t('linksWidget.dragGroup', { title: displayTitle }) : undefined}
          aria-label={canDrag ? t('linksWidget.dragGroup', { title: displayTitle }) : undefined}
          onDragStart={(e) => handleGroupStartDrag(e, groupId)}
          onDragEnd={onGroupDragEnd}
          onDragOver={(e) => handleGroupHeaderDragOver(e, groupId)}
          onDrop={(e) => handleGroupHeaderDrop(e, groupId)}
        >
          <button
            type="button"
            className="links-widget__group-toggle"
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            aria-label={t(collapsed ? 'linksWidget.expandGroup' : 'linksWidget.collapseGroup', { title: displayTitle })}
            onClick={() => toggleGroup(groupId)}
          >
            {collapsed ? <ChevronRight size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
            {!renaming && <span id={labelId} className="links-widget__group-title">{displayTitle}</span>}
          </button>
          {renaming && (
            <input
              ref={renameInputRef}
              id={renameInputId}
              type="text"
              className="links-widget__group-title-input"
              value={renameDraft}
              aria-label={t('linksWidget.renameGroup')}
              onInput={(e) => {
                const value = (e.target as HTMLInputElement).value;
                renameDraftRef.current = value;
                setRenameDraft(value);
              }}
              onKeyDown={handleRenameKeyDown}
              onBlur={commitRename}
            />
          )}
          <span className="links-widget__group-count" aria-hidden="true">{links.length}</span>
          {canManage && !renaming && (
            <GroupMenu
              onRename={onRenameGroup ? () => startRename(group) : undefined}
              onDelete={onDeleteGroup ? () => onDeleteGroup(groupId) : undefined}
            />
          )}
        </div>
        <div id={bodyId} className="links-widget__group-body-wrap">
          {!collapsed && (
            <ul
              className="links-widget links-widget__group-body"
              onDragOver={(e) => handleGroupDragOver(e, groupId, e.currentTarget as HTMLUListElement)}
              onDrop={(e) => handleGroupDrop(e, groupId, e.currentTarget as HTMLUListElement)}
            >
              {links.length === 0 && (
                <li className="links-widget__group-empty">
                  {dropTarget?.groupId === groupId && dropTarget.linkId === null
                    ? <div className="links-widget__group-drop-into" aria-hidden="true" />
                    : t('linksWidget.emptyGroup')}
                </li>
              )}
              {renderLinkRows(links)}
            </ul>
          )}
        </div>
      </section>
    );
  };

  if (groups.length === 0) {
    return (
      <ul
        ref={listRef}
        className={`links-widget${groupDropActive ? ' links-widget--group-drop-target' : ''}`}
        onDragOver={(e) => {
          if (groupDrag?.groupId) {
            handleGroupsDragOver(e);
            return;
          }
          handleDragOver(e);
        }}
        onDragLeave={(e) => {
          handleGroupsDragLeave(e);
          handleDragLeave(e);
        }}
        onDrop={(e) => {
          if (groupDrag?.groupId) {
            handleGroupsDrop(e);
            return;
          }
          handleDrop(e);
        }}
      >
        {widget.items.length === 0 && linkDrag.linkId && dropTarget && dropTarget.linkId === null && (
          <li className="links-widget__drop-into" />
        )}
        {renderLinkRows(widget.items)}
      </ul>
    );
  }

  return (
    <div
      ref={groupsRef}
      className={`links-widget__groups${groupDropActive ? ' links-widget--group-drop-target' : ''}`}
      onDragOver={handleGroupsDragOver}
      onDragLeave={handleGroupsDragLeave}
      onDrop={handleGroupsDrop}
    >
      <ul
        className="links-widget links-widget__entries"
        onDragOver={handleEntriesDragOver}
        onDrop={handleEntriesDrop}
      >
        {entries.map((entry, entryIndex) => {
          if (entry.kind === 'link') {
            const link = linksById.get(entry.id);
            if (!link) return null;
            return (
              <LinkRow
                key={link.id}
                link={link}
                className={`links-widget__item links-widget__entry${getGroupSortClasses(entryIndex)}${getEntryDropClasses(entry)}`}
                isDragging={linkDrag.linkId === link.id}
                openInNewTab={openInNewTab}
                onOpenLink={onOpenLink}
                onDelete={onDeleteLink}
                onEdit={onEditLink}
                onDragStart={onLinkDragStart}
                onDragEnd={onLinkDragEnd}
              />
            );
          }

          const group = groupsById.get(entry.id);
          if (!group) return null;
          return (
            <li
              key={group.id}
              className={`links-widget__entries-item links-widget__entry${getGroupSortClasses(entryIndex)}${getEntryDropClasses(entry)}`}
            >
              {renderGroup(group, widget.items.filter((item) => item.groupId === group.id))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GroupMenu({
  onRename,
  onDelete
}: {
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const kebabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        kebabRef.current &&
        !kebabRef.current.contains(target)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    return subscribeToMenuClose(() => setMenuOpen(false));
  }, [menuOpen]);

  const openMenu = () => {
    notifyMenuOpened();
    if (kebabRef.current) {
      const rect = kebabRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 2, right: window.innerWidth - rect.right });
    }
    setMenuOpen(true);
  };

  const handleKebabClick = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (menuOpen) {
      setMenuOpen(false);
    } else {
      openMenu();
    }
  };

  const handleAction = (fn?: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setMenuOpen(false);
    fn?.();
  };

  return (
    <div className="links-widget__group-actions">
      <button
        ref={kebabRef}
        className="links-widget__kebab"
        onClick={handleKebabClick}
        aria-label={t('linksWidget.groupActions')}
        title={t('linksWidget.groupActions')}
      >
        <MoreVertical size={14} strokeWidth={2} />
      </button>
      {menuOpen && createPortal(
        <div
          ref={menuRef}
          className="links-widget__menu"
          style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
        >
          {onRename && (
            <button className="links-widget__menu-item" onClick={handleAction(onRename)}>
              <Pencil size={14} strokeWidth={2} />
              {t('linksWidget.renameGroup')}
            </button>
          )}
          {onDelete && (
            <button
              className="links-widget__menu-item links-widget__menu-item--danger"
              onClick={handleAction(onDelete)}
            >
              <Trash2 size={14} strokeWidth={2} />
              {t('linksWidget.deleteGroup')}
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

function LinkRow({
  link,
  className,
  isDragging,
  openInNewTab = true,
  onOpenLink,
  onDelete,
  onEdit,
  onDragStart,
  onDragEnd
}: {
  link: LinkItem;
  className?: string;
  isDragging?: boolean;
  openInNewTab?: boolean;
  onOpenLink?: (url: string) => void;
  onDelete?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDragStart?: (e: DragEvent, linkId: string) => void;
  onDragEnd?: () => void;
}) {
  const { t } = useI18n();
  const [imageError, setImageError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const kebabRef = useRef<HTMLButtonElement>(null);
  const favicon = link.favicon && !imageError ? link.favicon : getFaviconUrl(link.url);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        kebabRef.current &&
        !kebabRef.current.contains(target)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    return subscribeToMenuClose(() => setMenuOpen(false));
  }, [menuOpen]);

  const openMenu = () => {
    notifyMenuOpened();
    if (kebabRef.current) {
      const rect = kebabRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 2, right: window.innerWidth - rect.right });
    }
    setMenuOpen(true);
  };

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openMenu();
  };

  const handleKebabClick = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (menuOpen) {
      setMenuOpen(false);
    } else {
      openMenu();
    }
  };

  const handleAction = (fn?: (id: string) => void) => (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setMenuOpen(false);
    fn?.(link.id);
  };

  const handleDragStart = (e: DragEvent) => {
    if (!onDragStart) return;
    e.stopPropagation();
    onDragStart(e, link.id);
  };

  const handleDragEnd = () => {
    onDragEnd?.();
  };

  const handleOpen = (e: MouseEvent) => {
    if (!onOpenLink || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpenLink(link.url);
  };

  return (
    <li
      className={`${className || 'links-widget__item'}${isDragging ? ' links-widget__item--dragging' : ''}`}
      data-link-id={link.id}
      draggable={!!onDragStart}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onContextMenu={handleContextMenu}
    >
      <a
        href={link.url}
        target={openInNewTab ? '_blank' : '_self'}
        rel="noopener noreferrer"
        className="links-widget__link"
        aria-label={t('linksWidget.open', { title: link.title })}
        onClick={handleOpen}
      >
        <span className="links-widget__drag-handle" aria-hidden="true">
          <GripVertical size={12} />
        </span>
        <span className="links-widget__icon">
          {link.icon ? (
            <AnyIcon name={link.icon} size={16} />
          ) : favicon ? (
            <img
              src={favicon}
              alt=""
              width="18"
              height="18"
              loading="lazy"
              decoding="async"
              onError={() => setImageError(true)}
            />
          ) : (
            <AnyIcon name="link" size={14} />
          )}
        </span>
        <span className="links-widget__text">{link.title}</span>
      </a>
      {(onEdit || onDelete) && (
        <div className="links-widget__actions">
          <button
            ref={kebabRef}
            className="links-widget__kebab"
            onClick={handleKebabClick}
            aria-label={t('linksWidget.linkActions')}
            title={t('linksWidget.actions')}
          >
            <MoreVertical size={14} strokeWidth={2} />
          </button>
          {menuOpen && createPortal(
            <div
              ref={menuRef}
              className="links-widget__menu"
              style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
            >
              {onEdit && (
                <button
                  className="links-widget__menu-item"
                  onClick={handleAction(onEdit)}
                >
                  <Pencil size={14} strokeWidth={2} />
                  {t('linksWidget.edit')}
                </button>
              )}
              {onDelete && (
                <button
                  className="links-widget__menu-item links-widget__menu-item--danger"
                  onClick={handleAction(onDelete)}
                >
                  <Trash2 size={14} strokeWidth={2} />
                  {t('linksWidget.delete')}
                </button>
              )}
            </div>,
            document.body
          )}
        </div>
      )}
    </li>
  );
}
