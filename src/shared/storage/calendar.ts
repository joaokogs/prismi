import type { AppData, CalendarEvent } from '@shared/types';
import { generateId } from '@shared/types/defaults';
import { updateWidgetInWorkspace } from './index';

export function createCalendarEvent(
  date: string,
  title = '',
  overrides: Partial<Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>> = {}
): CalendarEvent {
  const now = Date.now();
  return {
    id: generateId('event'),
    title: title.trim(),
    date,
    allDay: true,
    ...overrides,
    createdAt: now,
    updatedAt: now
  };
}

export function addCalendarEvent(
  data: AppData,
  boardId: string,
  widgetId: string,
  event: CalendarEvent
): AppData {
  return updateWidgetInWorkspace(
    data,
    boardId,
    widgetId,
    (w) => w.type === 'calendar'
      ? { ...w, events: [...(w.events ?? []), event] }
      : w,
    true,
  );
}

export function updateCalendarEvent(
  data: AppData,
  boardId: string,
  widgetId: string,
  eventId: string,
  updates: Partial<Omit<CalendarEvent, 'id' | 'createdAt'>>
): AppData {
  return updateWidgetInWorkspace(
    data,
    boardId,
    widgetId,
    (w) => w.type === 'calendar'
      ? {
          ...w,
          events: (w.events ?? []).map((event) =>
            event.id === eventId
              ? { ...event, ...updates, updatedAt: Date.now() }
              : event
          )
        }
      : w,
    true,
  );
}

export function deleteCalendarEvent(
  data: AppData,
  boardId: string,
  widgetId: string,
  eventId: string
): AppData {
  return updateWidgetInWorkspace(
    data,
    boardId,
    widgetId,
    (w) => w.type === 'calendar'
      ? { ...w, events: (w.events ?? []).filter((event) => event.id !== eventId) }
      : w,
    true,
  );
}
