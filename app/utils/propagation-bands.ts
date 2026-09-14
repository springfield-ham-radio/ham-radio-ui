/**
 * Heuristic HF band-opening estimates from solar indices and local hour.
 *
 * This is a WWV-style rule-of-thumb chart, not a VOACAP path forecast.
 */

export type BandRating = 'closed' | 'poor' | 'fair' | 'good' | 'excellent';

export type PropagationBandId = '160m' | '80m' | '40m' | '30m' | '20m' | '17m' | '15m' | '12m' | '10m' | '6m';

export type PropagationClock = 'local' | 'utc';

export interface PropagationBand {
  id: PropagationBandId;
  label: string;
  /** Higher values prefer daylight and higher SFI. */
  frequencyWeight: number;
}

export interface BandRatingInput {
  solarFlux: number;
  kIndex: number;
  hour: number;
}

export interface DayNightBandRow {
  bandId: PropagationBandId;
  label: string;
  day: BandRating;
  night: BandRating;
}

export interface HourlyBandRow {
  bandId: PropagationBandId;
  label: string;
  ratings: BandRating[];
}

export interface HourlyBandGrid {
  hours: number[];
  rows: HourlyBandRow[];
}

export const PROPAGATION_BANDS: readonly PropagationBand[] = [
  { id: '160m', label: '160 m', frequencyWeight: 0.05 },
  { id: '80m', label: '80 m', frequencyWeight: 0.15 },
  { id: '40m', label: '40 m', frequencyWeight: 0.3 },
  { id: '30m', label: '30 m', frequencyWeight: 0.45 },
  { id: '20m', label: '20 m', frequencyWeight: 0.55 },
  { id: '17m', label: '17 m', frequencyWeight: 0.65 },
  { id: '15m', label: '15 m', frequencyWeight: 0.75 },
  { id: '12m', label: '12 m', frequencyWeight: 0.85 },
  { id: '10m', label: '10 m', frequencyWeight: 0.95 },
  { id: '6m', label: '6 m', frequencyWeight: 1.1 },
] as const;

const RATING_ORDER: BandRating[] = ['closed', 'poor', 'fair', 'good', 'excellent'];

/**
 * Returns a numeric rank for comparing band ratings.
 */
export function ratingRank(rating: BandRating): number {
  return RATING_ORDER.indexOf(rating);
}

/**
 * Local-hour daylight window used for the v1 chart.
 */
export function isDaylightHour(hour: number): boolean {
  const normalized = normalizeHour(hour);
  return normalized >= 6 && normalized <= 17;
}

/**
 * Returns the current hour (0–23) for the selected local or UTC clock.
 */
export function currentClockHour(clock: PropagationClock, now: Date = new Date()): number {
  return clock === 'utc' ? now.getUTCHours() : now.getHours();
}

/**
 * Maps a local-hour column to the hour number shown for the selected clock.
 *
 * The heatmap columns stay fixed in local time; UTC mode only relabels them.
 */
export function displayHourForLocalHour(
  localHour: number,
  clock: PropagationClock,
  options: { timezoneOffsetMinutes?: number } = {},
): number {
  if (clock === 'local') {
    return normalizeHour(localHour);
  }

  const offsetMinutes = options.timezoneOffsetMinutes ?? new Date().getTimezoneOffset();
  return normalizeHour(localHour + offsetMinutes / 60);
}

/**
 * Rates one HF / 6 m band for the given solar indices and local hour.
 */
export function rateBand(bandId: PropagationBandId, input: BandRatingInput): BandRating {
  const band = PROPAGATION_BANDS.find((entry) => entry.id === bandId);

  if (!band) {
    return 'closed';
  }

  const solarFlux = clamp(input.solarFlux, 50, 300);
  const kIndex = clamp(input.kIndex, 0, 9);
  const day = isDaylightHour(input.hour);
  const weight = band.frequencyWeight;

  let score = 0;

  if (bandId === '6m') {
    if (!day || solarFlux < 150) {
      return 'closed';
    }

    score = (solarFlux - 150) / 60;
  } else if (weight <= 0.35) {
    // Low bands prefer night; still usable by day on short paths.
    score = day ? 0.35 + solarFlux / 400 : 1.1 + solarFlux / 250;
  } else if (weight <= 0.6) {
    // 30 / 20 m — daytime workhorses; night depends on SFI.
    score = day ? 0.9 + (solarFlux - 70) / 120 : 0.35 + (solarFlux - 90) / 180;
  } else {
    // High HF needs daylight and elevated SFI.
    const sfiNeed = 70 + weight * 80;
    score = day ? (solarFlux - sfiNeed) / 70 + 0.85 : (solarFlux - sfiNeed - 30) / 100;
  }

  if (kIndex >= 7) {
    score -= 1.4;
  } else if (kIndex >= 5) {
    score -= 0.75;
  } else if (kIndex >= 4) {
    score -= 0.35;
  }

  if (weight >= 0.7 && kIndex >= 5) {
    score -= 0.35;
  }

  return scoreToRating(score);
}

/**
 * Builds day vs night ratings for every Propagation band.
 */
export function buildDayNightTable(input: Pick<BandRatingInput, 'solarFlux' | 'kIndex'>): DayNightBandRow[] {
  return PROPAGATION_BANDS.map((band) => ({
    bandId: band.id,
    label: band.label,
    day: rateBand(band.id, { ...input, hour: 12 }),
    night: rateBand(band.id, { ...input, hour: 22 }),
  }));
}

/**
 * Builds a 24-hour × band rating grid in local-hour column order.
 *
 * Day/night ratings are always local. Callers that show UTC only change the
 * column labels via {@link displayHourForLocalHour}.
 */
export function buildHourlyBandGrid(
  input: Pick<BandRatingInput, 'solarFlux' | 'kIndex'>,
): HourlyBandGrid {
  const hours = [...Array(24).keys()];

  return {
    hours,
    rows: PROPAGATION_BANDS.map((band) => ({
      bandId: band.id,
      label: band.label,
      ratings: hours.map((hour) => rateBand(band.id, { ...input, hour })),
    })),
  };
}

function normalizeHour(hour: number): number {
  return ((Math.floor(hour) % 24) + 24) % 24;
}

function scoreToRating(score: number): BandRating {
  if (score < 0.15) {
    return 'closed';
  }

  if (score < 0.55) {
    return 'poor';
  }

  if (score < 1.0) {
    return 'fair';
  }

  if (score < 1.55) {
    return 'good';
  }

  return 'excellent';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
