import type { Workspace } from '@shared/types';

/**
 * Identity: workspace.id.
 *
 * - Same ID => the version with the higher `updatedAt` wins.
 *   On a tie, the incoming version wins.
 * - Different IDs => union — both appear as independent tabs.
 *   Widgets are never mixed across workspaces and no third tab is created.
 */
export function mergeWorkspaces(local: Workspace[], incoming: Workspace[]): Workspace[] {
  const map = new Map<string, Workspace>();

  for (const workspace of local) {
    map.set(workspace.id, workspace);
  }

  for (const workspace of incoming) {
    const existing = map.get(workspace.id);
    if (!existing) {
      map.set(workspace.id, workspace);
      continue;
    }
    map.set(workspace.id, mergeWorkspace(existing, workspace));
  }

  return Array.from(map.values()).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

function mergeWorkspace(local: Workspace, incoming: Workspace): Workspace {
  if (local.updatedAt > incoming.updatedAt) return local;
  return incoming;
}
