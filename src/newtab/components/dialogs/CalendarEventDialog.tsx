import { useEffect, useState } from 'preact/hooks';
import { Trash2 } from 'lucide-preact';
import type { CalendarEvent } from '@shared/types';
import { createCalendarEvent } from '@shared/storage/calendar';
import { useI18n } from '@shared/i18n';
import {
  uiButtonDangerClass,
  uiButtonPrimaryClass,
  uiButtonSecondaryClass,
  uiFieldClass,
  uiInputClass,
  uiLabelClass
} from '@shared/ui/classes';
import { ModalDialog } from './ModalDialog';

interface CalendarEventDialogProps {
  open: boolean;
  date: string;
  event?: CalendarEvent | null;
  onSave: (event: CalendarEvent) => void;
  onDelete?: (eventId: string) => void;
  onClose: () => void;
}

const EVENT_COLORS = ['#2563eb', '#0f766e', '#b45309', '#be123c', '#7c3aed', '#475569'];

export function CalendarEventDialog({
  open,
  date,
  event,
  onSave,
  onDelete,
  onClose
}: CalendarEventDialogProps) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState(date);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [notes, setNotes] = useState('');
  const [color, setColor] = useState(EVENT_COLORS[0]);

  useEffect(() => {
    if (!open) return;
    setTitle(event?.title ?? '');
    setEventDate(event?.date ?? date);
    setAllDay(event?.allDay ?? true);
    setStartTime(event?.startTime ?? '09:00');
    setEndTime(event?.endTime ?? '10:00');
    setNotes(event?.notes ?? '');
    setColor(event?.color ?? EVENT_COLORS[0]);
  }, [open, event?.id, date]);

  const handleSave = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !eventDate) return;

    const base = event ?? createCalendarEvent(eventDate, trimmedTitle);
    const next: CalendarEvent = {
      ...base,
      title: trimmedTitle,
      date: eventDate,
      allDay,
      startTime: allDay ? undefined : startTime || undefined,
      endTime: allDay ? undefined : endTime || undefined,
      notes: notes.trim() || undefined,
      color: color || undefined,
      updatedAt: Date.now()
    };
    onSave(next);
  };

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={event ? t('calendar.editEventTitle') : t('calendar.newEventTitle')}
    >
      <div className="calendar-event-dialog">
        <label className={uiFieldClass}>
          <span className={uiLabelClass}>{t('calendar.eventName')}</span>
          <input
            className={uiInputClass}
            type="text"
            value={title}
            onChange={(e) => setTitle((e.target as HTMLInputElement).value)}
            placeholder={t('calendar.eventNamePlaceholder')}
            autoFocus
          />
        </label>

        <label className={uiFieldClass}>
          <span className={uiLabelClass}>{t('calendar.date')}</span>
          <input
            className={uiInputClass}
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate((e.target as HTMLInputElement).value)}
          />
        </label>

        <label className="calendar-event-dialog__check">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay((e.target as HTMLInputElement).checked)}
          />
          <span>{t('calendar.allDay')}</span>
        </label>

        {!allDay && (
          <div className="calendar-event-dialog__times">
            <label className={uiFieldClass}>
              <span className={uiLabelClass}>{t('calendar.startTime')}</span>
              <input
                className={uiInputClass}
                type="time"
                value={startTime}
                onChange={(e) => setStartTime((e.target as HTMLInputElement).value)}
              />
            </label>
            <label className={uiFieldClass}>
              <span className={uiLabelClass}>{t('calendar.endTime')}</span>
              <input
                className={uiInputClass}
                type="time"
                value={endTime}
                onChange={(e) => setEndTime((e.target as HTMLInputElement).value)}
              />
            </label>
          </div>
        )}

        <label className={uiFieldClass}>
          <span className={uiLabelClass}>{t('calendar.notes')}</span>
          <textarea
            className={`${uiInputClass} calendar-event-dialog__notes`}
            value={notes}
            onChange={(e) => setNotes((e.target as HTMLTextAreaElement).value)}
            placeholder={t('calendar.notesPlaceholder')}
          />
        </label>

        <div className={uiFieldClass}>
          <span className={uiLabelClass}>{t('calendar.color')}</span>
          <div className="calendar-event-dialog__colors">
            {EVENT_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                className={`calendar-event-dialog__color ${color === option ? 'calendar-event-dialog__color--active' : ''}`}
                style={{ backgroundColor: option }}
                onClick={() => setColor(option)}
                aria-label={t('calendar.colorOption', { color: option })}
                aria-pressed={color === option}
              />
            ))}
          </div>
        </div>

        <div className="calendar-event-dialog__actions">
          {event && onDelete && (
            <button
              type="button"
              className={`${uiButtonDangerClass} calendar-event-dialog__delete`}
              onClick={() => onDelete(event.id)}
            >
              <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
              {t('calendar.delete')}
            </button>
          )}
          <button type="button" className={uiButtonSecondaryClass} onClick={onClose}>
            {t('calendar.cancel')}
          </button>
          <button
            type="button"
            className={uiButtonPrimaryClass}
            onClick={handleSave}
            disabled={!title.trim() || !eventDate}
          >
            {t('calendar.save')}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
