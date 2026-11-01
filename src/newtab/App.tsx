import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Settings, Menu, Plus, Palette } from 'lucide-preact';
import type { AppData, ThemeConfig, UploadedBackground, Widget, WidgetType, TopWidgetConfig, SearchEngine } from '@shared/types';
import { DEFAULT_WALLPAPERS, SEARCH_ENGINES } from '@shared/types/constants';
import { getDefaultData } from '@shared/types/defaults';
import { useI18n, setLocale as setI18nLocale } from '@shared/i18n';
import {
  loadData,
  saveData,
  STORAGE_KEY,
  onStorageFailure,
  getBoards,
} from '@shared/storage';
import { deleteBackground, getBackgroundBlob, gcOrphanedAssets } from '@shared/storage/backgrounds';
import { createBoard, addBoard, renameBoard, reorderBoard, deleteBoard, getBoardById, getInitialBoardId, updateSettings, removeRecentSearch, clearRecentSearches, addRecentSearch } from '@shared/storage/boards';
import { createWidget, addWidget, deleteWidget, updateWidget, getWidgetsForBoard } from '@shared/storage/widgets';
import { createLink, addLink, deleteLink, updateLink, moveLink, createGroup, addGroup, renameGroup, deleteGroup, moveGroup, reorderGroup, explodeGroupToWidget, absorbWidgetAsGroup } from '@shared/storage/links';
import type { LinkPlacement } from '@shared/storage/links';
import { createTodoItem, addTodoItem, deleteTodoItem, updateTodoItem, toggleTodoItem, moveTodoItem } from '@shared/storage/todos';
import { exportData, importData } from '@shared/storage/backup';
import { BoardTabs } from './components/layout/BoardTabs';
import { WidgetGrid } from './components/widgets/WidgetGrid';
import { WidgetEditor } from './components/dialogs/WidgetEditor';
import { LinkDialog } from './components/dialogs/LinkDialog';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { BackgroundPanel } from './components/settings/BackgroundPanel';
import { TopInfoWidgets } from './components/layout/TopInfoWidgets';
import { WidgetToolbar } from './components/settings/WidgetToolbar';
import { ConfirmDialog } from './components/dialogs/ConfirmDialog';
import { NewTabDialog } from './components/dialogs/NewTabDialog';
import { ModalDialog } from './components/dialogs/ModalDialog';
import { SearchBar } from './components/layout/SearchBar';
import { BookmarkFolderPicker, type BookmarkFolder } from './components/dialogs/BookmarkFolderPicker';
import { useThemeStore, type ThemeState } from './store/useThemeStore';
import { notifyMenuOpened, subscribeToMenuClose } from './utils/menu';
import { computeThemeVariables } from '@shared/theme';
import { browser, openUrl } from '@shared/browser';
import type { Bookmarks, Storage } from 'webextension-polyfill';
import { migrateAppData } from '@shared/storage/migrate';
import { mergeWorkspaces } from '@shared/storage/merge';
import './styles/index.css';

function looksLikeUrl(str: string): boolean {
  return /^https?:\/\//i.test(str) || /^[a-z0-9][-a-z0-9]*\.[a-z]{2,}(\/|$)/i.test(str);
}

