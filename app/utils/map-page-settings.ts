export const MAP_PAGE_SETTINGS_STORAGE_KEY = 'ham-radio-map';

/** Select every stored library group (not built-in Weather, FRS, or GMRS). */
export const MAP_PAGE_ALL_STORED_GROUPS = 'all-stored';

export interface MapPageCamera {
  longitude: number;
  latitude: number;
  zoom: number;
}

export type MapPageGroupSelection = typeof MAP_PAGE_ALL_STORED_GROUPS | string[];

export interface MapPageSettings {
  repeaters: boolean;
  channels: boolean;
  log: boolean;
  stations: boolean;
  trips: boolean;
  groupSelection: MapPageGroupSelection;
  camera?: MapPageCamera;
}

export const DEFAULT_MAP_PAGE_SETTINGS: MapPageSettings = {
  repeaters: true,
  channels: true,
  log: true,
  stations: true,
  trips: true,
  groupSelection: MAP_PAGE_ALL_STORED_GROUPS,
};

export function parseMapPageCamera(value: unknown): MapPageCamera | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const record = value as { longitude?: unknown; latitude?: unknown; zoom?: unknown };
  const longitude = record.longitude;
  const latitude = record.latitude;
  const zoom = record.zoom;

  if (
    typeof longitude !== 'number' ||
    typeof latitude !== 'number' ||
    typeof zoom !== 'number' ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(zoom)
  ) {
    return undefined;
  }

  if (latitude < -90 || latitude > 90 || zoom < 0 || zoom > 22) {
    return undefined;
  }

  return { longitude, latitude, zoom };
}

export function parseMapPageGroupSelection(value: unknown): MapPageGroupSelection {
  if (value === MAP_PAGE_ALL_STORED_GROUPS) {
    return MAP_PAGE_ALL_STORED_GROUPS;
  }

  if (!Array.isArray(value)) {
    return MAP_PAGE_ALL_STORED_GROUPS;
  }

  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

export function parseMapPageSettings(raw: string | null): MapPageSettings {
  if (!raw) {
    return { ...DEFAULT_MAP_PAGE_SETTINGS };
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_MAP_PAGE_SETTINGS };
    }

    const record = parsed as {
      repeaters?: unknown;
      channels?: unknown;
      log?: unknown;
      stations?: unknown;
      trips?: unknown;
      groupSelection?: unknown;
      groupIds?: unknown;
      camera?: unknown;
    };

    const camera = parseMapPageCamera(record.camera);
    const groupSelection = parseMapPageGroupSelection(record.groupSelection ?? record.groupIds);

    return {
      repeaters: record.repeaters !== false,
      channels: record.channels !== false,
      log: record.log !== false,
      stations: record.stations !== false,
      trips: record.trips !== false,
      groupSelection,
      ...(camera ? { camera } : {}),
    };
  } catch {
    return { ...DEFAULT_MAP_PAGE_SETTINGS };
  }
}

export function serializeMapPageSettings(settings: MapPageSettings): string {
  const camera = parseMapPageCamera(settings.camera);
  const groupSelection = parseMapPageGroupSelection(settings.groupSelection);

  return JSON.stringify({
    repeaters: settings.repeaters === true,
    channels: settings.channels === true,
    log: settings.log === true,
    stations: settings.stations === true,
    trips: settings.trips === true,
    groupSelection,
    ...(camera ? { camera } : {}),
  });
}

export function readMapPageSettings(): MapPageSettings {
  if (!import.meta.client) {
    return { ...DEFAULT_MAP_PAGE_SETTINGS };
  }

  try {
    return parseMapPageSettings(localStorage.getItem(MAP_PAGE_SETTINGS_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_MAP_PAGE_SETTINGS };
  }
}

export function writeMapPageSettings(settings: MapPageSettings): void {
  if (!import.meta.client) {
    return;
  }

  localStorage.setItem(MAP_PAGE_SETTINGS_STORAGE_KEY, serializeMapPageSettings(settings));
}
