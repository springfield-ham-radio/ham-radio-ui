import {
  defaultAntennaWhatIf,
  resolveAntennaView,
  resolveStationLocation,
  selectedRadioStation,
  type RadioStation,
  type StationAntennaStore,
  type StationDraft,
} from '~/utils/antenna-station';
import { formatLatitude, formatLongitude, locatedPoint } from '~/utils/location-format';
import { isValidLatitude, isValidLongitude } from '~/utils/maidenhead';

export interface AprsBeaconLocationPrefill {
  latitude: number;
  longitude: number;
  /** Station nickname, for example `Home`. */
  label: string;
}

function coordinatesFromStation(station: RadioStation): { latitude: number; longitude: number } | undefined {
  const draft: StationDraft = {
    nickname: station.nickname,
    gridsquare: station.gridsquare,
    latitude: station.latitude,
    longitude: station.longitude,
    locationSource: station.locationSource,
  };
  const resolved = resolveStationLocation(draft);

  return locatedPoint(resolved.latitude, resolved.longitude);
}

/**
 * Default beacon coordinates from the operator’s station library.
 *
 * Uses an explicit `stationId` when present (future `SavedRadio.stationId`), otherwise
 * the selected station antenna via `resolveAntennaView` with source `station` only.
 */
export function resolveAprsBeaconLocation(
  store: StationAntennaStore,
  options?: { stationId?: string },
): AprsBeaconLocationPrefill | undefined {
  if (options?.stationId) {
    const station = store.stations.find((entry) => entry.id === options.stationId);

    if (!station) {
      return undefined;
    }

    const point = coordinatesFromStation(station);

    if (!point) {
      return undefined;
    }

    return {
      latitude: point.latitude,
      longitude: point.longitude,
      label: station.nickname,
    };
  }

  const view = resolveAntennaView(store, 'station', defaultAntennaWhatIf());

  if (view) {
    const station = view.stationId
      ? store.stations.find((entry) => entry.id === view.stationId)
      : selectedRadioStation(store);
    const point = locatedPoint(view.latitude, view.longitude) ?? (station ? coordinatesFromStation(station) : undefined);

    if (point) {
      return {
        latitude: point.latitude,
        longitude: point.longitude,
        label: view.stationNickname ?? station?.nickname ?? 'Station',
      };
    }
  }

  const selected = selectedRadioStation(store);
  const point = selected ? coordinatesFromStation(selected) : undefined;

  if (selected && point) {
    return {
      latitude: point.latitude,
      longitude: point.longitude,
      label: selected.nickname,
    };
  }

  return undefined;
}

export function formatAprsBeaconSummaryPosition(latitude: number, longitude: number): string {
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return 'No position';
  }

  return `${formatLatitude(latitude)} ${formatLongitude(longitude)}`;
}