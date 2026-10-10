import { coordinatesFromPair } from '~/utils/saved-channels-db';
import { formatLatitude, formatLongitude } from '~/utils/maidenhead';

/** Shown when a row has neither a city/state nor coordinates. */
export const CHANNEL_LOCATION_EMPTY = '—';

/**
 * Location column text: "City, ST" when city or state is known, otherwise
 * formatted coordinates, otherwise an em dash.
 *
 * CHIRP CSV has no city, state, or coordinates, so those rows stay unlocated.
 */
export function formatChannelLocation(channel: {
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
}): string {
  const place = [channel.city?.trim(), channel.state?.trim()].filter((part): part is string => Boolean(part)).join(', ');

  if (place) {
    return place;
  }

  const point = coordinatesFromPair(channel.latitude, channel.longitude);

  if (point.latitude !== undefined && point.longitude !== undefined) {
    return `${formatLatitude(point.latitude)} ${formatLongitude(point.longitude)}`;
  }

  return CHANNEL_LOCATION_EMPTY;
}

/**
 * Compare location labels. Rows with no location stay last in either direction.
 */
export function compareChannelLocation(
  left: { city?: string; state?: string; latitude?: number; longitude?: number },
  right: { city?: string; state?: string; latitude?: number; longitude?: number },
): number {
  const leftLabel = formatChannelLocation(left);
  const rightLabel = formatChannelLocation(right);
  const leftEmpty = leftLabel === CHANNEL_LOCATION_EMPTY;
  const rightEmpty = rightLabel === CHANNEL_LOCATION_EMPTY;

  if (leftEmpty && rightEmpty) {
    return 0;
  }

  if (leftEmpty) {
    return 1;
  }

  if (rightEmpty) {
    return -1;
  }

  return leftLabel.localeCompare(rightLabel, undefined, { sensitivity: 'base' });
}

export function sortChannelsByLocation<T extends { city?: string; state?: string; latitude?: number; longitude?: number }>(
  channels: readonly T[],
  direction: 'asc' | 'desc',
): T[] {
  return [...channels].sort((left, right) => {
    const compared = compareChannelLocation(left, right);
    const leftEmpty = formatChannelLocation(left) === CHANNEL_LOCATION_EMPTY;
    const rightEmpty = formatChannelLocation(right) === CHANNEL_LOCATION_EMPTY;

    if (leftEmpty || rightEmpty || compared === 0) {
      return compared;
    }

    return direction === 'desc' ? -compared : compared;
  });
}
