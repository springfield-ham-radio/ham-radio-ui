import {
  ANTENNA_BANDS,
  ANTENNA_TYPES,
  antennaIsTrapped,
  antennaTypeById,
  antennaTypeUsesHeading,
  estimateGainDbi,
  estimateTakeoffDeg,
  formatTrapSummary,
  isAntennaBandId,
  isAntennaTypeId,
  sortAntennaBands,
  type AntennaBandId,
  type AntennaType,
  type AntennaTypeId,
} from '~/utils/antenna-types';
import {
  formatLatitude,
  formatLongitude,
  isValidLatitude,
  isValidLongitude,
  latLonToMaidenhead,
  maidenheadToLatLon,
  MAX_LATITUDE,
  MAX_LONGITUDE,
  MIN_LATITUDE,
  MIN_LONGITUDE,
  normalizeMaidenhead,
} from '~/utils/maidenhead';

export const STATION_ANTENNA_STORAGE_KEY = 'ham-radio-station-antennas';
export const HOME_STATION_ID = 'station-home';

export const MIN_ANTENNA_HEIGHT_AGL_M = 0.5;
export const MAX_ANTENNA_HEIGHT_AGL_M = 120;

export type StationLocationSource = 'grid' | 'coordinates';

export interface RadioStation {
  id: string;
  nickname: string;
  gridsquare?: string;
  latitude?: number;
  longitude?: number;
  locationSource?: StationLocationSource;
  createdAt: number;
  updatedAt: number;
}

export interface StationDraft {
  nickname: string;
  gridsquare?: string;
  latitude?: number;
  longitude?: number;
  locationSource?: StationLocationSource;
}

