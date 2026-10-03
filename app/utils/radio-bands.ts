import { ANTENNA_BANDS } from '~/utils/antenna-types';

const EXTRA_BAND_LABELS: Record<string, string> = {
  '1.25m': '1.25 m',
  '33cm': '33 cm',
  '23cm': '23 cm',
};

/**
 * Transmit bands declared on an installed radio module.
 * Tokens match ADIF band names (`2m`, `70cm`, `40m`).
 */
export function radioBandsFromConfig(config: { bands?: unknown } | undefined): string[] {
  if (!config || !Array.isArray(config.bands)) {
    return [];
  }

  const bands: string[] = [];

  for (const entry of config.bands) {
    if (typeof entry !== 'string') {
      continue;
    }

    const token = entry.trim().toLowerCase();

    if (!token || bands.includes(token)) {
      continue;
    }

    bands.push(token);
  }

  return bands;
}

/**
 * Operator-facing band list, using the same labels as station antennas.
 */
export function formatEquipmentBands(bands: readonly string[]): string {
  return bands
    .map((band) => {
      const known = ANTENNA_BANDS.find((entry) => entry.id === band);

      return known?.label ?? EXTRA_BAND_LABELS[band] ?? band.toUpperCase();
    })
    .join(', ');
}

/**
 * Whether equipment tagged with these bands can be used on an ADIF band.
 * Undefined when the contact has no band, or the equipment declares none.
 */
export function equipmentCoversAdifBand(bands: readonly string[], adifBand: string | undefined): boolean | undefined {
  const target = adifBand?.trim().toLowerCase();

  if (!target || bands.length === 0) {
    return undefined;
  }

  return bands.some((band) => band.toLowerCase() === target);
}

/**
 * Equipment to offer for a contact.
 * With no contact band, every configured item stays.
 * Items that declare bands and do not include the contact band are left out.
 * Items with no declared bands stay, because coverage is unknown.
 */
export function equipmentListedForBand<T extends { bands: readonly string[] }>(
  items: readonly T[],
  adifBand: string | undefined,
): T[] {
  if (!adifBand?.trim()) {
    return [...items];
  }

  return items.filter((item) => equipmentCoversAdifBand(item.bands, adifBand) !== false);
}
