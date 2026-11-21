import type { RadioMemoryMapUiField } from '@springfield/ham-radio-utils';

export type SettingsCoordinateAxis = 'lat' | 'lon';
export type SettingsCoordinatePart = 'degrees' | 'minutes' | 'fraction';

/** Degrees and decimal minutes stored as separate memory-map fields. */
export interface SettingsCoordinateComposite {
  id: string;
  kind: 'coordinate';
  axis: SettingsCoordinateAxis;
  part: SettingsCoordinatePart;
  fractionScale: number;
  label: string;
}

export interface SettingsCoordinateParts {
  degrees: number;
  minutes: number;
  fraction: number;
}

export type SettingsCoordinateParse = SettingsCoordinateParts | { error: string };

const PARTS = new Set<SettingsCoordinatePart>(['degrees', 'minutes', 'fraction']);

/**
 * `ui.composite` for a coordinate part.
 * Any other kind, or a partial object, leaves the field as its own control.
 */
export function fieldComposite(field: RadioMemoryMapUiField): SettingsCoordinateComposite | undefined {
  const raw = (field.ui as { composite?: unknown }).composite;

  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const composite = raw as {
    id?: unknown;
    kind?: unknown;
    axis?: unknown;
    part?: unknown;
    fractionScale?: unknown;
    label?: unknown;
  };

  if (composite.kind !== 'coordinate') {
    return undefined;
  }

  if (typeof composite.id !== 'string' || composite.id.trim().length === 0) {
    return undefined;
  }

  if (composite.axis !== 'lat' && composite.axis !== 'lon') {
    return undefined;
  }

  if (typeof composite.part !== 'string' || !PARTS.has(composite.part as SettingsCoordinatePart)) {
    return undefined;
  }

  if (typeof composite.fractionScale !== 'number' || !Number.isFinite(composite.fractionScale) || composite.fractionScale <= 0) {
    return undefined;
  }

  if (typeof composite.label !== 'string' || composite.label.trim().length === 0) {
    return undefined;
  }

  return {
    id: composite.id.trim(),
    kind: 'coordinate',
    axis: composite.axis,
    part: composite.part as SettingsCoordinatePart,
    fractionScale: composite.fractionScale,
    label: composite.label.trim(),
  };
}

/** `30° 12.34'` or `097° 45.67'`. Latitude degrees are two digits. Longitude degrees are three. */
export function formatCoordinate(
  degrees: number,
  minutes: number,
  fraction: number,
  fractionScale: number,
  axis: SettingsCoordinateAxis,
): string {
  const scale = fractionScale > 0 ? fractionScale : 1;
  const decimalMinutes = minutes + fraction / scale;
  const degreeWidth = axis === 'lon' ? 3 : 2;
  const degreeText = String(Math.trunc(degrees)).padStart(degreeWidth, '0');

  return `${degreeText}° ${decimalMinutes.toFixed(2).padStart(5, '0')}'`;
}

/**
 * Split a degrees-and-decimal-minutes entry back into the stored parts.
 * `fraction` is the decimal part of the minutes, rounded by `fractionScale`.
 */
export function parseCoordinate(text: string, axis: SettingsCoordinateAxis, fractionScale: number): SettingsCoordinateParse {
  const match = text.trim().match(/^(\d{1,3})\s*(?:°|\s)\s*(-?\d+(?:\.\d+)?)\s*['′’]?\s*$/);

  if (!match) {
    return { error: "Enter degrees and minutes, such as 30° 12.34'." };
  }

  const degrees = Number(match[1]);
  const minutesValue = Number(match[2]);
  const maxDegrees = axis === 'lat' ? 90 : 180;

  if (!Number.isInteger(degrees) || degrees < 0 || degrees > maxDegrees) {
    return {
      error: axis === 'lat' ? 'Latitude degrees must be 0–90.' : 'Longitude degrees must be 0–180.',
    };
  }

  if (!Number.isFinite(minutesValue) || minutesValue < 0 || minutesValue > 59.99) {
    return { error: 'Minutes must be 0–59.99.' };
  }

  let minutes = Math.trunc(minutesValue);
  let fraction = Math.round((minutesValue - minutes) * fractionScale);

  if (fraction >= fractionScale) {
    fraction = 0;
    minutes += 1;
  }

  if (minutes > 59) {
    return { error: 'Minutes must be 0–59.99.' };
  }

  return { degrees, minutes, fraction };
}