export interface StationAntenna {
  id: string;
  stationId: string;
  nickname: string;
  typeId: AntennaTypeId;
  heightAglM: number;
  /** True heading of maximum radiation, 0–359. Omitted for omni types. */
  headingDeg?: number;
  bands: AntennaBandId[];
  /** LC traps in the elements. Omitted when the type is a single-band or trapless. */
  trapped?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface StationAntennaStore {
  stations: RadioStation[];
  selectedStationId: string | undefined;
  antennas: StationAntenna[];
  selectedId: string | undefined;
}

export interface AntennaDraft {
  nickname: string;
  typeId: AntennaTypeId;
  heightAglM: number;
  headingDeg?: number;
  bands: AntennaBandId[];
  trapped?: boolean;
  stationId?: string;
}

export interface AntennaWhatIf {
  typeId: AntennaTypeId;
  heightAglM: number;
  headingDeg?: number;
  bands?: AntennaBandId[];
  trapped?: boolean;
}

export type AntennaViewSource = 'station' | 'what-if';

export interface ResolvedAntenna {
  source: AntennaViewSource;
  id?: string;
  nickname?: string;
  type: AntennaType;
  heightAglM: number;
  headingDeg?: number;
  bands: AntennaBandId[];
  trapped: boolean;
  gainDbi: number;
  takeoffDeg: number;
  stationId?: string;
  stationNickname?: string;
  gridsquare?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Default Home site with no location and no antennas.
 */
export function defaultHomeStation(now = Date.now()): RadioStation {
  return {
    id: HOME_STATION_ID,
    nickname: 'Home',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Empty antenna list on a Home station.
 */
export function defaultStationAntennaStore(): StationAntennaStore {
  const home = defaultHomeStation();

  return {
    stations: [home],
    selectedStationId: home.id,
    antennas: [],
    selectedId: undefined,
  };
}

/**
 * Draft filled from a generic type, used for Add and for seeding what-if.
 */
export function defaultAntennaDraft(typeId: AntennaTypeId = 'dipole'): AntennaDraft {
  const type = antennaTypeById(typeId) ?? ANTENNA_TYPES[0]!;

  return {
    nickname: '',
    typeId: type.id,
    heightAglM: type.defaultHeightAglM,
    headingDeg: antennaTypeUsesHeading(type) ? type.defaultHeadingDeg : undefined,
    bands: [...type.defaultBands],
    trapped: type.supportsTraps ? type.defaultTrapped : undefined,
  };
}

/**
 * Session what-if filled from a type, or cloned from an owned antenna.
 */
export function defaultAntennaWhatIf(source?: StationAntenna | AntennaDraft): AntennaWhatIf {
  if (source) {
    const type = antennaTypeById(source.typeId);
    const bands = 'bands' in source ? [...source.bands] : [...(type?.defaultBands ?? [])];

    return {
      typeId: source.typeId,
      heightAglM: source.heightAglM,
      headingDeg: source.headingDeg,
      bands,
      trapped: source.trapped,
    };
  }

  const draft = defaultAntennaDraft();

  return {
    typeId: draft.typeId,
    heightAglM: draft.heightAglM,
    headingDeg: draft.headingDeg,
    bands: [...draft.bands],
    trapped: draft.trapped,
  };
}

/**
 * Parse the station antenna list from localStorage.
 *
 * Invalid entries are dropped. A missing or unknown selectedId falls back to
 * the first remaining antenna.
 */
export function parseStationAntennaStore(raw: string | null): StationAntennaStore {
  const defaults = defaultStationAntennaStore();

  if (!raw) {
    return defaults;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return defaults;
    }

    const record = parsed as Record<string, unknown>;
    const stations = parseStationList(record.stations);
    const migratedStations = stations.length > 0 ? stations : [defaultHomeStation()];
    const fallbackStationId = migratedStations.some((station) => station.id === HOME_STATION_ID)
      ? HOME_STATION_ID
      : migratedStations[0]!.id;
    const antennas = parseAntennaList(record.antennas, fallbackStationId, migratedStations);
    const selectedStationId = resolveSelectedStationId(migratedStations, record.selectedStationId);
    const atStation = antennas.filter((antenna) => antenna.stationId === selectedStationId);
    const selectedId = resolveSelectedId(atStation, record.selectedId);

    return {
      stations: migratedStations,
      selectedStationId,
      antennas,
      selectedId,
    };
  } catch {
    return defaults;
  }
}

export function serializeStationAntennaStore(store: StationAntennaStore): string {
  const stations = store.stations
    .map((station) => normalizeRadioStation(station))
    .filter((station) => station !== undefined);
  const migratedStations = stations.length > 0 ? stations : [defaultHomeStation()];
  const fallbackStationId = migratedStations.some((station) => station.id === HOME_STATION_ID)
    ? HOME_STATION_ID
    : migratedStations[0]!.id;
  const antennas = store.antennas
    .map((antenna) => normalizeStationAntenna(antenna, fallbackStationId, migratedStations))
    .filter((antenna) => antenna !== undefined);
  const selectedStationId = resolveSelectedStationId(migratedStations, store.selectedStationId);
  const atStation = antennas.filter((antenna) => antenna.stationId === selectedStationId);

  return JSON.stringify({
    stations: migratedStations,
    selectedStationId,
    antennas,
    selectedId: resolveSelectedId(atStation, store.selectedId),
  });
}

export function readStationAntennaStore(): StationAntennaStore {
  if (!import.meta.client) {
    return defaultStationAntennaStore();
  }

  try {
    return parseStationAntennaStore(localStorage.getItem(STATION_ANTENNA_STORAGE_KEY));
  } catch {
    return defaultStationAntennaStore();
  }
}

export function writeStationAntennaStore(store: StationAntennaStore): void {
  if (!import.meta.client) {
    return;
  }

  localStorage.setItem(STATION_ANTENNA_STORAGE_KEY, serializeStationAntennaStore(store));
}

/**
 * Builds a persisted antenna from a draft. Empty nickname becomes the type label.
 */
export function createStationAntenna(
  draft: AntennaDraft,
  options: { id?: string; now?: number } = {},
): StationAntenna {
  const now = options.now ?? Date.now();
  const normalized = requireNormalizedDraft(draft);

  return {
    id: options.id ?? createAntennaId(now),
    stationId: normalized.stationId ?? HOME_STATION_ID,
    nickname: normalized.nickname,
    typeId: normalized.typeId,
    heightAglM: normalized.heightAglM,
    headingDeg: normalized.headingDeg,
    bands: normalized.bands,
    trapped: normalized.trapped,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Applies a draft to an existing antenna, preserving id and createdAt.
 */
export function updateStationAntenna(
  antenna: StationAntenna,
  draft: AntennaDraft,
  now: number = Date.now(),
): StationAntenna {
  const normalized = requireNormalizedDraft(draft);

  return {
    ...antenna,
    nickname: normalized.nickname,
    typeId: normalized.typeId,
    heightAglM: normalized.heightAglM,
    headingDeg: normalized.headingDeg,
    bands: normalized.bands,
    trapped: normalized.trapped,
    updatedAt: now,
  };
}

/**
 * Validates a draft for the editor. Returns field errors, or undefined when valid.
 */
export function antennaDraftErrors(draft: AntennaDraft): Partial<Record<keyof AntennaDraft, string>> | undefined {
  const errors: Partial<Record<keyof AntennaDraft, string>> = {};
  const type = antennaTypeById(draft.typeId);

  if (!type) {
    errors.typeId = 'Choose an antenna type.';
  }

  if (!Number.isFinite(draft.heightAglM)) {
    errors.heightAglM = 'Enter height in meters.';
  } else if (draft.heightAglM < MIN_ANTENNA_HEIGHT_AGL_M || draft.heightAglM > MAX_ANTENNA_HEIGHT_AGL_M) {
    errors.heightAglM = `Height must be between ${MIN_ANTENNA_HEIGHT_AGL_M} and ${MAX_ANTENNA_HEIGHT_AGL_M} m.`;
  }

  if (type && antennaTypeUsesHeading(type)) {
    if (draft.headingDeg === undefined || !Number.isFinite(Number(draft.headingDeg))) {
      errors.headingDeg = 'Enter a heading in degrees.';
    }
  }

  return Object.keys(errors).length > 0 ? errors : undefined;
}

/**
 * Inserts an antenna and selects it.
 */
export function addAntennaToStore(store: StationAntennaStore, antenna: StationAntenna): StationAntennaStore {
  const stationId = resolveAntennaStationId(store, antenna.stationId);
  const next = {
    ...antenna,
    stationId,
  };

  return {
    ...store,
    antennas: [...store.antennas, next],
    selectedStationId: stationId,
    selectedId: next.id,
  };
}

/**
 * Replaces one antenna in the store.
 */
export function replaceAntennaInStore(store: StationAntennaStore, antenna: StationAntenna): StationAntennaStore {
  return {
    ...store,
    antennas: store.antennas.map((entry) => (entry.id === antenna.id ? antenna : entry)),
  };
}

/**
 * Removes an antenna. Selection moves to the first remaining entry at this station.
 */
export function removeAntennaFromStore(store: StationAntennaStore, id: string): StationAntennaStore {
  const antennas = store.antennas.filter((antenna) => antenna.id !== id);
  const atStation = antennasAtStation({ ...store, antennas });

  return {
    ...store,
    antennas,
    selectedId: resolveSelectedId(atStation, store.selectedId === id ? undefined : store.selectedId),
  };
}

/**
 * Selects an owned antenna when the id exists, and selects its station.
 */
export function selectAntennaInStore(store: StationAntennaStore, id: string): StationAntennaStore {
  const antenna = store.antennas.find((entry) => entry.id === id);

  if (!antenna) {
    return store;
  }

  return {
    ...store,
    selectedStationId: antenna.stationId,
    selectedId: id,
  };
}

/**
 * Antennas assigned to a station. Defaults to the selected station.
 */
export function antennasAtStation(store: StationAntennaStore, stationId?: string): StationAntenna[] {
  const id = stationId ?? selectedRadioStation(store)?.id;

  if (!id) {
    return [];
  }

  return store.antennas.filter((antenna) => antenna.stationId === id);
}

/**
 * The selected site, or the first station in the list.
 */
export function selectedRadioStation(store: StationAntennaStore): RadioStation | undefined {
  const selectedStationId = resolveSelectedStationId(store.stations, store.selectedStationId);

  if (!selectedStationId) {
    return undefined;
  }

  return store.stations.find((station) => station.id === selectedStationId);
}

/**
 * The owned antenna currently selected at the selected station, or the first there.
 */
export function selectedStationAntenna(store: StationAntennaStore): StationAntenna | undefined {
  const atStation = antennasAtStation(store);
  const selectedId = resolveSelectedId(atStation, store.selectedId);

  if (!selectedId) {
    return undefined;
  }

  return atStation.find((antenna) => antenna.id === selectedId);
}

/**
 * View model for Propagation: owned selection or a what-if draft.
 */
export function resolveAntennaView(
  store: StationAntennaStore,
  source: AntennaViewSource,
  whatIf: AntennaWhatIf,
): ResolvedAntenna | undefined {
  if (source === 'what-if') {
    const type = antennaTypeById(whatIf.typeId);

    if (!type) {
      return undefined;
    }

    const heightAglM = clampHeight(whatIf.heightAglM) ?? type.defaultHeightAglM;
    const headingDeg = antennaTypeUsesHeading(type)
      ? normalizeHeadingDeg(whatIf.headingDeg) ?? type.defaultHeadingDeg
      : undefined;
    const bands = parseBands(whatIf.bands, type.defaultBands);
    const trapped = resolveTrapped(whatIf.trapped, type, bands) === true;

    return attachStationLocation(
      {
        source: 'what-if',
        type,
        heightAglM,
        headingDeg,
        bands,
        trapped,
        gainDbi: estimateGainDbi(type, trapped),
        takeoffDeg: estimateTakeoffDeg(type, heightAglM, bands[0]),
      },
      selectedRadioStation(store),
    );
  }

  const antenna = selectedStationAntenna(store);

  if (!antenna) {
    return undefined;
  }

  const type = antennaTypeById(antenna.typeId);

  if (!type) {
    return undefined;
  }

  const trapped = resolveTrapped(antenna.trapped, type, antenna.bands) === true;
  const station =
    store.stations.find((entry) => entry.id === antenna.stationId) ?? selectedRadioStation(store);

  return attachStationLocation(
    {
      source: 'station',
      id: antenna.id,
      nickname: antenna.nickname,
      type,
      heightAglM: antenna.heightAglM,
      headingDeg: antenna.headingDeg,
      bands: antenna.bands,
      trapped,
      gainDbi: estimateGainDbi(type, trapped),
      takeoffDeg: estimateTakeoffDeg(type, antenna.heightAglM, antenna.bands[0] ?? type.defaultBands[0]),
    },
    station,
  );
}

/**
 * Type, height, and heading without the nickname.
 */
export function formatAntennaGeometry(antenna: StationAntenna | ResolvedAntenna): string {
  const type = 'type' in antenna ? antenna.type : antennaTypeById(antenna.typeId);
  const height = formatHeightAglM(antenna.heightAglM);
  const heading = formatHeadingDeg(
    antenna.headingDeg,
    type ? antennaTypeUsesHeading(type) : antenna.headingDeg !== undefined,
  );
  const parts = [type?.label, height];

  if (heading) {
    parts.push(heading);
  }

  return parts.filter(Boolean).join(' · ');
}

/**
 * Nickname plus geometry. Omits a nickname that duplicates the type label.
 */
export function formatAntennaSummary(antenna: StationAntenna | ResolvedAntenna): string {
  const type = 'type' in antenna ? antenna.type : antennaTypeById(antenna.typeId);
  const nickname = 'nickname' in antenna ? antenna.nickname : undefined;
  const geometry = formatAntennaGeometry(antenna);

  if (nickname && nickname !== type?.label) {
    return `${nickname} · ${geometry}`;
  }

  return geometry;
}

/**
 * Formats height for display, dropping trailing zeros.
 */
export function formatHeightAglM(heightAglM: number): string {
  const rounded = Number.isInteger(heightAglM) ? String(heightAglM) : heightAglM.toFixed(1).replace(/\.0$/, '');

  return `${rounded} m AGL`;
}

/**
 * Formats a true heading, or undefined for omni.
 */
export function formatHeadingDeg(headingDeg: number | undefined, usesHeading: boolean): string | undefined {
  if (!usesHeading || headingDeg === undefined) {
    return undefined;
  }

  return `${Math.round(headingDeg).toString().padStart(3, '0')}°`;
}

/**
 * Formats band labels for a compact list.
 */
export function formatAntennaBands(bands: AntennaBandId[], trapped = false): string {
  const list = bands
    .map((id) => ANTENNA_BANDS.find((band) => band.id === id)?.label ?? id)
    .join(', ');
  const traps = trapped ? formatTrapSummary(bands) : undefined;

  return traps ? `${list} · ${traps}` : list;
}

/**
 * Draft used by the editor, copied from an owned antenna or a type default.
 */
export function draftFromStationAntenna(antenna: StationAntenna): AntennaDraft {
  return {
    nickname: antenna.nickname,
    typeId: antenna.typeId,
    heightAglM: antenna.heightAglM,
    headingDeg: antenna.headingDeg,
    bands: [...antenna.bands],
    trapped: antenna.trapped,
    stationId: antenna.stationId,
  };
}

/**
 * Applies a type change to a draft, resetting bands, height, and heading to that type.
 */
export function applyAntennaTypeToDraft(draft: AntennaDraft, typeId: AntennaTypeId): AntennaDraft {
  const next = defaultAntennaDraft(typeId);

  return {
    ...next,
    nickname: draft.nickname,
    stationId: draft.stationId,
  };
}

/**
 * Empty station editor draft.
 */
export function defaultStationDraft(): StationDraft {
  return {
    nickname: '',
  };
}

/**
 * Editor draft copied from a saved station.
 */
export function draftFromRadioStation(station: RadioStation): StationDraft {
  return {
    nickname: station.nickname,
    gridsquare: station.gridsquare,
    latitude: station.latitude,
    longitude: station.longitude,
    locationSource: station.locationSource,
  };
}

/**
 * Validates a station draft. Returns field errors, or undefined when valid.
 */
export function stationDraftErrors(draft: StationDraft): Partial<Record<keyof StationDraft, string>> | undefined {
  const errors: Partial<Record<keyof StationDraft, string>> = {};

  if (!optionalText(draft.nickname)) {
    errors.nickname = 'Enter a station name.';
  }

  const gridText = typeof draft.gridsquare === 'string' ? draft.gridsquare.trim() : '';

  if (gridText.length > 0 && !normalizeMaidenhead(gridText)) {
    errors.gridsquare = 'Use a 2-, 4-, or 6-character Maidenhead locator.';
  }

  const hasLatitude = draft.latitude !== undefined && draft.latitude !== null;
  const hasLongitude = draft.longitude !== undefined && draft.longitude !== null;

  if (hasLatitude !== hasLongitude) {
    errors.latitude = 'Enter both latitude and longitude.';
    errors.longitude = 'Enter both latitude and longitude.';
  } else if (hasLatitude && hasLongitude) {
    if (!isValidLatitude(draft.latitude)) {
      errors.latitude = `Latitude must be between ${MIN_LATITUDE} and ${MAX_LATITUDE}.`;
    }

    if (!isValidLongitude(draft.longitude)) {
      errors.longitude = `Longitude must be between ${MIN_LONGITUDE} and ${MAX_LONGITUDE}.`;
    }
  }

  return Object.keys(errors).length > 0 ? errors : undefined;
}

/**
 * Builds a persisted station from a draft.
 */
export function createRadioStation(draft: StationDraft, options: { id?: string; now?: number } = {}): RadioStation {
  const now = options.now ?? Date.now();
  const normalized = requireNormalizedStationDraft(draft);

  return {
    id: options.id ?? createStationId(now),
    nickname: normalized.nickname,
    gridsquare: normalized.gridsquare,
    latitude: normalized.latitude,
    longitude: normalized.longitude,
    locationSource: normalized.locationSource,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Applies a draft to an existing station, preserving id and createdAt.
 */
export function updateRadioStation(
  station: RadioStation,
  draft: StationDraft,
  now: number = Date.now(),
): RadioStation {
  const normalized = requireNormalizedStationDraft(draft);

  return {
    ...station,
    nickname: normalized.nickname,
    gridsquare: normalized.gridsquare,
    latitude: normalized.latitude,
    longitude: normalized.longitude,
    locationSource: normalized.locationSource,
    updatedAt: now,
  };
}

/**
 * Inserts a station and selects it. New sites start with no selected antenna.
 */
export function addStationToStore(store: StationAntennaStore, station: RadioStation): StationAntennaStore {
  return {
    ...store,
    stations: [...store.stations, station],
    selectedStationId: station.id,
    selectedId: undefined,
  };
}

/**
 * Replaces one station in the store.
 */
export function replaceStationInStore(store: StationAntennaStore, station: RadioStation): StationAntennaStore {
  return {
    ...store,
    stations: store.stations.map((entry) => (entry.id === station.id ? station : entry)),
  };
}

/**
 * Removes a station and its antennas. The last station cannot be removed.
 */
export function removeStationFromStore(store: StationAntennaStore, id: string): StationAntennaStore {
  if (store.stations.length <= 1 || !store.stations.some((station) => station.id === id)) {
    return store;
  }

  const stations = store.stations.filter((station) => station.id !== id);
  const antennas = store.antennas.filter((antenna) => antenna.stationId !== id);
  const selectedStationId =
    store.selectedStationId === id ? stations[0]?.id : resolveSelectedStationId(stations, store.selectedStationId);
  const atStation = antennas.filter((antenna) => antenna.stationId === selectedStationId);

  return {
    stations,
    selectedStationId,
    antennas,
    selectedId: resolveSelectedId(atStation, store.selectedId),
  };
}

/**
 * Selects a station and an antenna at that site.
 */
export function selectStationInStore(store: StationAntennaStore, id: string): StationAntennaStore {
  if (!store.stations.some((station) => station.id === id)) {
    return store;
  }

  const atStation = antennasAtStation(store, id);

  return {
    ...store,
    selectedStationId: id,
    selectedId: resolveSelectedId(atStation, store.selectedId),
  };
}

/**
 * Copies a license grid onto Home only when Home has no grid and no coordinates.
 */
export function applyLicenseGridToHomeIfEmpty(
  store: StationAntennaStore,
  gridsquare: string | undefined,
  now: number = Date.now(),
): StationAntennaStore {
  const home = store.stations.find((station) => station.id === HOME_STATION_ID);

  if (!home || hasStationLocation(home)) {
    return store;
  }

  const grid = normalizeMaidenhead(gridsquare);

  if (!grid) {
    return store;
  }

  const next = updateRadioStation(
    home,
    {
      nickname: home.nickname,
      gridsquare: grid,
      locationSource: 'grid',
    },
    now,
  );

  return replaceStationInStore(store, next);
}

/**
 * Grid plus DMS coordinates, or a short empty-state label.
 */
export function formatStationLocation(station: RadioStation | ResolvedAntenna): string {
  const grid = station.gridsquare;
  const latitude = station.latitude;
  const longitude = station.longitude;

  if (grid && isValidLatitude(latitude) && isValidLongitude(longitude)) {
    return `${grid} · ${formatLatitude(latitude)} ${formatLongitude(longitude)}`;
  }

  if (grid) {
    return grid;
  }

  if (isValidLatitude(latitude) && isValidLongitude(longitude)) {
    return `${formatLatitude(latitude)} ${formatLongitude(longitude)}`;
  }

  return 'Location not set';
}

/**
 * Nickname plus location. Omits location when it is not set.
 */
export function formatStationSummary(station: RadioStation): string {
  const location = formatStationLocation(station);

  if (location === 'Location not set') {
    return station.nickname;
  }

  return `${station.nickname} · ${location}`;
}

export function hasStationLocation(station: RadioStation): boolean {
  return Boolean(
    station.gridsquare || (isValidLatitude(station.latitude) && isValidLongitude(station.longitude)),
  );
}

/**
 * Resolves grid vs coordinates. Grid edits become the cell center; coordinate edits keep the point and derive a 6-character grid.
 */
export function resolveStationLocation(draft: StationDraft): Pick<
  RadioStation,
  'gridsquare' | 'latitude' | 'longitude' | 'locationSource'
> {
  const source =
    draft.locationSource ??
    (isValidLatitude(draft.latitude) && isValidLongitude(draft.longitude)
      ? 'coordinates'
      : normalizeMaidenhead(draft.gridsquare)
        ? 'grid'
        : undefined);

  if (source === 'coordinates' && isValidLatitude(draft.latitude) && isValidLongitude(draft.longitude)) {
    const latitude = roundCoord(draft.latitude);
    const longitude = roundCoord(draft.longitude);

    return {
      latitude,
      longitude,
      gridsquare: latLonToMaidenhead(latitude, longitude, 6),
      locationSource: 'coordinates',
    };
  }

  const grid = normalizeMaidenhead(draft.gridsquare);

  if (source === 'grid' || grid) {
    if (!grid) {
      return {};
    }

    const point = maidenheadToLatLon(grid);

    return {
      gridsquare: grid,
      latitude: point?.latitude,
      longitude: point?.longitude,
      locationSource: 'grid',
    };
  }

  return {};
}

function parseAntennaList(
  value: unknown,
  fallbackStationId: string,
  stations: RadioStation[],
): StationAntenna[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const antennas: StationAntenna[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    const antenna = normalizeStationAntenna(entry, fallbackStationId, stations);

    if (!antenna || seen.has(antenna.id)) {
      continue;
    }

    seen.add(antenna.id);
    antennas.push(antenna);
  }

  return antennas;
}

function normalizeStationAntenna(
  value: unknown,
  fallbackStationId: string,
  stations: RadioStation[],
): StationAntenna | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const typeId = isAntennaTypeId(record.typeId) ? record.typeId : undefined;
  const type = antennaTypeById(typeId);
  const id = optionalText(record.id);
  const createdAt = optionalTimestamp(record.createdAt);
  const updatedAt = optionalTimestamp(record.updatedAt) ?? createdAt;

  if (!type || !id || createdAt === undefined || updatedAt === undefined) {
    return undefined;
  }

  const heightAglM = clampHeight(record.heightAglM);

  if (heightAglM === undefined) {
    return undefined;
  }

  const nickname = optionalText(record.nickname) ?? type.label;
  const bands = parseBands(record.bands, type.defaultBands);
  const headingDeg = antennaTypeUsesHeading(type)
    ? normalizeHeadingDeg(record.headingDeg) ?? type.defaultHeadingDeg
    : undefined;
  const trapped = resolveTrapped(record.trapped, type, bands);

  return {
    id,
    stationId: resolveStoredStationId(record.stationId, fallbackStationId, stations),
    nickname,
    typeId: type.id,
    heightAglM,
    headingDeg,
    bands,
    trapped,
    createdAt,
    updatedAt,
  };
}

function requireNormalizedDraft(draft: AntennaDraft): AntennaDraft {
  const errors = antennaDraftErrors(draft);
  const type = antennaTypeById(draft.typeId);

  if (errors || !type) {
    throw new Error(errors?.typeId ?? errors?.heightAglM ?? errors?.headingDeg ?? 'Invalid antenna');
  }

  const bands = parseBands(draft.bands, type.defaultBands);

  return {
    nickname: optionalText(draft.nickname) ?? type.label,
    typeId: type.id,
    heightAglM: clampHeight(draft.heightAglM) ?? type.defaultHeightAglM,
    headingDeg: antennaTypeUsesHeading(type)
      ? normalizeHeadingDeg(draft.headingDeg) ?? type.defaultHeadingDeg
      : undefined,
    bands,
    trapped: resolveTrapped(draft.trapped, type, bands),
    stationId: optionalText(draft.stationId),
  };
}

function resolveTrapped(value: unknown, type: AntennaType, bands: AntennaBandId[]): boolean | undefined {
  const requested = value === true ? true : value === false ? false : type.defaultTrapped;

  if (!antennaIsTrapped(type, requested, bands)) {
    return undefined;
  }

  return true;
}

function parseBands(value: unknown, fallback: AntennaBandId[]): AntennaBandId[] {
  if (!Array.isArray(value)) {
    return sortAntennaBands(fallback);
  }

  const bands: AntennaBandId[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (!isAntennaBandId(entry) || seen.has(entry)) {
      continue;
    }

    seen.add(entry);
    bands.push(entry);
  }

  return bands.length > 0 ? sortAntennaBands(bands) : sortAntennaBands(fallback);
}

function resolveSelectedId(antennas: StationAntenna[], selectedId: unknown): string | undefined {
  if (typeof selectedId === 'string' && antennas.some((antenna) => antenna.id === selectedId)) {
    return selectedId;
  }

  return antennas[0]?.id;
}

function clampHeight(value: unknown): number | undefined {
  const height = typeof value === 'string' ? Number(value) : value;

  if (typeof height !== 'number' || !Number.isFinite(height)) {
    return undefined;
  }

  if (height < MIN_ANTENNA_HEIGHT_AGL_M || height > MAX_ANTENNA_HEIGHT_AGL_M) {
    return undefined;
  }

  return Math.round(height * 10) / 10;
}

function normalizeHeadingDeg(value: unknown): number | undefined {
  const heading = typeof value === 'string' ? Number(value) : value;

  if (typeof heading !== 'number' || !Number.isFinite(heading)) {
    return undefined;
  }

  const rounded = Math.round(heading);
  const wrapped = ((rounded % 360) + 360) % 360;

  return wrapped;
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  const timestamp = Math.trunc(value);

  // 0 was used for the synthetic Home before stations had a clock; keep the row.
  return timestamp > 0 ? timestamp : 1;
}

function createAntennaId(now: number): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `antenna-${now}`;
}

function createStationId(now: number): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `station-${now}`;
}

function parseStationList(value: unknown): RadioStation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const stations: RadioStation[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    const station = normalizeRadioStation(entry);

    if (!station || seen.has(station.id)) {
      continue;
    }

    seen.add(station.id);
    stations.push(station);
  }

  return stations;
}

function normalizeRadioStation(value: unknown): RadioStation | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const id = optionalText(record.id);
  const nickname = optionalText(record.nickname);
  const createdAt = optionalTimestamp(record.createdAt);
  const updatedAt = optionalTimestamp(record.updatedAt) ?? createdAt;

  if (!id || !nickname || createdAt === undefined || updatedAt === undefined) {
    return undefined;
  }

  const gridsquare = normalizeMaidenhead(record.gridsquare);
  const latitude = optionalCoord(record.latitude, isValidLatitude);
  const longitude = optionalCoord(record.longitude, isValidLongitude);
  const locationSource =
    record.locationSource === 'grid' || record.locationSource === 'coordinates'
      ? record.locationSource
      : undefined;

  return {
    id,
    nickname,
    gridsquare,
    latitude,
    longitude,
    locationSource,
    createdAt,
    updatedAt,
  };
}

function requireNormalizedStationDraft(draft: StationDraft): StationDraft {
  const errors = stationDraftErrors(draft);

  if (errors) {
    throw new Error(
      errors.nickname ?? errors.gridsquare ?? errors.latitude ?? errors.longitude ?? 'Invalid station',
    );
  }

  const location = resolveStationLocation(draft);

  return {
    nickname: optionalText(draft.nickname) ?? 'Station',
    gridsquare: location.gridsquare,
    latitude: location.latitude,
    longitude: location.longitude,
    locationSource: location.locationSource,
  };
}

function resolveSelectedStationId(stations: RadioStation[], selectedStationId: unknown): string | undefined {
  if (typeof selectedStationId === 'string' && stations.some((station) => station.id === selectedStationId)) {
    return selectedStationId;
  }

  return stations[0]?.id;
}

function resolveAntennaStationId(store: StationAntennaStore, stationId: string | undefined): string {
  if (stationId && store.stations.some((station) => station.id === stationId)) {
    return stationId;
  }

  return selectedRadioStation(store)?.id ?? HOME_STATION_ID;
}

function resolveStoredStationId(
  value: unknown,
  fallbackStationId: string,
  stations: RadioStation[],
): string {
  const stationId = optionalText(value);

  if (stationId && stations.some((station) => station.id === stationId)) {
    return stationId;
  }

  return fallbackStationId;
}

function attachStationLocation(view: ResolvedAntenna, station: RadioStation | undefined): ResolvedAntenna {
  if (!station) {
    return view;
  }

  return {
    ...view,
    stationId: station.id,
    stationNickname: station.nickname,
    gridsquare: station.gridsquare,
    latitude: station.latitude,
    longitude: station.longitude,
  };
}

function optionalCoord(
  value: unknown,
  isValid: (coord: number) => boolean,
): number | undefined {
  const coord = typeof value === 'string' ? Number(value) : value;

  if (typeof coord !== 'number' || !isValid(coord)) {
    return undefined;
  }

  return roundCoord(coord);
}

function roundCoord(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
