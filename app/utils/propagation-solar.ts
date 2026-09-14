/**
 * NOAA SWPC solar / space-weather fetch and parse helpers for the Propagation page.
 *
 * Indices (SFI, A, K, sunspots, X-ray) are measured products. Band openings are
 * estimated separately in propagation-bands.ts from these numbers.
 */

export interface WwvAlert {
  issuedAt: string | undefined;
  solarFlux: number;
  aIndex: number;
  kIndex: number;
  stormSummary: string;
}

export interface DailySolarIndex {
  date: string;
  solarFlux: number;
  sunspotNumber: number;
}

export interface GoesXraySample {
  time_tag: string;
  energy: string;
  flux: number | null;
}

export interface SolarConditions {
  issuedAt: string | undefined;
  solarFlux: number;
  aIndex: number;
  kIndex: number;
  sunspotNumber: number | undefined;
  xrayClass: string | undefined;
  stormSummary: string;
  history: DailySolarIndex[];
  fetchedAt: string;
}

const NOAA_BASE = 'https://services.swpc.noaa.gov';
const WWV_PATH = '/text/wwv.txt';
const DAILY_INDICES_PATH = '/text/daily-solar-indices.txt';
const XRAY_PATH = '/json/goes/primary/xrays-6-hour.json';

const LONG_XRAY_ENERGY = '0.1-0.8nm';

function noaaUrl(path: string): string {
  // Browser `yarn dev` goes through the Vite proxy to avoid CORS. Tauri hits NOAA directly.
  if (typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window)) {
    return `/api/noaa${path}`;
  }

  return `${NOAA_BASE}${path}`;
}

/**
 * Parses the NOAA WWV geophysical alert text product for current SFI, A, and K.
 */
export function parseWwvAlert(text: string): WwvAlert {
  const issuedMatch = text.match(/:Issued:\s*(.+)/i);
  const fluxMatch = text.match(/Solar flux\s+(\d+(?:\.\d+)?)/i);
  const aMatch = text.match(/A-index\s+(\d+(?:\.\d+)?)/i);
  const kMatch = text.match(/K-index[\s\S]*?\bwas\s+(\d+(?:\.\d+)?)/i);

  if (!fluxMatch) {
    throw new Error('WWV alert is missing solar flux');
  }

  if (!aMatch) {
    throw new Error('WWV alert is missing A-index');
  }

  if (!kMatch) {
    throw new Error('WWV alert is missing K-index');
  }

  const summaryLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith(':') && !/^Solar-terrestrial/i.test(line) && !/^Solar flux/i.test(line) && !/^The estimated planetary K-index/i.test(line));

  return {
    issuedAt: issuedMatch?.[1]?.trim(),
    solarFlux: Number(fluxMatch[1]),
    aIndex: Number(aMatch[1]),
    kIndex: Number(kMatch[1]),
    stormSummary: summaryLines.join(' ').replace(/\s+/g, ' ').trim(),
  };
}

/**
 * Parses NOAA daily solar indices text into chronological SFI / sunspot rows.
 */
export function parseDailySolarIndices(text: string): DailySolarIndex[] {
  const days: DailySolarIndex[] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!/^\d{4}\s+\d{1,2}\s+\d{1,2}\s+/.test(trimmed)) {
      continue;
    }

    const parts = trimmed.split(/\s+/);
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    const solarFlux = Number(parts[3]);
    const sunspotNumber = Number(parts[4]);

    if (![year, month, day, solarFlux, sunspotNumber].every((value) => Number.isFinite(value))) {
      continue;
    }

    days.push({
      date: `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
      solarFlux,
      sunspotNumber,
    });
  }

  return days;
}

/**
 * Converts a GOES 0.1–0.8 nm X-ray flux (W/m²) into an A/B/C/M/X class label.
 */
export function fluxToXrayClass(flux: number): string {
  if (!Number.isFinite(flux) || flux <= 0) {
    return 'A0.0';
  }

  const bands: Array<{ letter: string; threshold: number }> = [
    { letter: 'X', threshold: 1e-4 },
    { letter: 'M', threshold: 1e-5 },
    { letter: 'C', threshold: 1e-6 },
    { letter: 'B', threshold: 1e-7 },
    { letter: 'A', threshold: 1e-8 },
  ];

  for (const band of bands) {
    if (flux >= band.threshold) {
      const magnitude = flux / band.threshold;
      return `${band.letter}${formatXrayMagnitude(magnitude)}`;
    }
  }

  const magnitude = flux / 1e-8;
  return `A${formatXrayMagnitude(magnitude)}`;
}

function formatXrayMagnitude(magnitude: number): string {
  if (magnitude >= 10) {
    return magnitude.toFixed(0);
  }

  return magnitude.toFixed(1);
}

/**
 * Returns the newest GOES long-channel (0.1–0.8 nm) flux sample.
 */
export function selectLatestXrayFlux(samples: GoesXraySample[]): number | undefined {
  const longChannel = samples
    .filter((sample) => sample.energy === LONG_XRAY_ENERGY && typeof sample.flux === 'number' && Number.isFinite(sample.flux))
    .sort((left, right) => left.time_tag.localeCompare(right.time_tag));

  const latest = longChannel.at(-1);
  return latest?.flux ?? undefined;
}

let sessionCache: SolarConditions | undefined;
let inFlight: Promise<SolarConditions> | undefined;

/**
 * Fetches current solar conditions from NOAA SWPC products.
 */
export async function fetchSolarConditions(fetchImpl: typeof fetch = fetch): Promise<SolarConditions> {
  const [wwvText, dailyText, xrayJson] = await Promise.all([
    fetchText(noaaUrl(WWV_PATH), fetchImpl),
    fetchText(noaaUrl(DAILY_INDICES_PATH), fetchImpl),
    fetchJson<GoesXraySample[]>(noaaUrl(XRAY_PATH), fetchImpl),
  ]);

  const wwv = parseWwvAlert(wwvText);
  const history = parseDailySolarIndices(dailyText);
  const latestFlux = selectLatestXrayFlux(xrayJson);
  const latestSunspots = history.at(-1)?.sunspotNumber;

  return {
    issuedAt: wwv.issuedAt,
    solarFlux: wwv.solarFlux,
    aIndex: wwv.aIndex,
    kIndex: wwv.kIndex,
    sunspotNumber: latestSunspots,
    xrayClass: latestFlux === undefined ? undefined : fluxToXrayClass(latestFlux),
    stormSummary: wwv.stormSummary,
    history,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Returns session-cached solar conditions, refreshing NOAA when forced or empty.
 */
export async function getSolarConditions(options: { force?: boolean; fetchImpl?: typeof fetch } = {}): Promise<SolarConditions> {
  const force = options.force === true;
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!force && sessionCache) {
    return sessionCache;
  }

  if (!force && inFlight) {
    return inFlight;
  }

  inFlight = fetchSolarConditions(fetchImpl)
    .then((conditions) => {
      sessionCache = conditions;
      return conditions;
    })
    .finally(() => {
      inFlight = undefined;
    });

  return inFlight;
}

async function fetchText(url: string, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(url);

  if (!response.ok) {
    throw new Error(`NOAA fetch failed for ${url} with HTTP ${response.status}`);
  }

  return response.text();
}

async function fetchJson<T>(url: string, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(url);

  if (!response.ok) {
    throw new Error(`NOAA fetch failed for ${url} with HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}
