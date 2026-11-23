import { useState, useEffect } from 'preact/hooks';
import type { Widget, WidgetType } from '@shared/types';
import { createWidget } from '@shared/storage/widgets';
import { X, ExternalLink, LayoutGrid, Clock, CloudSun, CheckSquare, Grid2x2, List } from 'lucide-preact';
import type { LucideIcon } from 'lucide-preact';
import { CityAutocomplete } from '../ui/CityAutocomplete';
import { useI18n } from '@shared/i18n';
import { uiButtonPrimaryClass, uiButtonSecondaryClass, uiFieldClass, uiIconButtonClass, uiInputClass, uiLabelClass, uiSelectClass } from '@shared/ui/classes';

interface WidgetEditorProps {
  widget?: Widget | null;
  linksOnly?: boolean;
  /** Opacidade padrão (do tema), usada quando o widget herda a opacidade. */
  defaultOpacity?: number;
  onSave: (widget: Widget) => void;
  onClose: () => void;
}

export function WidgetEditor({ widget, linksOnly = false, defaultOpacity = 0.72, onSave, onClose }: WidgetEditorProps) {
  const { t } = useI18n();
  const isEdit = !!widget;

  const WIDGET_TYPES: { type: WidgetType; label: string; icon: LucideIcon }[] = [
    { type: 'links', label: t('widgetEditor.links'), icon: ExternalLink },
    { type: 'calendar', label: t('widgetEditor.calendar'), icon: LayoutGrid },
    { type: 'clock', label: t('widgetEditor.clock'), icon: Clock },
    { type: 'weather', label: t('widgetEditor.weather'), icon: CloudSun },
    { type: 'todo', label: t('widgetEditor.todo'), icon: CheckSquare }
  ];

  const [type, setType] = useState<WidgetType>(widget?.type || 'links');
  const [title, setTitle] = useState(widget?.title || '');
  const [height, setHeight] = useState<number | ''>(widget?.height ?? '');
  const [city, setCity] = useState((widget?.type === 'weather' && widget.city) || '');
  const [timezone, setTimezone] = useState((widget?.type === 'clock' && widget.timezone) || '');
  const [label, setLabel] = useState((widget?.type === 'clock' && widget.label) || '');
  const [linksDisplay, setLinksDisplay] = useState<'list' | 'icons'>(
    (widget?.type === 'links' && widget.display) || 'list'
  );
  const [iconColumns, setIconColumns] = useState<number>(
    (widget?.type === 'links' && widget.iconColumns) || 3
  );
  const [iconSize, setIconSize] = useState<number>(
    (widget?.type === 'links' && widget.iconSize) || 28
  );
  const [opacity, setOpacity] = useState<number>(
    Math.round((widget?.opacity ?? defaultOpacity) * 100)
  );
  const [opacityCustom, setOpacityCustom] = useState(widget?.opacity !== undefined);
  const [borderWidth, setBorderWidth] = useState<number>(widget?.borderWidth ?? 1);
  const [borderColor, setBorderColor] = useState<string>(widget?.borderColor ?? '#ffffff');
  const [borderColorCustom, setBorderColorCustom] = useState(widget?.borderColor !== undefined);
  const [hideTitle, setHideTitle] = useState<boolean>(!!widget?.hideTitle);
  const [shadowEnabled, setShadowEnabled] = useState<boolean>(widget?.shadow !== false);

  useEffect(() => {
    if (type !== 'weather') return;
    let cancelled = false;
    (async () => {
      if (!navigator.geolocation) return;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 8000,
            maximumAge: 600000
          });
        });
        if (cancelled) return;
        const detected = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        if (!cancelled && detected) setCity(detected);
      } catch {
        // geolocation falhou, mantém cidade salva ou padrão
      }
    })();
    return () => { cancelled = true; };
  }, [type]);

  const handleSave = () => {
    const base: Widget = widget ?? createWidget(type, title);
    const updated: Widget = {
      ...base,
      title: title.trim() || base.title,
      height: height !== '' ? Math.max(Number(height), 40) : undefined,
      opacity: opacityCustom ? opacity / 100 : undefined,
      borderWidth,
      borderColor: borderColorCustom ? borderColor : undefined,
      shadow: shadowEnabled ? undefined : false,
      hideTitle: hideTitle || undefined
    } as Widget;

    if (updated.type === 'weather') {
      (updated as typeof updated & { city: string }).city = city.trim() || 'New York';
    }
    if (updated.type === 'clock') {
      (updated as typeof updated & { timezone?: string; label?: string }).timezone = timezone.trim() || undefined;
      (updated as typeof updated & { timezone?: string; label?: string }).label = label.trim() || undefined;
    }
    if (updated.type === 'links') {
      updated.display = linksDisplay;
      updated.iconColumns = linksDisplay === 'icons' ? iconColumns : undefined;
      updated.iconSize = linksDisplay === 'icons' ? iconSize : undefined;
    }
    onSave(updated);
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true">
      <div className="modal modal--wide">
        <div className="modal__header">
          <h2>{isEdit ? t('widgetEditor.editWidget') : linksOnly ? t('widgetEditor.newLinksWidget') : t('widgetEditor.newWidget')}</h2>
          <button className={uiIconButtonClass} onClick={onClose} aria-label={t('widgetEditor.close')}>
            <X size={18} />
          </button>
        </div>

        <div className="widget-editor">
          {!isEdit && !linksOnly && (
            <div className="widget-editor__section">
              <label className="widget-editor__label">{t('widgetEditor.type')}</label>
              <div className="widget-editor__types">
                {WIDGET_TYPES.map((t) => (
                  <button
                    key={t.type}
                    type="button"
                     className={`widget-editor__type ${type === t.type ? 'widget-editor__type--active' : ''}`}
                    onClick={() => setType(t.type)}
                  >
                    <t.icon size={18} strokeWidth={2} />
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="widget-editor__row">
            {(linksOnly || (isEdit && (type === 'links' || type === 'todo'))) && (
              <label className={`${uiFieldClass} widget-editor__field`}>
                <span className={uiLabelClass}>{t('widgetEditor.title')}</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle((e.target as HTMLInputElement).value)}
                  className={uiInputClass}
                  placeholder={t('widgetEditor.titlePlaceholder')}
                />
              </label>
            )}
            {isEdit && (widget?.type === 'links' || widget?.type === 'todo') && (
              <label className={`${uiFieldClass} widget-editor__field widget-editor__field--small`}>
                <span className={uiLabelClass}>{t('widgetEditor.height')}</span>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => {
                    const val = (e.target as HTMLInputElement).value;
                    setHeight(val === '' ? '' : Number(val));
                  }}
                  className={uiInputClass}
                  placeholder={t('widgetEditor.auto')}
                  min={40}
                />
              </label>
            )}
          </div>

          {type === 'links' && (
            <label className="widget-editor__check widget-editor__section widget-editor__section--compact">
              <input
                type="checkbox"
                checked={hideTitle}
                onChange={(e) => setHideTitle((e.target as HTMLInputElement).checked)}
              />
              <span>{t('widgetEditor.hideTitle')}</span>
            </label>
          )}

          <div className="widget-editor__section">
            <label className="widget-editor__label">{t('widgetEditor.opacity')}</label>
            <div className="widget-editor__slider">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={opacity}
                aria-label={t('widgetEditor.opacity')}
                onChange={(e) => {
                  setOpacityCustom(true);
                  setOpacity(Number((e.target as HTMLInputElement).value));
                }}
              />
              <span className="widget-editor__slider-value">{opacity}%</span>
            </div>
            {opacityCustom && (
              <button
                type="button"
                className="widget-editor__inherit"
                onClick={() => {
                  setOpacityCustom(false);
                  setOpacity(Math.round(defaultOpacity * 100));
                }}
              >
                {t('widgetEditor.opacityInherit')}
              </button>
            )}
          </div>

          <div className="widget-editor__section">
            <label className="widget-editor__label">{t('widgetEditor.borders')}</label>
            <label className={uiFieldClass}>
              <span className={uiLabelClass}>{t('widgetEditor.borderWidth')}</span>
              <div className="widget-editor__slider">
                <input
                  type="range"
                  min={0}
                  max={8}
                  step={1}
                  value={borderWidth}
                  aria-label={t('widgetEditor.borderWidth')}
                  onChange={(e) => setBorderWidth(Number((e.target as HTMLInputElement).value))}
                />
                <span className="widget-editor__slider-value">{borderWidth}px</span>
              </div>
            </label>
            <label className={`${uiFieldClass} widget-editor__border-color`}>
              <span className={uiLabelClass}>{t('widgetEditor.borderColor')}</span>
              <div className="widget-editor__color-row">
                <input
                  type="color"
                  value={borderColor}
                  aria-label={t('widgetEditor.borderColor')}
                  onChange={(e) => {
                    setBorderColorCustom(true);
                    setBorderColor((e.target as HTMLInputElement).value);
                  }}
                />
                <input
                  type="text"
                  value={borderColor}
                  onChange={(e) => {
                    const value = (e.target as HTMLInputElement).value;
                    setBorderColor(value);
                    if (/^#[0-9a-fA-F]{6}$/.test(value)) setBorderColorCustom(true);
                  }}
                  className={`${uiInputClass} widget-editor__color-hex`}
                  placeholder="#ffffff"
                />
                {borderColorCustom ? (
                  <button
                    type="button"
                    className="widget-editor__inherit"
                    onClick={() => setBorderColorCustom(false)}
                  >
                    {t('widgetEditor.borderColorTheme')}
                  </button>
                ) : (
                  <span className="widget-editor__border-hint">{t('widgetEditor.borderColorTheme')}</span>
                )}
              </div>
            </label>
            <label className="widget-editor__check widget-editor__shadow-check">
              <input
                type="checkbox"
                checked={shadowEnabled}
                onChange={(e) => setShadowEnabled((e.target as HTMLInputElement).checked)}
              />
              <span>{t('widgetEditor.shadow')}</span>
            </label>
          </div>

          {type === 'links' && (
            <div className="widget-editor__section">
              <label className="widget-editor__label">{t('widgetEditor.layout')}</label>
              <div className="widget-editor__types widget-editor__types--compact">
                <button
                  type="button"
                  className={`widget-editor__type widget-editor__type--layout ${linksDisplay === 'list' ? 'widget-editor__type--active' : ''}`}
                  onClick={() => setLinksDisplay('list')}
                >
                  <List size={18} strokeWidth={2} />
                  <span>{t('widgetEditor.layoutList')}</span>
                </button>
                <button
                  type="button"
                  className={`widget-editor__type widget-editor__type--layout ${linksDisplay === 'icons' ? 'widget-editor__type--active' : ''}`}
                  onClick={() => setLinksDisplay('icons')}
                >
                  <Grid2x2 size={18} strokeWidth={2} />
                  <span>{t('widgetEditor.layoutIcons')}</span>
                </button>
              </div>
              {linksDisplay === 'icons' && (
                <>
                  <label className={`${uiFieldClass} widget-editor__field widget-editor__field--small widget-editor__icon-columns`}>
                    <span className={uiLabelClass}>{t('widgetEditor.iconColumns')}</span>
                    <select
                      value={iconColumns}
                      onChange={(e) => setIconColumns(Number((e.target as HTMLSelectElement).value))}
                      className={uiSelectClass}
                    >
                      {[2, 3, 4, 5, 6].map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label className={`${uiFieldClass} widget-editor__field widget-editor__icon-columns`}>
                    <span className={uiLabelClass}>{t('widgetEditor.iconSize')}</span>
                    <div className="widget-editor__slider">
                      <input
                        type="range"
                        min={16}
                        max={56}
                        step={2}
                        value={iconSize}
                        onChange={(e) => setIconSize(Number((e.target as HTMLInputElement).value))}
                      />
                      <span className="widget-editor__slider-value">{iconSize}px</span>
                    </div>
                  </label>
                </>
              )}
            </div>
          )}

          {type === 'weather' && (
            <label className={`${uiFieldClass} widget-editor__field`}>
              <span className={uiLabelClass}>{t('widgetEditor.city')}</span>
              <CityAutocomplete
                value={city}
                onChange={setCity}
                placeholder={t('widgetEditor.cityPlaceholder')}
                id="widget-editor-city"
              />
            </label>
          )}

          {type === 'clock' && (
            <div className="widget-editor__row">
                <label className={`${uiFieldClass} widget-editor__field`}>
                  <span className={uiLabelClass}>{t('widgetEditor.timezone')}</span>
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone((e.target as HTMLInputElement).value)}
                  className={uiInputClass}
                  placeholder={t('widgetEditor.timezonePlaceholder')}
                />
              </label>
                <label className={`${uiFieldClass} widget-editor__field`}>
                  <span className={uiLabelClass}>{t('widgetEditor.label')}</span>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel((e.target as HTMLInputElement).value)}
                  className={uiInputClass}
                  placeholder={t('widgetEditor.labelPlaceholder')}
                />
              </label>
            </div>
          )}

        </div>

        <div className="modal__actions">
          <button type="button" className={uiButtonSecondaryClass} onClick={onClose}>
            {t('widgetEditor.cancel')}
          </button>
          <button type="button" className={uiButtonPrimaryClass} onClick={handleSave}>
            {t('widgetEditor.saveWidget')}
          </button>
        </div>
      </div>
    </div>
  );
}

async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=pt`
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.city || data.locality || data.principalSubdivision || null;
  } catch {
    return null;
  }
}
