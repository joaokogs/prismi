export {
  loadData,
  saveData,
  ensureData,
  STORAGE_KEY,
  getWorkspaces,
  getBoards,
  getWorkspaceById,
  toWorkspace,
  toBoard,
  updateWorkspace,
  updateWidgetInWorkspace,
  onStorageFailure,
  notifyStorageFailure,
} from './storage/index';
export type { WriteResult } from './storage/index';

export {
  createBoard,
  addBoard,
  renameBoard,
  reorderBoard,
  deleteBoard,
  getBoardById,
  getInitialBoardId,
  updateSettings,
  removeRecentSearch,
  clearRecentSearches,
  updateTopWidgets,
  addRecentSearch,
} from './storage/boards';

export {
  createWidget,
  defaultWidgetTitle,
  addWidget,
  deleteWidget,
  updateWidget,
  moveWidgetOrder,
  reorderWidgets,
  getWidgetById,
  getWidgetsForBoard,
} from './storage/widgets';

export {
  createLink,
  addLink,
  deleteLink,
  updateLink,
  searchLinks,
  moveLink,
  createGroup,
  addGroup,
  renameGroup,
  deleteGroup,
  moveGroup,
  reorderGroup,
  explodeGroupToWidget,
  absorbWidgetAsGroup,
} from './storage/links';

export {
  createTodoItem,
  addTodoItem,
  deleteTodoItem,
  updateTodoItem,
  toggleTodoItem,
  moveTodoItem,
} from './storage/todos';

export {
  exportData,
  importData,
} from './storage/backup';

export { normalizeUrl, getFaviconUrl } from './utils/url';
