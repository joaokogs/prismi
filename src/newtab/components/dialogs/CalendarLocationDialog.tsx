import { useEffect, useState } from 'preact/hooks';
import { LocateFixed, MapPin } from 'lucide-preact';
import type { CalendarLocation } from '@shared/types';
import {
  CalendarLocationError,
  detectCalendarLocation,
  findMunicipality,
  getMunicipalities,
  getStates,
  type IbgeMunicipality,
  type IbgeState
} from '@shared/services/location';
import { useI18n } from '@shared/i18n';
import { uiButtonPrimaryClass, uiButtonSecondaryClass, uiFieldClass, uiLabelClass, uiSelectClass } from '@shared/ui/classes';
import { ModalDialog } from './ModalDialog';

interface CalendarLocationDialogProps {
  open: boolean;
  location?: CalendarLocation;
  onSave: (location: CalendarLocation) => void;
  onClose: () => void;
}

function getLocationErrorKey(error: unknown): string {
  if (error instanceof CalendarLocationError) {
    switch (error.code) {
      case 'permission-denied':
        return 'calendar.locationDenied';
      case 'consent-denied':
        return 'calendar.locationConsentDenied';
      case 'timeout':
      case 'unavailable':
        return 'calendar.locationUnavailable';
      case 'reverse-failed':
        return 'calendar.locationReverseFailed';
      case 'not-found':
        return 'calendar.locationNotFound';
    }
  }
  return 'calendar.locationError';
}

export function CalendarLocationDialog({ open, location, onSave, onClose }: CalendarLocationDialogProps) {
  const { t } = useI18n();
  const [states, setStates] = useState<IbgeState[]>([]);
  const [municipalities, setMunicipalities] = useState<IbgeMunicipality[]>([]);
  const [selectedState, setSelectedState] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setError(null);
    setSelectedState(location?.countryCode === 'BR' ? location.stateCode ?? '' : '');
    setSelectedCity(location?.countryCode === 'BR' ? location.city : '');
    setLoadingStates(true);

    getStates()
      .then((nextStates) => {
        if (!cancelled) setStates(nextStates);
      })
      .catch(() => {
        if (!cancelled) setError(t('calendar.locationStatesError'));
      })
      .finally(() => {
        if (!cancelled) setLoadingStates(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, location?.stateCode, location?.city, location?.countryCode]);

  useEffect(() => {
    if (!open || !selectedState) {
      setMunicipalities([]);
      return;
    }

    let cancelled = false;
    setLoadingCities(true);
    setError(null);

    getMunicipalities(selectedState)
      .then((nextMunicipalities) => {
        if (cancelled) return;
        setMunicipalities(nextMunicipalities);
        if (!selectedCity) return;
        const match = findMunicipality(nextMunicipalities, selectedCity);
        setSelectedCity(match ? match.nome : '');
      })
      .catch(() => {
        if (!cancelled) setError(t('calendar.locationCitiesError'));
      })
      .finally(() => {
        if (!cancelled) setLoadingCities(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, selectedState]);

  const handleDetect = async () => {
    setDetecting(true);
    setError(null);
    try {
      const detected = await detectCalendarLocation();
      onSave(detected);
      onClose();
    } catch (err) {
      setError(t(getLocationErrorKey(err)));
    } finally {
      setDetecting(false);
    }
  };

  const handleSave = () => {
    const municipality = findMunicipality(municipalities, selectedCity);
    if (!selectedState || !municipality) {
      setError(t('calendar.locationChooseCityError'));
      return;
    }

    onSave({
      countryCode: 'BR',
      stateCode: selectedState,
      city: municipality.nome,
      ibgeCode: String(municipality.id),
      source: 'manual',
      updatedAt: Date.now()
    });
    onClose();
  };

  const selectedStateName = states.find((state) => state.sigla === selectedState)?.nome;

  return (
    <ModalDialog open={open} onClose={onClose} title={t('calendar.locationTitle')}>
      <div className="calendar-location-dialog">
        <p className="calendar-location-dialog__intro">{t('calendar.locationIntro')}</p>

        {location && (
          <div className="calendar-location-dialog__current">
            <MapPin size={16} strokeWidth={2} aria-hidden="true" />
            <span>
              {location.city}
              {location.stateCode ? `, ${location.stateCode}` : ''}
            </span>
          </div>
        )}

        <button
          type="button"
          className={`${uiButtonPrimaryClass} calendar-location-dialog__detect`}
          onClick={handleDetect}
          disabled={detecting}
        >
          <LocateFixed size={16} strokeWidth={2} aria-hidden="true" />
          {detecting ? t('calendar.detectingLocation') : t('calendar.detectLocation')}
        </button>

        <div className="calendar-location-dialog__divider">
          <span>{t('calendar.orChooseManually')}</span>
        </div>

        <div className="calendar-location-dialog__fields">
          <label className={uiFieldClass}>
            <span className={uiLabelClass}>{t('calendar.state')}</span>
            <select
              className={uiSelectClass}
              value={selectedState}
              onChange={(e) => {
                setSelectedState((e.target as HTMLSelectElement).value);
                setSelectedCity('');
              }}
              disabled={loadingStates}
            >
              <option value="">{t('calendar.selectState')}</option>
              {states.map((state) => (
                <option key={state.id} value={state.sigla}>
                  {state.nome} ({state.sigla})
                </option>
              ))}
            </select>
          </label>

          <label className={uiFieldClass}>
            <span className={uiLabelClass}>{t('calendar.city')}</span>
            <select
              className={uiSelectClass}
              value={selectedCity}
              onChange={(e) => setSelectedCity((e.target as HTMLSelectElement).value)}
              disabled={!selectedState || loadingCities}
            >
              <option value="">
                {loadingCities
                  ? t('calendar.loadingCities')
                  : selectedState
                    ? t('calendar.selectCity')
                    : t('calendar.selectStateFirst')}
              </option>
              {municipalities.map((municipality) => (
                <option key={municipality.id} value={municipality.nome}>
                  {municipality.nome}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedStateName && (
          <p className="calendar-location-dialog__hint">
            {t('calendar.locationSelectedHint', { city: selectedCity || '—', state: selectedStateName })}
          </p>
        )}

        {error && <p className="calendar-location-dialog__error" role="alert">{error}</p>}

        <div className="calendar-location-dialog__actions">
          <button type="button" className={uiButtonSecondaryClass} onClick={onClose}>
            {t('calendar.cancel')}
          </button>
          <button
            type="button"
            className={uiButtonPrimaryClass}
            onClick={handleSave}
            disabled={!selectedState || !selectedCity}
          >
            {t('calendar.saveLocation')}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
