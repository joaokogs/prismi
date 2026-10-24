import { useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { AppSettings } from '@shared/types';
import { Trash2, Download, Upload, Bookmark } from 'lucide-preact';
import { useI18n, type Locale } from '@shared/i18n';
import {
  uiButtonDangerClass,
  uiButtonSecondaryClass,
  uiSelectClass,
  uiSwitchInputClass,
  uiSwitchLabelClass,
  uiSwitchTrackClass
} from '@shared/ui/classes';

interface SettingsPanelProps {
  settings: AppSettings;
  onChange: (settings: Partial<AppSettings>) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onImportBookmarks: () => void;
  onClearRecentSearches?: () => void;
}

interface SettingRowProps {
  title: string;
  description?: string;
  htmlFor?: string;
  children: ComponentChildren;
}

const rowClass = 'flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6';
const rowTitleClass = 'block text-sm font-semibold leading-5 tracking-[-0.01em] text-panel-text';
const rowDescriptionClass = 'mt-0.5 text-xs leading-4 text-panel-text-secondary';
const rowControlsClass = 'flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end';
const secondaryButtonClass = `${uiButtonSecondaryClass} text-xs`;
const dangerButtonClass = `${uiButtonDangerClass} text-xs`;

function SettingRow({ title, description, htmlFor, children }: SettingRowProps) {
  return (
    <div className={rowClass}>
      <div className="min-w-0">
        {htmlFor ? (
          <label className={rowTitleClass} htmlFor={htmlFor}>{title}</label>
        ) : (
          <span className={rowTitleClass}>{title}</span>
        )}
        {description && <p className={rowDescriptionClass}>{description}</p>}
      </div>
      <div className={rowControlsClass}>{children}</div>
    </div>
  );
}

export function SettingsPanel({ settings, onChange, onExport, onImport, onImportBookmarks, onClearRecentSearches }: SettingsPanelProps) {
  const { t, locale, setLocale } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasRecentSearches = Boolean(settings.recentSearches && settings.recentSearches.length > 0);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-1 sm:px-6 sm:py-2">
      <div className="divide-y divide-panel-border-subtle">
        <SettingRow
          title={t('settings.language')}
          description={t('settings.languageDesc')}
          htmlFor="settings-language"
        >
          <select
            className={`${uiSelectClass} font-medium sm:w-44`}
            id="settings-language"
            value={locale}
            onChange={(e) => {
              const newLocale = (e.target as HTMLSelectElement).value as Locale;
              setLocale(newLocale);
              onChange({ locale: newLocale });
            }}
          >
            <option value="en">{t('lang.en')}</option>
            <option value="pt-BR">{t('lang.pt-BR')}</option>
          </select>
        </SettingRow>

        <SettingRow
          title={t('settings.editMode')}
          description={t('settings.editModeDesc')}
          htmlFor="settings-edit-mode"
        >
          <label className={uiSwitchLabelClass}>
            <input
              className={uiSwitchInputClass}
              id="settings-edit-mode"
              type="checkbox"
              checked={settings.editMode !== false}
              onChange={() => onChange({ editMode: settings.editMode === false ? true : false })}
            />
            <span className={uiSwitchTrackClass} />
          </label>
        </SettingRow>

        <SettingRow
          title={t('settings.openInNewTab')}
          description={t('settings.openInNewTabDesc')}
          htmlFor="settings-open-in-new-tab"
        >
          <label className={uiSwitchLabelClass}>
            <input
              className={uiSwitchInputClass}
              id="settings-open-in-new-tab"
              type="checkbox"
              checked={settings.openInNewTab !== false}
              onChange={() => onChange({ openInNewTab: settings.openInNewTab === false ? true : false })}
            />
            <span className={uiSwitchTrackClass} />
          </label>
        </SettingRow>

        <SettingRow title={t('settings.searchHistory')}>
          <button
            className={`${dangerButtonClass} w-full sm:w-auto`}
            onClick={() => onClearRecentSearches?.()}
            disabled={!hasRecentSearches}
          >
            <Trash2 size={14} strokeWidth={2} aria-hidden="true" /> {t('settings.clearHistory')}
          </button>
        </SettingRow>

        <SettingRow title={t('settings.bookmarks')}>
          <button className={`${secondaryButtonClass} w-full gap-1.5 sm:w-auto`} onClick={onImportBookmarks}>
            <Bookmark size={14} strokeWidth={2} aria-hidden="true" /> {t('settings.importBookmarks')}
          </button>
        </SettingRow>

        <SettingRow title={t('settings.backup')}>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <button className={`${secondaryButtonClass} w-full sm:w-auto`} onClick={onExport}>
              <Download size={14} strokeWidth={2} aria-hidden="true" /> {t('settings.exportJson')}
            </button>
            <button className={`${secondaryButtonClass} w-full sm:w-auto`} onClick={() => fileInputRef.current?.click()}>
              <Upload size={14} strokeWidth={2} aria-hidden="true" /> {t('settings.importJson')}
            </button>
          </div>
        </SettingRow>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) onImport(file);
          (e.target as HTMLInputElement).value = '';
        }}
      />
    </div>
  );
}
