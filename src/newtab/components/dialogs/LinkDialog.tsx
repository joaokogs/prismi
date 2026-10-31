import { useState } from 'preact/hooks';
import { useI18n } from '@shared/i18n';
import type { LinkGroup, LinkItem } from '@shared/types';
import { normalizeUrl } from '@shared/utils/url';
import { X } from 'lucide-preact';
import { IconPicker } from '../ui/IconPicker';
import { uiButtonPrimaryClass, uiButtonSecondaryClass, uiFieldClass, uiIconButtonClass, uiInputClass, uiLabelClass, uiSelectClass } from '@shared/ui/classes';

interface LinkDialogProps {
  widgetTitle?: string;
  link?: LinkItem | null;
  groups?: LinkGroup[];
  groupId?: string | null;
  onSave: (title: string, url: string, icon?: string, groupId?: string) => void;
  onClose: () => void;
}

export function LinkDialog({ widgetTitle, link, groups, groupId, onSave, onClose }: LinkDialogProps) {
  const { t } = useI18n();
  const isEdit = !!link;
  const [title, setTitle] = useState(link?.title || '');
  const [url, setUrl] = useState(link?.url || '');
  const [icon, setIcon] = useState<string | null>(link?.icon || null);
  const [group, setGroup] = useState(() => {
    const initial = groupId ?? link?.groupId ?? '';
    return groups?.some((entry) => entry.id === initial) ? initial : '';
  });
  const sortedGroups = groups
    ? groups
        .map((entry, index) => ({ entry, index }))
        .sort((a, b) => (a.entry.order ?? a.index) - (b.entry.order ?? b.index))
        .map(({ entry }) => entry)
    : undefined;

  const handleSave = () => {
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    onSave(
      title.trim() || t('defaults.newLink'),
      normalized,
      icon || undefined,
      groups ? (group || undefined) : link?.groupId
    );
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal">
        <div className="modal__header">
          <h2>
            {isEdit ? t('linkDialog.editLink') : t('linkDialog.newLink')}
            {widgetTitle ? <span className="modal__subtitle"> {t('linkDialog.in', { widget: widgetTitle })}</span> : null}
          </h2>
          <button className={uiIconButtonClass} onClick={onClose} aria-label={t('linkDialog.close')}>
            <X size={18} />
          </button>
        </div>

        <div className="dialog__body">
          <label className={uiFieldClass}>
            <span className={uiLabelClass}>{t('linkDialog.iconOptional')}</span>
            <div className="link-dialog__icon-row">
              <IconPicker selected={icon} onSelect={setIcon} />
              {icon && (
                <button
                  type="button"
                  className="link-dialog__icon-clear"
                  onClick={() => setIcon(null)}
                  aria-label={t('linkDialog.removeIcon')}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </label>

          <label className={uiFieldClass}>
            <span className={uiLabelClass}>{t('linkDialog.title')}</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle((e.target as HTMLInputElement).value)}
              className={uiInputClass}
              placeholder={t('linkDialog.titlePlaceholder')}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </label>

          <label className={uiFieldClass}>
            <span className={uiLabelClass}>{t('linkDialog.url')}</span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl((e.target as HTMLInputElement).value)}
              className={uiInputClass}
              placeholder={t('linkDialog.urlPlaceholder')}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </label>

          {sortedGroups && sortedGroups.length > 0 && (
            <label className={uiFieldClass}>
              <span className={uiLabelClass}>{t('linkDialog.group')}</span>
              <select
                className={uiSelectClass}
                value={group}
                onChange={(e) => setGroup((e.target as HTMLSelectElement).value)}
              >
                <option value="">{t('linkDialog.noGroup')}</option>
                {sortedGroups.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.title || t('defaults.newGroup')}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="modal__actions">
          <button type="button" className={uiButtonSecondaryClass} onClick={onClose}>
            {t('linkDialog.cancel')}
          </button>
          <button
            type="button"
            className={uiButtonPrimaryClass}
            onClick={handleSave}
            disabled={!url.trim()}
          >
            {isEdit ? t('linkDialog.save') : t('linkDialog.add')}
          </button>
        </div>
      </div>
    </div>
  );
}
