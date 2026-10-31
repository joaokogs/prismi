import type { LinksWidget } from '@shared/types';

/**
 * Entrada de topo de um widget de links: um link solto (item sem `groupId`
 * válido) ou uma subpasta. A ordem é única no bloco e compartilhada pelos dois
 * tipos, então uma subpasta pode ficar no meio dos links soltos.
 */
export type TopLevelEntry =
  | { kind: 'link'; id: string; order: number }
  | { kind: 'group'; id: string; order: number };

type Candidate = TopLevelEntry & { fallback: number };

function getValidGroups(widget: LinksWidget) {
  return (widget.groups ?? []).filter((group) => typeof group?.id === 'string');
}

/**
 * Compara duas entradas pela ordem, desempatando link antes de subpasta.
 * Empates de mesmo tipo ficam estáveis no sort do chamador.
 */
export function entryCompare(a: TopLevelEntry, b: TopLevelEntry): number {
  if (a.order !== b.order) return a.order - b.order;
  if (a.kind === b.kind) return 0;
  return a.kind === 'link' ? -1 : 1;
}

/**
 * Lista as entradas de topo na ordem efetiva (já renumerada `0..n-1` só para
 * leitura). Fallback quando `order` está ausente: links soltos na ordem do
 * array `items`, depois subpastas na ordem do array `groups`.
 */
export function getTopLevelEntries(widget: LinksWidget): TopLevelEntry[] {
  const groups = getValidGroups(widget);
  const groupIds = new Set(groups.map((group) => group.id));
  const candidates: Candidate[] = [];
  let fallback = 0;

  for (const item of widget.items) {
    if (item.groupId && groupIds.has(item.groupId)) continue;
    candidates.push({
      kind: 'link',
      id: item.id,
      order: item.order ?? fallback,
      fallback,
    });
    fallback += 1;
  }

  const groupOffset = fallback;
  groups.forEach((group, index) => {
    const sourceIndex = groupOffset + index;
    candidates.push({
      kind: 'group',
      id: group.id,
      order: group.order ?? sourceIndex,
      fallback: sourceIndex,
    });
  });

  candidates.sort((a, b) => entryCompare(a, b) || a.fallback - b.fallback);

  return candidates.map((entry, index) => ({ kind: entry.kind, id: entry.id, order: index }));
}

/**
 * Grava a ordem informada pela sequência `entries` (o índice no array é a nova
 * ordem), remove `order` de links dentro de subpastas e de links que não fazem
 * parte das entradas. Retorna o próprio widget quando nada muda.
 */
export function applyTopLevelEntryOrder(
  widget: LinksWidget,
  entries: ReadonlyArray<TopLevelEntry>
): LinksWidget {
  const groups = widget.groups ?? [];
  const groupIds = new Set(groups.map((group) => group.id));
  const linkOrders = new Map<string, number>();
  const groupOrders = new Map<string, number>();

  entries.forEach((entry, index) => {
    if (entry.kind === 'link') linkOrders.set(entry.id, index);
    else groupOrders.set(entry.id, index);
  });

  let changed = false;

  const items = widget.items.map((item) => {
    const isLoose = !item.groupId || !groupIds.has(item.groupId);
    if (!isLoose) {
      if (item.order === undefined) return item;
      changed = true;
      const next = { ...item };
      delete next.order;
      return next;
    }

    const target = linkOrders.get(item.id);
    if (target === undefined) {
      if (item.order === undefined) return item;
      changed = true;
      const next = { ...item };
      delete next.order;
      return next;
    }
    if (item.order === target) return item;
    changed = true;
    return { ...item, order: target };
  });

  const nextGroups = widget.groups === undefined
    ? undefined
    : widget.groups.map((group) => {
      const target = groupOrders.get(group.id);
      if (target === undefined || group.order === target) return group;
      changed = true;
      return { ...group, order: target };
    });

  if (!changed) return widget;
  return {
    ...widget,
    items,
    ...(nextGroups === undefined ? {} : { groups: nextGroups }),
  };
}

/**
 * Reescreve `items` na sequência efetiva das entradas: cada entrada `link` vira
 * aquele item e cada entrada `group` expande os itens do grupo na ordem
 * relativa atual. Links fora de qualquer entrada (dado inconsistente) vão para
 * o fim, sem perder nada. Só cria um array novo quando a ordem muda.
 */
export function orderItemsByEntries(
  widget: LinksWidget,
  entries: ReadonlyArray<TopLevelEntry>
): LinksWidget {
  const itemsById = new Map(widget.items.map((item) => [item.id, item]));
  const used = new Set<string>();
  const nextItems: typeof widget.items = [];

  for (const entry of entries) {
    if (entry.kind === 'link') {
      const item = itemsById.get(entry.id);
      if (!item || used.has(item.id)) continue;
      used.add(item.id);
      nextItems.push(item);
      continue;
    }
    for (const item of widget.items) {
      if (item.groupId !== entry.id || used.has(item.id)) continue;
      used.add(item.id);
      nextItems.push(item);
    }
  }

  for (const item of widget.items) {
    if (used.has(item.id)) continue;
    used.add(item.id);
    nextItems.push(item);
  }

  const changed = nextItems.length !== widget.items.length
    || nextItems.some((item, index) => item !== widget.items[index]);
  return changed ? { ...widget, items: nextItems } : widget;
}

/**
 * Normaliza a ordem das entradas de topo. Idempotente: rodar duas vezes
 * produz o mesmo JSON (e o mesmo objeto quando nada muda). O array `items` é
 * reescrito na sequência efetiva, inclusive quando o widget deixa de ter
 * subpastas; nesse caso `order` é removido de todos os itens e a chave
 * `groups` também é removida quando fica vazia.
 */
export function normalizeTopLevelOrder(widget: LinksWidget): LinksWidget {
  const entries = getTopLevelEntries(widget);
  const ordered = orderItemsByEntries(widget, entries);

  if ((ordered.groups ?? []).length > 0) {
    return applyTopLevelEntryOrder(ordered, entries);
  }

  let changed = ordered !== widget;
  const items = ordered.items.map((item) => {
    if (item.order === undefined) return item;
    changed = true;
    const next = { ...item };
    delete next.order;
    return next;
  });

  if (ordered.groups === undefined) {
    return changed ? { ...ordered, items } : widget;
  }

  const next: LinksWidget = { ...ordered, items };
  delete next.groups;
  return next;
}
