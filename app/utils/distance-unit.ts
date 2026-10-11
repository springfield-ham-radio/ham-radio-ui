import type { DistanceUnit } from '~/utils/trip-channels';

export const DISTANCE_UNIT_STORAGE_KEY = 'ham-radio-distance-unit';

/** Channel-library distances are miles until the operator chooses kilometers. */
export const DEFAULT_DISTANCE_UNIT: DistanceUnit = 'mi';

export function parseDistanceUnit(value: unknown): DistanceUnit {
  if (value === 'km' || value === 'mi') {
    return value;
  }

  return DEFAULT_DISTANCE_UNIT;
}

/**
 * Parse the distance-unit preference from localStorage.
 *
 * A missing or unknown value stays miles.
 */
export function parseDistanceUnitSettings(raw: string | null): DistanceUnit {
  if (!raw) {
    return DEFAULT_DISTANCE_UNIT;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed === 'string') {
      return parseDistanceUnit(parsed);
    }

    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parseDistanceUnit((parsed as { unit?: unknown }).unit);
    }
  } catch {
    return parseDistanceUnit(raw);
  }

  return DEFAULT_DISTANCE_UNIT;
}

export function serializeDistanceUnitSettings(unit: DistanceUnit): string {
  return JSON.stringify({ unit: parseDistanceUnit(unit) });
}

export function readDistanceUnit(): DistanceUnit {
  if (!import.meta.client) {
    return DEFAULT_DISTANCE_UNIT;
  }

  try {
    return parseDistanceUnitSettings(localStorage.getItem(DISTANCE_UNIT_STORAGE_KEY));
  } catch {
    return DEFAULT_DISTANCE_UNIT;
  }
}

export function writeDistanceUnit(unit: DistanceUnit): void {
  if (!import.meta.client) {
    return;
  }

  localStorage.setItem(DISTANCE_UNIT_STORAGE_KEY, serializeDistanceUnitSettings(unit));
}
