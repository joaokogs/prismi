import type { CalendarLocation } from '@shared/types';
import { browser } from '@shared/browser';

const IBGE_BASE = 'https://servicodados.ibge.gov.br/api/v1/localidades';
const MUNICIPALITIES_CACHE_PREFIX = 'prismiMunicipalities:';
const MUNICIPALITIES_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

export interface IbgeState {
  id: number;
  sigla: string;
  nome: string;
}

export interface IbgeMunicipality {
  id: number;
  nome: string;
}

export type CalendarLocationErrorCode =
  | 'permission-denied'
  | 'consent-denied'
  | 'unavailable'
  | 'timeout'
  | 'reverse-failed'
  | 'not-found';

export class CalendarLocationError extends Error {
  code: CalendarLocationErrorCode;

  constructor(code: CalendarLocationErrorCode) {
    super(code);
    this.name = 'CalendarLocationError';
    this.code = code;
  }
}

let statesPromise: Promise<IbgeState[]> | null = null;

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function getStateCodeFromReverseGeocode(data: {
  principalSubdivisionCode?: unknown;
}): string | undefined {
  if (typeof data.principalSubdivisionCode !== 'string') return undefined;
  const parts = data.principalSubdivisionCode.split('-');
  return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : undefined;
}

export async function getStates(signal?: AbortSignal): Promise<IbgeState[]> {
  if (!statesPromise) {
    statesPromise = fetch(`${IBGE_BASE}/estados?orderBy=nome`, { signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`IBGE states request failed: ${response.status}`);
        const data = (await response.json()) as IbgeState[];
        return data.map((state) => ({
          id: state.id,
          sigla: state.sigla,
          nome: state.nome
        }));
      })
      .catch((error) => {
        statesPromise = null;
        throw error;
      });
  }
  return statesPromise;
}

export async function getMunicipalities(
  stateCode: string,
  signal?: AbortSignal
): Promise<IbgeMunicipality[]> {
  const normalizedState = stateCode.toUpperCase();
  const cacheKey = `${MUNICIPALITIES_CACHE_PREFIX}${normalizedState}`;

  try {
    const cached = await browser.storage.local.get(cacheKey);
    const entry = cached[cacheKey] as
      | { data?: IbgeMunicipality[]; expiresAt?: number }
      | undefined;
    if (entry?.data && typeof entry.expiresAt === 'number' && entry.expiresAt > Date.now()) {
      return entry.data;
    }
  } catch {
    // Cache failure is not fatal; fall through to the network request.
  }

  const response = await fetch(
    `${IBGE_BASE}/estados/${encodeURIComponent(normalizedState)}/municipios?orderBy=nome`,
    { signal }
  );
  if (!response.ok) throw new Error(`IBGE municipalities request failed: ${response.status}`);

  const data = (await response.json()) as IbgeMunicipality[];
  const municipalities = data.map((municipality) => ({
    id: municipality.id,
    nome: municipality.nome
  }));

  try {
    await browser.storage.local.set({
      [cacheKey]: {
        data: municipalities,
        expiresAt: Date.now() + MUNICIPALITIES_CACHE_TTL
      }
    });
  } catch {
    // Storage full/blocked is not fatal for the current request.
  }

  return municipalities;
}

export function findMunicipality(
  municipalities: IbgeMunicipality[],
  city: string
): IbgeMunicipality | undefined {
  const target = normalizeName(city);
  if (!target) return undefined;
  return municipalities.find((municipality) => normalizeName(municipality.nome) === target);
}

interface ReverseGeocodeResponse {
  countryCode?: unknown;
  principalSubdivisionCode?: unknown;
  city?: unknown;
  locality?: unknown;
  localityInfo?: {
    administrative?: Array<{ name?: unknown }>;
    informative?: Array<{ name?: unknown }>;
  };
}

function getLocalityCandidates(data: ReverseGeocodeResponse): string[] {
  const values = [
    ...(data.localityInfo?.administrative ?? []),
    ...(data.localityInfo?.informative ?? [])
  ]
    .map((entry) => (typeof entry.name === 'string' ? entry.name.trim() : ''))
    .filter(Boolean);
  return Array.from(new Set(values));
}

export async function reverseGeocode(
  latitude: number,
  longitude: number,
  signal?: AbortSignal
): Promise<{ countryCode: string; stateCode?: string; city: string; candidates: string[] }> {
  const response = await fetch(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=pt`,
    { signal }
  );
  if (!response.ok) throw new CalendarLocationError('reverse-failed');

  const data = (await response.json()) as ReverseGeocodeResponse;
  const countryCode = typeof data.countryCode === 'string' ? data.countryCode.toUpperCase() : '';
  const city = typeof data.city === 'string'
    ? data.city
    : typeof data.locality === 'string'
      ? data.locality
      : '';

  if (!countryCode || !city) throw new CalendarLocationError('reverse-failed');

  return {
    countryCode,
    stateCode: getStateCodeFromReverseGeocode(data),
    city,
    candidates: getLocalityCandidates(data)
  };
}

async function requestLocationDataConsent(): Promise<boolean> {
  try {
    const permissions = browser.permissions as unknown as {
      request: (request: { data_collection: string[] }) => Promise<boolean>;
    };
    return await permissions.request({ data_collection: ['locationInfo'] });
  } catch {
    // Firefox < 140 and Chromium do not expose data_collection permissions.
    return true;
  }
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  if (!navigator.geolocation) {
    return Promise.reject(new CalendarLocationError('unavailable'));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      resolve,
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new CalendarLocationError('permission-denied'));
          return;
        }
        if (error.code === error.TIMEOUT) {
          reject(new CalendarLocationError('timeout'));
          return;
        }
        reject(new CalendarLocationError('unavailable'));
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
}

export async function detectCalendarLocation(): Promise<CalendarLocation> {
  const consent = await requestLocationDataConsent();
  if (!consent) throw new CalendarLocationError('consent-denied');

  let position: GeolocationPosition;
  try {
    position = await getCurrentPosition();
  } catch (error) {
    if (error instanceof CalendarLocationError) throw error;
    throw new CalendarLocationError('unavailable');
  }

  const reverse = await reverseGeocode(
    position.coords.latitude,
    position.coords.longitude
  );

  const location: CalendarLocation = {
    countryCode: reverse.countryCode,
    stateCode: reverse.stateCode,
    city: reverse.city,
    source: 'geolocation',
    updatedAt: Date.now()
  };

  if (reverse.countryCode !== 'BR' || !reverse.stateCode) {
    return location;
  }

  const municipalities = await getMunicipalities(reverse.stateCode);
  const candidates = [reverse.city, ...reverse.candidates];
  const municipality = candidates
    .map((candidate) => findMunicipality(municipalities, candidate))
    .find((match) => match !== undefined);
  if (municipality) {
    location.ibgeCode = String(municipality.id);
    location.city = municipality.nome;
  }

  return location;
}