function ensureProtocol(str: string): string {
  if (/^https?:\/\//i.test(str)) return str;
  return `https://${str}`;
}

interface ConfirmState {
  title: string;
  message: string;
  danger?: boolean;
  confirmLabel?: string;
  onConfirm: () => void;
}

function getBookmarkFolders(nodes: Bookmarks.BookmarkTreeNode[], untitledTitle: string, depth = 0): BookmarkFolder[] {
  return nodes.flatMap((node) => {
    if (node.type === 'separator') return [];
    if (!node.children) return [];
    const folder = node.parentId ? [{ id: node.id, title: node.title || untitledTitle, depth }] : [];
    return [...folder, ...getBookmarkFolders(node.children, untitledTitle, depth + 1)];
  });
}

async function removeVideoBackgrounds(data: AppData): Promise<AppData> {
  const uploaded = data.settings.uploadedBackgrounds || [];
  const videoAssets = uploaded.filter((background): background is UploadedBackground =>
    typeof background !== 'string' && background.kind === 'video'
  );
  const videoIds = new Set(videoAssets.map((background) => background.id));
  const wallpaper = data.settings.wallpaper;
  if (wallpaper.type === 'asset' && wallpaper.mediaType === 'video') videoIds.add(wallpaper.value);
  if (videoIds.size === 0) return data;

  await Promise.all(Array.from(videoIds).map((id) => deleteBackground(id).catch(() => undefined)));
  return {
    ...data,
    settings: {
      ...data.settings,
      uploadedBackgrounds: uploaded.filter((background) => typeof background === 'string' || !videoIds.has(background.id)),
      wallpaper: wallpaper.type === 'asset' && videoIds.has(wallpaper.value) ? DEFAULT_WALLPAPERS[0] : wallpaper
    }
  };
}

function ensureRenderableData(data: AppData): AppData {
  const normalized = migrateAppData(data);
  if (getBoards(normalized).length > 0) return normalized;

  const fallback = getDefaultData();
  return {
    ...normalized,
    workspaces: fallback.workspaces,
    settings: {
      ...normalized.settings,
      lastBoardId: fallback.settings.lastBoardId,
    },
  };
}

function getThemeConfigForPersist(): Omit<ThemeConfig, 'derivedFromWallpaper'> {
  const { derivedFromWallpaper: _, ...config } = useThemeStore.getState().themeConfig;
  return config;
}

export function App() {
  const { t } = useI18n();
  const [data, setData] = useState<AppData | null>(null);
  const [activeBoardId, setActiveBoardId] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showBackground, setShowBackground] = useState(false);
  const [showWidgetToolbar, setShowWidgetToolbar] = useState(false);
  const [isAddingWidget, setIsAddingWidget] = useState(false);
  const [editingWidget, setEditingWidget] = useState<Widget | null>(null);
  const [addingLinkWidget, setAddingLinkWidget] = useState<Widget | null>(null);
  const [editingLink, setEditingLink] = useState<{ widgetId: string; linkId: string } | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [showNewTabDialog, setShowNewTabDialog] = useState(false);
  const [showBookmarkFolders, setShowBookmarkFolders] = useState(false);
  const [bookmarkFolders, setBookmarkFolders] = useState<BookmarkFolder[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchEngine, setSearchEngine] = useState<SearchEngine>('google');
  const [wallpaperObjectUrl, setWallpaperObjectUrl] = useState<string | null>(null);
  const [storageFailure, setStorageFailure] = useState(false);
  const gcIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let mounted = true;
    loadData().then((loaded) => {
      if (!mounted) return;
      const initial = ensureRenderableData(loaded);
      setData(initial);
      setActiveBoardId(getInitialBoardId(initial));
      if (initial.settings.locale) {
        setI18nLocale(initial.settings.locale as any);
      }

      void removeVideoBackgrounds(initial).then((cleaned) => {
        if (!mounted || cleaned === initial || latestDataRef.current !== initial) return;
        const renderable = ensureRenderableData(cleaned);
        setData(renderable);
        setActiveBoardId((current) => getBoards(renderable).some((board) => board.id === current) ? current : getInitialBoardId(renderable));
      }).catch((err) => {
        console.error('[App] failed to clean video backgrounds:', err);
      });
    }).catch((err) => {
      if (!mounted) return;
      console.error('[App] failed to initialize local data:', err);
      const fallback = getDefaultData();
      setData(fallback);
      setActiveBoardId(getInitialBoardId(fallback));
    });
    return () => {
      mounted = false;
    };
  }, []);

  const saveDebounceRef = useRef<number | null>(null);
  const latestDataRef = useRef<AppData | null>(null);
  const themeHydratingRef = useRef(true);

  useEffect(() => {
    latestDataRef.current = data;
    if (data) {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = window.setTimeout(() => {
        saveDebounceRef.current = null;
        if (latestDataRef.current) {
          saveData(latestDataRef.current);
        }
      }, 500);
    }
    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    };
  }, [data]);

  useEffect(() => {
    const handleStorageChange = (changes: Record<string, Storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local') return;
      const next = changes[STORAGE_KEY]?.newValue as AppData | undefined;
      if (!next || !Array.isArray(next.workspaces) || !next.settings) return;
      if (latestDataRef.current && JSON.stringify(latestDataRef.current) === JSON.stringify(next)) return;

      setData(next);
      setActiveBoardId((current) => getBoards(next).some((board) => board.id === current) ? current : getInitialBoardId(next));
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    return () => browser.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  useEffect(() => {
    const flush = () => {
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = null;
      }
      if (latestDataRef.current) saveData(latestDataRef.current);
    };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, []);

  useEffect(() => {
    return onStorageFailure(() => {
      setStorageFailure(true);
    });
  }, []);

  useEffect(() => {
    const runGc = () => {
      if (!latestDataRef.current) return;
      const uploaded = latestDataRef.current.settings.uploadedBackgrounds ?? [];
      const wallpaper = latestDataRef.current?.settings.wallpaper;
      const refs = new Set<string>();

      for (const bg of uploaded) {
        if (typeof bg !== 'string') refs.add(bg.id);
      }
      if (wallpaper?.type === 'asset') refs.add(wallpaper.value);

      gcOrphanedAssets(refs).catch(() => undefined);
    };

    gcIntervalRef.current = setInterval(runGc, 60 * 60 * 1000);
    return () => {
      if (gcIntervalRef.current) clearInterval(gcIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (data && activeBoardId && data.settings.lastBoardId !== activeBoardId) {
      setData((prev) => (prev ? updateSettings(prev, { lastBoardId: activeBoardId }) : prev));
    }
  }, [activeBoardId]);

  const themeConfig = useThemeStore((s: ThemeState) => s.themeConfig);
  const themeMode = useThemeStore((s: ThemeState) => s.themeMode);
  const setThemeMode = useThemeStore((s: ThemeState) => s.setThemeMode);

  useEffect(() => {
    if (data?.settings.theme && data.settings.theme !== themeMode) {
      setThemeMode(data.settings.theme);
    }
  }, [data?.settings.theme]);

  useEffect(() => {
    const theme = themeMode === 'system' ? (data?.settings.theme ?? 'system') : themeMode;
    const root = document.documentElement;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = theme === 'dark' || (theme === 'system' && systemDark);
    root.classList.toggle('theme-dark', isDark);
    root.classList.toggle('theme-light', !isDark);

    const vars = computeThemeVariables(themeConfig, isDark);
    Object.entries(vars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }, [themeConfig, themeMode, data?.settings.theme]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      const bar = document.querySelector('.app-fab-bar');
      if (bar && !bar.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    return subscribeToMenuClose(() => setMenuOpen(false));
  }, [menuOpen]);

  useEffect(() => {
    const searchWidget = data?.settings.topWidgets?.find((w) => w.type === 'search');
    if (searchWidget?.searchEngine) {
      setSearchEngine(searchWidget.searchEngine);
    }
  }, [data?.settings.topWidgets]);

  useEffect(() => {
    const unsub = useThemeStore.subscribe((state, prev) => {
      if (state.themeConfig === prev.themeConfig) return;
      if (themeHydratingRef.current) return;
      setData((prevData) => {
        if (!prevData) return prevData;
        const themeConfig = getThemeConfigForPersist();
        if (JSON.stringify(prevData.settings.themeConfig) === JSON.stringify(themeConfig)) return prevData;
        return updateSettings(prevData, { themeConfig });
      });
    });
    return unsub;
  }, []);

  useEffect(() => {
    const config = data?.settings.themeConfig;
    if (!config) {
      themeHydratingRef.current = false;
      return;
    }
    if (JSON.stringify(config) === JSON.stringify(getThemeConfigForPersist())) {
      themeHydratingRef.current = false;
      return;
    }
    themeHydratingRef.current = true;
    useThemeStore.getState().updateThemeConfig(config);
    Promise.resolve().then(() => {
      themeHydratingRef.current = false;
    });
  }, [data?.settings.themeConfig]);

  const wallpaperType = data?.settings.wallpaper.type;
  const wallpaperValue = data?.settings.wallpaper.value;
  const animatedWallpaper = useMemo(() => {
    if (!data) return false;
    if (data.settings.wallpaper.type === 'url') return /\.gif(?:[?#]|$)/i.test(data.settings.wallpaper.value);
    if (data.settings.wallpaper.type !== 'asset') return false;
    return data.settings.uploadedBackgrounds?.some((background) =>
      typeof background !== 'string' && background.id === data.settings.wallpaper.value && background.mimeType === 'image/gif'
    ) ?? false;
  }, [data]);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    if (wallpaperType !== 'asset' || !wallpaperValue) {
      setWallpaperObjectUrl(null);
      return;
    }

    getBackgroundBlob(wallpaperValue).then((blob) => {
      if (!active) return;
      if (!blob) {
        setWallpaperObjectUrl(null);
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      setWallpaperObjectUrl(objectUrl);
    }).catch(() => {
      if (active) setWallpaperObjectUrl(null);
    });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [wallpaperType, wallpaperValue]);

  const handleEngineChange = (engine: SearchEngine) => {
    setSearchEngine(engine);
    const currentTopWidgets = data?.settings.topWidgets || [];
    const next = currentTopWidgets.map((w) =>
      w.type === 'search' ? { ...w, searchEngine: engine } : w
    );
    if (!next.some((w) => w.type === 'search')) {
      next.push({ type: 'search', searchEngine: engine });
    }
    handleSettingsChange({ topWidgets: next });
  };

  const activeBoard = useMemo(
    () => (data && activeBoardId ? getBoardById(data, activeBoardId) : undefined),
    [data, activeBoardId]
  );

  const widgets = useMemo(
    () => (data && activeBoardId ? getWidgetsForBoard(data, activeBoardId) : []),
    [data, activeBoardId]
  );

  if (!data || !activeBoard) {
    return <div className="app-loading" aria-label={t('app.loading')} />;
  }

  const editModeEnabled = data.settings.editMode !== false;

  const handleAddBoard = () => {
    setShowNewTabDialog(true);
  };

  const handleCreateBoard = (title: string) => {
    const board = createBoard(title);
    setData((prev) => {
      if (!prev) return prev;
      const next = addBoard(prev, board);
      return next;
    });
    setActiveBoardId(board.id);
    setShowNewTabDialog(false);
  };

  const handleRenameBoard = (id: string, title: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = renameBoard(prev, id, title);
      return next;
    });
  };

  const handleReorderBoard = (id: string, toIndex: number) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = reorderBoard(prev, id, toIndex);
      return next;
    });
  };

  const handleDeleteBoard = (id: string, boardTitle: string) => {
    setConfirmState({
      title: t('app.deleteBoard'),
      message: t('app.deleteBoardConfirm', { title: boardTitle }),
      danger: true,
      confirmLabel: t('app.delete'),
      onConfirm: () => {
        setData((prev) => {
          if (!prev) return prev;
          const next = deleteBoard(prev, id);
          setActiveBoardId(getInitialBoardId(next));
          return next;
        });
        setConfirmState(null);
      }
    });
  };

  const handleAddWidget = (widget: Widget) => {
    if (!activeBoardId) return;
    setData((prev) => {
      if (!prev || !activeBoardId) return prev;
      return addWidget(prev, activeBoardId, widget);
    });
    setIsAddingWidget(false);
  };

  const handleStartAddWidget = () => {
    setIsAddingWidget(true);
  };

  const handleUpdateWidget = (widget: Widget) => {
    if (!activeBoardId) return;
    setData((prev) => {
      if (!prev || !activeBoardId) return prev;
      return updateWidget(prev, activeBoardId, widget.id, widget as Partial<Widget>);
    });
    setEditingWidget(null);
  };

  const handleDeleteWidget = (widgetId: string) => {
    setConfirmState({
      title: t('app.deleteWidgetTitle'),
      message: t('app.deleteWidgetConfirm'),
      danger: true,
      confirmLabel: t('app.delete'),
      onConfirm: () => {
        if (activeBoardId) {
          setData((prev) => {
            if (!prev || !activeBoardId) return prev;
            const next = deleteWidget(prev, activeBoardId, widgetId);
            return next;
          });
        }
        setConfirmState(null);
      }
    });
  };

  const handleReorder = (nextWidgets: Widget[]) => {
    if (!activeBoardId) return;
    setData((prev) => {
      if (!prev || !activeBoardId) return prev;
      const board = getBoardById(prev, activeBoardId);
      if (!board) return prev;
      return {
        ...prev,
        workspaces: prev.workspaces.map((w) =>
          w.id === activeBoardId
            ? { ...w, widgets: nextWidgets.map((widget) => ({ ...widget, updatedAt: Date.now() })), updatedAt: Date.now() }
            : w
        )
      };
    });
  };

  const handleResizeWidget = (widgetId: string, height: number) => {
    if (!activeBoardId) return;
    setData((prev) => {
      if (!prev || !activeBoardId) return prev;
      const next = updateWidget(prev, activeBoardId, widgetId, { height });
      return next;
    });
  };

  const handleMoveLink = (
    fromWidgetId: string,
    toWidgetId: string,
    linkId: string,
    toIndex: number,
    toGroupId?: string | null,
    placement?: LinkPlacement | null
  ) => {
    if (!activeBoardId) return;
    setData((prev) => {
      if (!prev || !activeBoardId) return prev;
      const next = moveLink(prev, activeBoardId, fromWidgetId, toWidgetId, linkId, toIndex, toGroupId, placement);
      return next;
    });
  };

  const handleAddGroup = (widgetId: string) => {
    if (!activeBoardId) return;
    const group = createGroup(t('defaults.newGroup'));
    setData((prev) => {
      if (!prev || !activeBoardId) return prev;
      return addGroup(prev, activeBoardId, widgetId, group);
    });
  };

  const handleRenameGroup = (widgetId: string, groupId: string, title: string) => {
    if (!activeBoardId) return;
    setData((prev) => {
      if (!prev || !activeBoardId) return prev;
      return renameGroup(prev, activeBoardId, widgetId, groupId, title);
    });
  };

  const handleDeleteGroup = (widgetId: string, groupId: string) => {
    if (!activeBoardId) return;
    setData((prev) => {
      if (!prev || !activeBoardId) return prev;
      return deleteGroup(prev, activeBoardId, widgetId, groupId);
    });
  };

  const handleMoveGroup = (fromWidgetId: string, toWidgetId: string, groupId: string) => {
    if (!activeBoardId) return;
    setData((prev) => {
      if (!prev || !activeBoardId) return prev;
      return moveGroup(prev, activeBoardId, fromWidgetId, toWidgetId, groupId);
    });
  };

  const handleReorderGroup = (widgetId: string, groupId: string, toIndex: number) => {
    if (!activeBoardId) return;
    setData((prev) => {
      if (!prev || !activeBoardId) return prev;
      return reorderGroup(prev, activeBoardId, widgetId, groupId, toIndex);
    });
  };

  const handleExplodeGroup = (
    fromWidgetId: string,
    groupId: string,
    target: { col: number; targetId: string | null; position: 'before' | 'after' | 'into'; columnCount: number }
  ) => {
    if (!activeBoardId) return;
    setData((prev) => {
      if (!prev || !activeBoardId) return prev;
      return explodeGroupToWidget(prev, activeBoardId, fromWidgetId, groupId, target);
    });
  };

  const handleMergeWidget = (fromWidgetId: string, toWidgetId: string) => {
    if (!activeBoardId) return;
    setData((prev) => {
      if (!prev || !activeBoardId) return prev;
      return absorbWidgetAsGroup(prev, activeBoardId, fromWidgetId, toWidgetId);
    });
  };

  const handleDeleteLink = (widgetId: string, linkId: string) => {
    if (!activeBoardId) return;
    setData((prev) => {
      if (!prev || !activeBoardId) return prev;
      const next = deleteLink(prev, activeBoardId, widgetId, linkId);
      return next;
    });
  };

  const handleAddLink = (widgetId: string, title: string, url: string, icon?: string, groupId?: string) => {
    if (!activeBoardId) return;
    const link = createLink(title, url, icon, groupId);
    setData((prev) => {
      if (!prev || !activeBoardId) return prev;
      const next = addLink(prev, activeBoardId, widgetId, link);
      return next;
    });
    setAddingLinkWidget(null);
  };

  const handleEditLink = (widgetId: string, linkId: string) => {
    setEditingLink({ widgetId, linkId });
  };

  const handleUpdateLink = (widgetId: string, linkId: string, title: string, url: string, icon?: string, groupId?: string) => {
    if (!activeBoardId) return;
    setData((prev) => {
      if (!prev || !activeBoardId) return prev;
      return updateLink(prev, activeBoardId, widgetId, linkId, {
        title: title.trim() || t('defaults.newLink'),
        url,
        icon: icon || undefined,
        groupId: groupId || undefined
      });
    });
    setEditingLink(null);
  };

  const handleAddTodo = (widgetId: string, text: string) => {
    if (!activeBoardId) return;
    const todo = createTodoItem(text);
    setData((prev) => {
      if (!prev || !activeBoardId) return prev;
      const next = addTodoItem(prev, activeBoardId, widgetId, todo);
      return next;
    });
  };

  const handleToggleTodo = (widgetId: string, todoId: string) => {
    if (!activeBoardId) return;
    setData((prev) => {
      if (!prev || !activeBoardId) return prev;
      return toggleTodoItem(prev, activeBoardId, widgetId, todoId);
    });
  };

  const handleUpdateTodo = (widgetId: string, todoId: string, text: string) => {
    if (!activeBoardId) return;
    setData((prev) => {
      if (!prev || !activeBoardId) return prev;
      const next = updateTodoItem(prev, activeBoardId, widgetId, todoId, { text: text.trim() });
      return next;
    });
  };

  const handleDeleteTodo = (widgetId: string, todoId: string) => {
    if (!activeBoardId) return;
    setData((prev) => {
      if (!prev || !activeBoardId) return prev;
      const next = deleteTodoItem(prev, activeBoardId, widgetId, todoId);
      return next;
    });
  };

  const handleMoveTodo = (fromWidgetId: string, toWidgetId: string, todoId: string, toIndex: number) => {
    if (!activeBoardId) return;
    setData((prev) => {
      if (!prev || !activeBoardId) return prev;
      const next = moveTodoItem(prev, activeBoardId, fromWidgetId, toWidgetId, todoId, toIndex);
      return next;
    });
  };

  const editingLinkData = useMemo(() => {
    if (!editingLink || !data || !activeBoardId) return null;
    const widget = data.workspaces
      .find((w) => w.id === activeBoardId)
      ?.widgets.find((widget) => widget.id === editingLink.widgetId);
    if (!widget || widget.type !== 'links') return null;
    const link = widget.items.find((l) => l.id === editingLink.linkId);
    if (!link) return null;
    return {
      widgetTitle: widget.title,
      widgetId: editingLink.widgetId,
      link,
      groups: widget.groups,
      groupId: link.groupId ?? null,
    };
  }, [editingLink, data, activeBoardId]);

  const handleSettingsChange = (settings: Partial<AppData['settings']>) => {
    setData((prev) => (prev ? updateSettings(prev, settings) : prev));
  };

  const handleToggleWidget = (type: WidgetType) => {
    const currentTopWidgets = data?.settings.topWidgets || [];
    const exists = currentTopWidgets.find((w) => w.type === type);
    
    if (exists) {
      const next = currentTopWidgets.filter((w) => w.type !== type);
      handleSettingsChange({ topWidgets: next });
    } else {
      const newWidget: TopWidgetConfig = { type: type as any };
      if (type === 'weather') newWidget.city = 'New York';
      const next = [...currentTopWidgets, newWidget];
      handleSettingsChange({ topWidgets: next });
    }
  };

  const handleAddWidgetFromToolbar = (type: WidgetType) => {
    if (!activeBoardId) return;
    const widget = createWidget(type, '');
    setData((prev) => {
      if (!prev || !activeBoardId) return prev;
      return addWidget(prev, activeBoardId, widget);
    });
  };

  const handleToolbarCityChange = (city: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = (prev.settings.topWidgets || []).map((w) =>
        w.type === 'weather' ? { ...w, city } : w
      );
      return updateSettings(prev, { topWidgets: next });
    });
  };

  const handleExport = () => {
    if (data) exportData(data, themeConfig);
  };

  const handleImport = async (file: File) => {
    try {
      const imported = await importData(file);
      const nextData = imported.theme && data
        ? {
            ...imported.data,
            settings: {
              ...data.settings,
              themeConfig: imported.theme,
              topWidgets: imported.data.settings.topWidgets,
              lastBoardId: imported.data.settings.lastBoardId
            }
          }
        : imported.data;
      const migrated = migrateAppData(nextData);
      const importedWorkspaces = migrated.workspaces;
      const importedData = data
        ? { ...migrated, workspaces: mergeWorkspaces(data.workspaces, importedWorkspaces) }
        : { ...migrated, workspaces: importedWorkspaces };
      setData(importedData);
      saveData(importedData);
      setActiveBoardId(getInitialBoardId(importedData));
    } catch (err) {
      alert(err instanceof Error ? err.message : t('app.importError'));
    }
  };

  const handleOpenBookmarkImporter = async () => {
    try {
      const tree = await browser.bookmarks.getTree();
      const folders = getBookmarkFolders(tree, t('bookmarks.untitledFolder'));
      if (folders.length === 0) {
        alert(t('bookmarks.noFolders'));
        return;
      }
      setBookmarkFolders(folders);
      setShowBookmarkFolders(true);
    } catch {
      alert(t('bookmarks.loadError'));
    }
  };

  const handleImportBookmarkFolder = async (folder: BookmarkFolder) => {
    if (!activeBoardId) return;

    try {
      const bookmarks = await browser.bookmarks.getChildren(folder.id);
      const items = bookmarks.flatMap((bookmark) =>
        bookmark.url ? [createLink(bookmark.title, bookmark.url)] : []
      );
      if (items.length === 0) {
        alert(t('bookmarks.noLinks'));
        return;
      }

      const widget = { ...createWidget('links', folder.title), items };
      setData((prev) => {
        if (!prev || !activeBoardId) return prev;
        return addWidget(prev, activeBoardId, widget);
      });
      setShowBookmarkFolders(false);
    } catch {
      alert(t('bookmarks.importError'));
    }
  };

  const linkSuggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    return widgets
      .filter((widget) => widget.type === 'links')
      .flatMap((widget) => widget.items)
      .filter((link) => link.title.toLowerCase().includes(query) || link.url.toLowerCase().includes(query))
      .slice(0, 3);
  }, [widgets, searchQuery]);

  const handleRemoveRecentSearch = (query: string) => {
    setData((prev) => (prev ? removeRecentSearch(prev, query) : prev));
  };

  const handleClearRecentSearches = () => {
    setConfirmState({
      title: t('app.clearHistoryTitle'),
      message: t('app.clearHistoryConfirm'),
      danger: true,
      confirmLabel: t('app.clear'),
      onConfirm: () => {
        setData((prev) => (prev ? clearRecentSearches(prev) : prev));
        setConfirmState(null);
      }
    });
  };

  const handleSearch = (query: string) => {
    const q = query.trim();
    if (!q) return;
    if (looksLikeUrl(q)) {
      void openUrl(ensureProtocol(q), data.settings.openInNewTab !== false).catch(() => undefined);
    } else {
      const engineUrl = SEARCH_ENGINES.find((e) => e.id === searchEngine)?.url || SEARCH_ENGINES[0].url;
      void openUrl(`${engineUrl}${encodeURIComponent(q)}`, data.settings.openInNewTab !== false).catch(() => undefined);
    }
    setData((prev) => (prev ? addRecentSearch(prev, q) : prev));
  };

  return (
    <div
      className={`app${animatedWallpaper ? ' app--animated-wallpaper' : ''}`}
      style={{
        background:
          data.settings.wallpaper.type === 'asset'
            ? (wallpaperObjectUrl
              ? `url("${wallpaperObjectUrl}") center/cover no-repeat`
              : 'var(--bg-body)')
            : data.settings.wallpaper.type === 'url'
            ? `url(${data.settings.wallpaper.value}) center/cover no-repeat`
            : data.settings.wallpaper.value
      }}
    >
      {storageFailure && (
        <div className="app-storage-warning" role="alert">
          <span>{t('app.storageFailure')}</span>
          <button
            className="app-storage-warning__dismiss"
            onClick={() => setStorageFailure(false)}
            aria-label={t('app.dismiss')}
          >
            x
          </button>
        </div>
      )}

      <header className="app-header">
        <BoardTabs
          boards={getBoards(data)}
          activeId={activeBoardId}
          onSelect={setActiveBoardId}
          onAdd={handleAddBoard}
          onRename={handleRenameBoard}
          onDelete={(id, title) => handleDeleteBoard(id, title)}
          onReorder={handleReorderBoard}
        />

        {data.settings.topWidgets?.some((w) => w.type === 'search') && (
          <SearchBar
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            searchEngine={searchEngine}
            onEngineChange={handleEngineChange}
            onSearch={handleSearch}
            onOpenLink={(url) => {
              void openUrl(ensureProtocol(url), data.settings.openInNewTab !== false).catch(() => undefined);
            }}
            recentSearches={data.settings.recentSearches || []}
            linkSuggestions={linkSuggestions}
            onRemoveRecentSearch={handleRemoveRecentSearch}
          />
        )}

        <TopInfoWidgets
          configs={data.settings.topWidgets?.filter((w) => w.type !== 'search') || []}
        />

      </header>

      <div className="app-fab-bar">
        <button
          className={`app-fab-bar__btn app-fab-bar__btn--menu ${menuOpen ? 'app-fab-bar__btn--active' : ''}`}
          onClick={() => {
            if (!menuOpen) notifyMenuOpened();
            setMenuOpen((s) => !s);
          }}
          aria-label={menuOpen ? t('app.closeMenu') : t('app.openMenu')}
          title={menuOpen ? t('app.closeMenu') : t('app.menu')}
        >
          <Menu size={22} strokeWidth={2} />
        </button>

        <div className={`app-fab-menu ${menuOpen ? 'app-fab-menu--open' : ''}`}>
          <button
            className="app-fab-menu__item"
            onClick={() => { setShowWidgetToolbar(true); setMenuOpen(false); }}
            aria-label={t('app.addWidgets')}
            title={t('app.addWidgets')}
          >
            <Plus size={20} strokeWidth={2} />
          </button>
          <button
            className="app-fab-menu__item"
            onClick={() => { setShowBackground(true); setMenuOpen(false); }}
            aria-label={t('app.customizeAppearance')}
            title={t('app.customizeAppearance')}
          >
            <Palette size={20} strokeWidth={2} />
          </button>
          <button
            className="app-fab-menu__item"
            onClick={() => { setShowSettings(true); setMenuOpen(false); }}
            aria-label={t('app.settings')}
            title={t('app.settings')}
          >
            <Settings size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>

      <main className="app-content">
        {!searchQuery.trim() && (
          <WidgetGrid
            widgets={widgets}
            openInNewTab={data.settings.openInNewTab !== false}
            onOpenLink={(url) => void openUrl(ensureProtocol(url), data.settings.openInNewTab !== false).catch(() => undefined)}
            onReorder={handleReorder}
            onEditWidget={setEditingWidget}
            onDeleteWidget={handleDeleteWidget}
            onDeleteLink={handleDeleteLink}
            onEditLink={handleEditLink}
            onAddLink={setAddingLinkWidget}
            onAddGroup={(widget) => handleAddGroup(widget.id)}
            onResizeWidget={handleResizeWidget}
            onAddWidget={handleStartAddWidget}
            onMoveLink={handleMoveLink}
            onMoveGroup={handleMoveGroup}
            onRenameGroup={handleRenameGroup}
            onDeleteGroup={handleDeleteGroup}
            onReorderGroup={handleReorderGroup}
            onExplodeGroup={handleExplodeGroup}
            onMergeWidget={handleMergeWidget}
            onAddTodo={handleAddTodo}
            onToggleTodo={handleToggleTodo}
            onUpdateTodo={handleUpdateTodo}
            onDeleteTodo={handleDeleteTodo}
            onMoveTodo={handleMoveTodo}
            isEditing={editModeEnabled && !searchQuery.trim()}
          />
        )}
      </main>

      {isAddingWidget && (
        <WidgetEditor
          linksOnly
          onSave={handleAddWidget}
          onClose={() => setIsAddingWidget(false)}
        />
      )}

      {editingWidget && (
        <WidgetEditor
          widget={editingWidget}
          onSave={handleUpdateWidget}
          onClose={() => setEditingWidget(null)}
        />
      )}

      {addingLinkWidget && addingLinkWidget.type === 'links' && (
        <LinkDialog
          widgetTitle={addingLinkWidget.title}
          groups={addingLinkWidget.groups}
          onSave={(title, url, icon, groupId) => handleAddLink(addingLinkWidget.id, title, url, icon, groupId)}
          onClose={() => setAddingLinkWidget(null)}
        />
      )}

      {editingLinkData && (
        <LinkDialog
          widgetTitle={editingLinkData.widgetTitle}
          link={editingLinkData.link}
          groups={editingLinkData.groups}
          groupId={editingLinkData.groupId}
          onSave={(title, url, icon, groupId) => handleUpdateLink(editingLinkData.widgetId, editingLinkData.link.id, title, url, icon, groupId)}
          onClose={() => setEditingLink(null)}
        />
      )}

      <ModalDialog
        open={showBackground}
        onClose={() => setShowBackground(false)}
        title={t('background.title')}
        wide
      >
        <BackgroundPanel
          settings={data.settings}
          onChange={handleSettingsChange}
        />
      </ModalDialog>

      <ModalDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        title={t('settings.title')}
      >
        <SettingsPanel
          settings={data.settings}
          onChange={handleSettingsChange}
          onExport={handleExport}
          onImport={handleImport}
          onImportBookmarks={handleOpenBookmarkImporter}
          onClearRecentSearches={handleClearRecentSearches}
        />
      </ModalDialog>

      <ModalDialog
        open={showBookmarkFolders}
        onClose={() => setShowBookmarkFolders(false)}
        title={t('bookmarks.title')}
      >
        <BookmarkFolderPicker
          folders={bookmarkFolders}
          onImport={handleImportBookmarkFolder}
          onClose={() => setShowBookmarkFolders(false)}
        />
      </ModalDialog>

      <ModalDialog
        open={showWidgetToolbar}
        onClose={() => setShowWidgetToolbar(false)}
        title={t('app.addWidgets')}
      >
        <WidgetToolbar
          topWidgets={data.settings.topWidgets || []}
          onToggleWidget={handleToggleWidget}
          onAddWidget={handleAddWidgetFromToolbar}
          onCityChange={handleToolbarCityChange}
        />
      </ModalDialog>

      <NewTabDialog
        open={showNewTabDialog}
        onSave={handleCreateBoard}
        onClose={() => setShowNewTabDialog(false)}
      />

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title || ''}
        message={confirmState?.message || ''}
        danger={confirmState?.danger}
        confirmLabel={confirmState?.confirmLabel}
        onConfirm={confirmState?.onConfirm || (() => {})}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
