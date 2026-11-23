import { useEffect, useMemo, useState } from 'preact/hooks';
import type { CSSProperties } from 'preact/compat';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Pencil, Plus, Trash2 } from 'lucide-preact';
import type { CalendarEvent, CalendarLocation, CalendarWidget, Holiday, HolidayLevel } from '@shared/types';
import { getHolidays, type HolidayResult } from '@shared/services/holidays';
import { useI18n } from '@shared/i18n';
import { CalendarEventDialog } from '../dialogs/CalendarEventDialog';

interface CalendarWidgetViewProps {
  widget: CalendarWidget;
  location?: CalendarLocation;
  onEditLocation?: () => void;
  onAddEvent?: (event: CalendarEvent) => void;
  onUpdateEvent?: (eventId: string, updates: Partial<CalendarEvent>) => void;
  onDeleteEvent?: (eventId: string) => void;
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function eventDates(event: CalendarEvent): string[] {
  const start = fromDateKey(event.date);
  const end = event.endDate ? fromDateKey(event.endDate) : start;
  if (end < start) return [event.date];

  const dates: string[] = [];
  const cursor = new Date(start);
  let guard = 0;
  while (cursor <= end && guard < 366) {
    dates.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return dates;
}

export function CalendarWidgetView({
  widget,
  location,
  onEditLocation,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent
}: CalendarWidgetViewProps) {
  const { t } = useI18n();
  const MONTHS = t('calendar.months').split(',');
  const DAYS = t('calendar.days').split(',');
  const [today, setToday] = useState(new Date());
  const [month, setMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [holidayResult, setHolidayResult] = useState<HolidayResult>({
    holidays: [],
    municipalStatus: 'unavailable'
  });
  const [loadingHolidays, setLoadingHolidays] = useState(false);
  const [holidayError, setHolidayError] = useState(false);
  const [eventDialogDate, setEventDialogDate] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    setToday(new Date());
  }, []);

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    if (!location) {
      setHolidayResult({ holidays: [], municipalStatus: 'unavailable' });
      setHolidayError(false);
      setLoadingHolidays(false);
      return () => controller.abort();
    }

    setLoadingHolidays(true);
    setHolidayError(false);

    getHolidays(year, location, controller.signal)
      .then((result) => {
        if (!cancelled) setHolidayResult(result);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (!cancelled) {
          setHolidayResult({ holidays: [], municipalStatus: 'unavailable' });
          setHolidayError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingHolidays(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [year, location?.countryCode, location?.stateCode, location?.city, location?.ibgeCode]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of widget.events ?? []) {
      for (const date of eventDates(event)) {
        const list = map.get(date) ?? [];
        list.push(event);
        map.set(date, list);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return (a.startTime ?? '').localeCompare(b.startTime ?? '');
      });
    }
    return map;
  }, [widget.events]);

  const holidaysByDate = useMemo(() => {
    const map = new Map<string, Holiday[]>();
    for (const holiday of holidayResult.holidays) {
      const list = map.get(holiday.date) ?? [];
      list.push(holiday);
      map.set(holiday.date, list);
    }
    return map;
  }, [holidayResult.holidays]);

  const prevMonth = () => {
    const next = new Date(year, monthIndex - 1, 1);
    setMonth(next);
    setSelectedDate(toDateKey(next));
  };

  const nextMonth = () => {
    const next = new Date(year, monthIndex + 1, 1);
    setMonth(next);
    setSelectedDate(toDateKey(next));
  };

  const goToToday = () => {
    const now = new Date();
    setToday(now);
    setMonth(now);
    setSelectedDate(toDateKey(now));
  };

  const isToday = (day: number) => (
    today.getDate() === day &&
    today.getMonth() === monthIndex &&
    today.getFullYear() === year
  );

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selectedDay = selectedDate ? fromDateKey(selectedDate) : null;
  const selectedDayEvents = selectedDate ? eventsByDate.get(selectedDate) ?? [] : [];
  const selectedDayHolidays = selectedDate ? holidaysByDate.get(selectedDate) ?? [] : [];

  const formatDayLabel = (dateKey: string) => {
    const date = fromDateKey(dateKey);
    const weekday = DAYS[(date.getDay() + 6) % 7];
    return `${weekday}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  };

  const formatEventTime = (event: CalendarEvent) => {
    if (event.allDay !== false) return t('calendar.allDayShort');
    if (event.startTime && event.endTime) return `${event.startTime} – ${event.endTime}`;
    return event.startTime || t('calendar.allDayShort');
  };

  const holidayLabel = (level: HolidayLevel) => {
    switch (level) {
      case 'national':
        return t('calendar.holidayNational');
      case 'state':
        return t('calendar.holidayState');
      case 'municipal':
        return t('calendar.holidayMunicipal');
    }
  };

  const openNewEvent = (date: string) => {
    setEditingEvent(null);
    setEventDialogDate(date);
  };

  const openEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event);
    setEventDialogDate(event.date);
  };

  const handleSaveEvent = (event: CalendarEvent) => {
    if (editingEvent) {
      onUpdateEvent?.(editingEvent.id, event);
    } else {
      onAddEvent?.(event);
    }
    setEditingEvent(null);
    setEventDialogDate(null);
  };

  const handleDeleteEvent = (eventId: string) => {
    onDeleteEvent?.(eventId);
    setEditingEvent(null);
    setEventDialogDate(null);
  };

  const holidayStatusMessage = () => {
    if (!location) return null;
    if (loadingHolidays) return t('calendar.holidaysLoading');
    if (holidayError) return t('calendar.holidaysError');
    if (location.countryCode !== 'BR') return t('calendar.holidaysBrazilOnly');
    if (!location.ibgeCode) return t('calendar.municipalUnavailable');
    if (holidayResult.municipalStatus === 'missing') return t('calendar.municipalMissing');
    if (holidayResult.municipalStatus === 'unavailable') return t('calendar.municipalUnavailable');
    return null;
  };

  const calendarStyle = widget.holidayColor
    ? ({ '--calendar-holiday-color': widget.holidayColor } as CSSProperties)
    : undefined;

  return (
    <div className="calendar-widget" style={calendarStyle}>
      <div className="calendar-widget__header">
        <div className="calendar-widget__nav-group">
          <button className="calendar-widget__nav" onClick={prevMonth} aria-label={t('calendar.prevMonth')}>
            <ChevronLeft size={16} strokeWidth={2} />
          </button>
          <span className="calendar-widget__month">{MONTHS[monthIndex]} {year}</span>
          <button className="calendar-widget__nav" onClick={nextMonth} aria-label={t('calendar.nextMonth')}>
            <ChevronRight size={16} strokeWidth={2} />
          </button>
        </div>
        <div className="calendar-widget__header-actions">
          <button
            className="calendar-widget__today"
            onClick={goToToday}
            aria-label={t('calendar.goToToday')}
            title={t('calendar.goToToday')}
            type="button"
          >
            <CalendarDays size={14} strokeWidth={2} />
          </button>
          <button
            className="calendar-widget__add"
            onClick={() => openNewEvent(selectedDate)}
            aria-label={t('calendar.addEvent')}
            title={t('calendar.addEvent')}
            type="button"
          >
            <Plus size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      <button className="calendar-widget__location" onClick={onEditLocation} type="button">
        <MapPin size={12} strokeWidth={2} aria-hidden="true" />
        <span>
          {location
            ? `${location.city}${location.stateCode ? `, ${location.stateCode}` : ''}`
            : t('calendar.setLocation')}
        </span>
      </button>

      <div className="calendar-widget__grid">
        {DAYS.map((day) => (
          <div key={day} className="calendar-widget__day-label">
            {day}
          </div>
        ))}
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="calendar-widget__day calendar-widget__day--empty" />;
          }

          const dateKey = toDateKey(new Date(year, monthIndex, day));
          const dayEvents = eventsByDate.get(dateKey) ?? [];
          const dayHolidays = holidaysByDate.get(dateKey) ?? [];
          const holidayNames = dayHolidays.map((holiday) => holiday.name).join(', ');
          const classes = [
            'calendar-widget__day',
            isToday(day) ? 'calendar-widget__day--today' : '',
            selectedDate === dateKey ? 'calendar-widget__day--selected' : '',
            dayHolidays.length > 0 ? 'calendar-widget__day--holiday' : '',
            dayEvents.length > 0 ? 'calendar-widget__day--has-events' : ''
          ].filter(Boolean).join(' ');

          return (
            <button
              key={dateKey}
              type="button"
              className={classes}
              onClick={() => setSelectedDate(dateKey)}
              aria-label={[
                `${day} ${MONTHS[monthIndex]} ${year}`,
                holidayNames ? `${t('calendar.holiday')}: ${holidayNames}` : '',
                dayEvents.length > 0 ? t('calendar.eventCount', { count: dayEvents.length }) : ''
              ].filter(Boolean).join(', ')}
              aria-pressed={selectedDate === dateKey}
              title={holidayNames || undefined}
            >
              <span className="calendar-widget__day-number">{day}</span>
              <span className="calendar-widget__indicators" aria-hidden="true">
                {dayEvents.slice(0, 3).map((event) => (
                  <span
                    key={event.id}
                    className="calendar-widget__event-dot"
                    style={{ backgroundColor: event.color || 'var(--accent)' }}
                  />
                ))}
                {dayHolidays.length > 0 && <span className="calendar-widget__holiday-dot" />}
              </span>
            </button>
          );
        })}
      </div>

      {holidayStatusMessage() && (
        <p className={`calendar-widget__holiday-status ${holidayError ? 'calendar-widget__holiday-status--error' : ''}`}>
          {holidayStatusMessage()}
        </p>
      )}

      {selectedDate && selectedDay && (
        <section className="calendar-widget__day-panel">
          <div className="calendar-widget__day-panel-header">
            <span className="calendar-widget__day-panel-title">{formatDayLabel(selectedDate)}</span>
            <button
              className="calendar-widget__day-add"
              onClick={() => openNewEvent(selectedDate)}
              aria-label={t('calendar.addEvent')}
              title={t('calendar.addEvent')}
            >
              <Plus size={14} strokeWidth={2} />
            </button>
          </div>

          {selectedDayHolidays.length > 0 && (
            <ul className="calendar-widget__holiday-list">
              {selectedDayHolidays.map((holiday) => (
                <li key={`${holiday.date}-${holiday.name}`} className="calendar-widget__holiday-item">
                  <span className={`calendar-widget__holiday-badge calendar-widget__holiday-badge--${holiday.level}`}>
                    {holidayLabel(holiday.level)}
                  </span>
                  <span>{holiday.name}</span>
                </li>
              ))}
            </ul>
          )}

          {selectedDayEvents.length > 0 ? (
            <ul className="calendar-widget__event-list">
              {selectedDayEvents.map((event) => (
                <li key={event.id} className="calendar-widget__event-item">
                  <span
                    className="calendar-widget__event-color"
                    style={{ backgroundColor: event.color || 'var(--accent)' }}
                    aria-hidden="true"
                  />
                  <div className="calendar-widget__event-content">
                    <span className="calendar-widget__event-title">{event.title}</span>
                    <span className="calendar-widget__event-time">{formatEventTime(event)}</span>
                    {event.notes && <span className="calendar-widget__event-notes">{event.notes}</span>}
                  </div>
                  <div className="calendar-widget__event-actions">
                    <button
                      className="calendar-widget__event-action"
                      onClick={() => openEditEvent(event)}
                      aria-label={t('calendar.editEvent')}
                      title={t('calendar.editEvent')}
                    >
                      <Pencil size={12} strokeWidth={2} />
                    </button>
                    <button
                      className="calendar-widget__event-action calendar-widget__event-action--danger"
                      onClick={() => onDeleteEvent?.(event.id)}
                      aria-label={t('calendar.deleteEvent')}
                      title={t('calendar.deleteEvent')}
                    >
                      <Trash2 size={12} strokeWidth={2} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : selectedDayHolidays.length === 0 ? (
            <p className="calendar-widget__empty">{t('calendar.noEvents')}</p>
          ) : null}

        </section>
      )}

      <CalendarEventDialog
        open={eventDialogDate !== null}
        date={eventDialogDate ?? selectedDate}
        event={editingEvent}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
        onClose={() => {
          setEventDialogDate(null);
          setEditingEvent(null);
        }}
      />
    </div>
  );
}
