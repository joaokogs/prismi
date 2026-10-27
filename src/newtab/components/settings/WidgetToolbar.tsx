import { useState, useEffect } from 'preact/hooks';
import { CalendarDays, Clock3, Cloud, Search, CheckSquare, Plus, type LucideIcon } from 'lucide-preact';
import type { WidgetType, TopWidgetConfig } from '@shared/types';
import { CityAutocomplete } from '../ui/CityAutocomplete';
import { useI18n } from '@shared/i18n';
import {
  uiButtonSecondaryClass,
  uiButtonSecondarySmallClass,
  uiSwitchInputClass,
  uiSwitchLabelClass,
  uiSwitchTrackClass
} from '@shared/ui/classes';

interface WidgetOption {
  type: WidgetType | 'search';
  label: string;
  icon: LucideIcon;
}

interface WidgetToolbarProps {
  topWidgets: TopWidgetConfig[];
  onToggleWidget: (type: WidgetType) => void;
  onAddWidget: (type: WidgetType) => void;
  onCityChange: (city: string) => void;
}

const rowClass = 'flex items-center justify-between gap-4 py-3';
const rowInfoClass = 'flex min-w-0 items-center gap-3 text-sm font-medium text-panel-text';
const sectionTitleClass = 'mb-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-panel-text-muted';

export function WidgetToolbar({
  topWidgets,
  onToggleWidget,
  onAddWidget,
  onCityChange
}: WidgetToolbarProps) {
  const { t } = useI18n();

  const BLOCK_WIDGETS: WidgetOption[] = [
    { type: 'calendar', label: t('widgetToolbar.calendar'), icon: CalendarDays },
    { type: 'clock', label: t('widgetToolbar.clock'), icon: Clock3 },
    { type: 'weather', label: t('widgetToolbar.weather'), icon: Cloud },
    { type: 'todo', label: t('widgetToolbar.todo'), icon: CheckSquare },
  ];

  const HEADER_WIDGETS: WidgetOption[] = [
    { type: 'clock', label: t('widgetToolbar.clock'), icon: Clock3 },
    { type: 'search', label: t('widgetToolbar.search'), icon: Search },
    { type: 'weather', label: t('widgetToolbar.weather'), icon: Cloud }
  ];

  const [cityInput, setCityInput] = useState('');

  useEffect(() => {
    const weatherWidget = topWidgets.find((w) => w.type === 'weather');
    if (weatherWidget?.city) {
      setCityInput(weatherWidget.city);
    }
  }, [topWidgets]);

  const isWidgetActive = (type: WidgetType) => {
    return topWidgets.some((w) => w.type === type);
  };

  const handleApplyCity = () => {
    if (cityInput.trim()) {
      onCityChange(cityInput.trim());
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-2 sm:px-6 sm:pb-6">
      <section>
        <h3 className={sectionTitleClass}>{t('widgetToolbar.blocks')}</h3>
        <div className="divide-y divide-panel-border-subtle">
          {BLOCK_WIDGETS.map((option) => {
            const WidgetIcon = option.icon;

            return (
              <div key={option.type} className={rowClass}>
                <div className={rowInfoClass}>
                  <WidgetIcon size={16} strokeWidth={2} className="shrink-0 text-panel-text-muted" aria-hidden="true" />
                  <span className="truncate">{option.label}</span>
                </div>
                <button
                  type="button"
                  className={`${uiButtonSecondarySmallClass} shrink-0`}
                  onClick={() => onAddWidget(option.type as WidgetType)}
                >
                  <Plus size={14} strokeWidth={2} aria-hidden="true" />
                  {t('widgetToolbar.add')}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-4 border-t border-panel-border-subtle pt-4">
        <h3 className={sectionTitleClass}>{t('widgetToolbar.header')}</h3>
        <div className="divide-y divide-panel-border-subtle">
          {HEADER_WIDGETS.map((option) => {
            const WidgetIcon = option.icon;

            return (
              <div key={option.type} className={rowClass}>
                <div className={rowInfoClass}>
                  <WidgetIcon size={16} strokeWidth={2} className="shrink-0 text-panel-text-muted" aria-hidden="true" />
                  <span className="truncate">{option.label}</span>
                </div>
                <label className={uiSwitchLabelClass}>
                  <input
                    className={uiSwitchInputClass}
                    type="checkbox"
                    aria-label={option.label}
                    checked={isWidgetActive(option.type as WidgetType)}
                    onChange={() => onToggleWidget(option.type as WidgetType)}
                  />
                  <span className={uiSwitchTrackClass} />
                </label>
              </div>
            );
          })}
        </div>

        {isWidgetActive('weather') && (
          <div className="mt-3 rounded-md bg-panel-surface-muted p-3">
            <label
              className="mb-1.5 block text-xs font-semibold text-panel-text-secondary"
              htmlFor="widget-toolbar-city"
            >
              {t('widgetToolbar.city')}
            </label>
            <div className="flex items-center gap-2">
              <CityAutocomplete
                className="flex-1"
                value={cityInput}
                onChange={setCityInput}
                placeholder={t('widgetToolbar.city')}
                id="widget-toolbar-city"
              />
              <button
                type="button"
                className={`${uiButtonSecondaryClass} shrink-0 text-xs`}
                onClick={handleApplyCity}
              >
                {t('widgetToolbar.apply')}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
