import type { CalendarLocation, Holiday, HolidayLevel } from '@shared/types';
import { browser } from '@shared/browser';

const HOLIDAY_DATA_BASE =
  'https://raw.githubusercontent.com/joaopbini/feriados-brasil/master/dados/feriados';
const CACHE_PREFIX = 'prismiHolidays:';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

type MunicipalStatus = 'available' | 'missing' | 'unavailable';

export interface HolidayResult {
  holidays: Holiday[];
  municipalStatus: MunicipalStatus;
}

interface RawHoliday {
  data?: unknown;
  nome?: unknown;
  tipo?: unknown;
  uf?: unknown;
  codigo_ibge?: unknown;
}

interface HolidayCacheEntry {
  data: HolidayResult;
  expiresAt: number;
}

function parseHolidayDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function normalizeHoliday(
  raw: RawHoliday,
  level: HolidayLevel
): Holiday | null {
  const date = parseHolidayDate(raw.data);
  const name = typeof raw.nome === 'string' ? raw.nome.trim() : '';
  if (!date || !name) return null;
  return { date, name, level };
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalNationalHolidays(year: number): Holiday[] {
  const fixed: Array<[string, string]> = [
    ['01-01', 'Confraternização Universal'],
    ['04-21', 'Tiradentes'],
    ['05-01', 'Dia Mundial do Trabalho'],
    ['09-07', 'Independência do Brasil'],
    ['10-12', 'Nossa Senhora Aparecida'],
    ['11-02', 'Finados'],
    ['11-15', 'Proclamação da República'],
    ['11-20', 'Dia da Consciência Negra'],
    ['12-25', 'Natal']
  ];

  const easter = easterSunday(year);
  const moveable: Array<[Date, string]> = [
    [addDays(easter, -48), 'Carnaval'],
    [addDays(easter, -47), 'Carnaval'],
    [addDays(easter, -2), 'Sexta-feira Santa'],
    [easter, 'Páscoa'],
    [addDays(easter, 60), 'Corpus Christi']
  ];

  return [
    ...fixed.map(([monthDay, name]) => ({
      date: `${year}-${monthDay}`,
      name,
      level: 'national' as const
    })),
    ...moveable.map(([date, name]) => ({
      date: toLocalDateKey(date),
      name,
      level: 'national' as const
    }))
  ];
}

function dedupeHolidays(holidays: Holiday[]): Holiday[] {
  const seen = new Set<string>();
  const result: Holiday[] = [];
  for (const holiday of holidays) {
    const key = `${holiday.date}|${holiday.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(holiday);
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

async function fetchHolidayFile(
  level: HolidayLevel,
  year: number,
  signal?: AbortSignal
): Promise<RawHoliday[]> {
  const response = await fetch(
    `${HOLIDAY_DATA_BASE}/${level === 'national' ? 'nacional' : level === 'state' ? 'estadual' : 'municipal'}/json/${year}.json`,
    { signal }
  );
  if (!response.ok) throw new Error(`Holiday file request failed: ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? (data as RawHoliday[]) : [];
}

function getCacheKey(year: number, location: CalendarLocation): string {
  const state = location.stateCode ?? 'none';
  const municipality = location.ibgeCode ?? 'none';
  return `${CACHE_PREFIX}${year}:${location.countryCode}:${state}:${municipality}`;
}

function filterByLocation(
  items: RawHoliday[],
  level: HolidayLevel,
  location: CalendarLocation
): Holiday[] {
  const filtered = items.filter((item) => {
    if (level === 'national') return true;
    if (level === 'state') {
      return typeof item.uf === 'string'
        && item.uf.toUpperCase() === location.stateCode?.toUpperCase();
    }
    return location.ibgeCode !== undefined
      && String(item.codigo_ibge) === location.ibgeCode;
  });

  return filtered.flatMap((item) => {
    const holiday = normalizeHoliday(item, level);
    return holiday ? [holiday] : [];
  });
}

export async function getHolidays(
  year: number,
  location: CalendarLocation | undefined,
  signal?: AbortSignal
): Promise<HolidayResult> {
  if (!location || location.countryCode !== 'BR') {
    return { holidays: [], municipalStatus: 'unavailable' };
  }

  const cacheKey = getCacheKey(year, location);
  try {
    const cached = await browser.storage.local.get(cacheKey);
    const entry = cached[cacheKey] as HolidayCacheEntry | undefined;
    if (entry?.data && typeof entry.expiresAt === 'number' && entry.expiresAt > Date.now()) {
      return entry.data;
    }
  } catch {
    // Cache failure is not fatal.
  }

  let national: Holiday[] = [];
  let state: Holiday[] = [];
  let municipal: Holiday[] = [];
  let municipalStatus: MunicipalStatus = 'unavailable';
  let shouldCache = false;

  const results = await Promise.allSettled([
    fetchHolidayFile('national', year, signal),
    location.stateCode
      ? fetchHolidayFile('state', year, signal)
      : Promise.resolve([] as RawHoliday[]),
    location.ibgeCode
      ? fetchHolidayFile('municipal', year, signal)
      : Promise.resolve([] as RawHoliday[])
  ]);

  const [nationalResult, stateResult, municipalResult] = results;

  if (nationalResult.status === 'fulfilled') {
    national = filterByLocation(nationalResult.value, 'national', location);
    shouldCache = true;
  } else {
    national = getLocalNationalHolidays(year);
  }

  if (stateResult.status === 'fulfilled') {
    state = filterByLocation(stateResult.value, 'state', location);
    shouldCache = true;
  }

  if (municipalResult.status === 'fulfilled') {
    municipal = filterByLocation(municipalResult.value, 'municipal', location);
    municipalStatus = municipal.length > 0 ? 'available' : 'missing';
    shouldCache = true;
  } else if (location.ibgeCode) {
    municipalStatus = 'unavailable';
  }

  const result: HolidayResult = {
    holidays: dedupeHolidays([...national, ...state, ...municipal]),
    municipalStatus
  };

  if (shouldCache && !signal?.aborted) {
    const municipalFailed = !!location.ibgeCode && municipalResult.status === 'rejected';
    const stateFailed = !!location.stateCode && stateResult.status === 'rejected';
    const expiresAt = Date.now() + (municipalFailed || stateFailed ? 60 * 60 * 1000 : CACHE_TTL);
    try {
      await browser.storage.local.set({
        [cacheKey]: {
          data: result,
          expiresAt
        }
      });
    } catch {
      // Cache write failure is not fatal.
    }
  }

  return result;
}
