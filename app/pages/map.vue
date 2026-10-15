<script setup lang="ts">
import {
  LngLatBounds,
  Popup,
  type GeoJSONSource,
  type LngLatLike,
  type Map as MapLibreMap,
  type MapGeoJSONFeature,
} from 'maplibre-gl';
import {
  CHANNEL_MAP_EMPTY_STYLE,
  channelMapBandColor,
  channelMapBandColorExpression,
  channelMapBounds,
  channelMapLegendBands,
} from '~/utils/channel-map';
import { mapDevFixture } from '~/utils/map-dev-fixture';
import {
  mapChannelFeatures,
  mapChannelRows,
  mapChannelUnlocatedCount,
  mapChannelUnlocatedMessage,
  MAP_QSO_GRID_CENTER_NOTE,
  MAP_STATION_OTHER_PIN_COLOR,
  mapQsoFeatures,
  mapQsoUnmappedCount,
  mapQsoUnmappedMessage,
  mapRepeaterChannels,
  mapRepeaterFeatures,
  mapRepeaterUnlocatedCount,
  mapRepeaterUnlocatedMessage,
  mapStationAntennas,
  mapStationFeatures,
  mapStationHomeUnlocatedMessage,
  mapStationOtherUnlocatedMessage,
  storedLibraryGroups,
} from '~/utils/map-page-layers';
import { antennaTypeById } from '~/utils/antenna-types';
import { formatStationLocation, type RadioStation } from '~/utils/antenna-station';
import {
  MAP_PAGE_ALL_STORED_GROUPS,
  readMapPageSettings,
  writeMapPageSettings,
  type MapPageSettings,
} from '~/utils/map-page-settings';
import {
  QSL_MARKER_COLOR,
  qslStatusLabel,
  resolveMapStyleUrl,
  STATION_PIN_COLOR,
  stationLogMapPoints,
  type StationLogMapPoint,
} from '~/utils/station-log-map';
import type { SavedChannel } from '~/utils/saved-channels-db';

const MAP_CONTACT_POPUP_MAX_CALLS = 20;

useHead({ title: 'Map' });

interface ClusterLayerIds {
  sourceId: string;
  clusterLayerId: string;
  clusterCountLayerId: string;
  unclusteredLayerId: string;
}

const REPEATER_LAYER_IDS: ClusterLayerIds = {
  sourceId: 'map-repeaters',
  clusterLayerId: 'map-repeaters-clusters',
  clusterCountLayerId: 'map-repeaters-cluster-count',
  unclusteredLayerId: 'map-repeaters-unclustered',
};

const CHANNEL_LAYER_IDS: ClusterLayerIds = {
  sourceId: 'map-channels',
  clusterLayerId: 'map-channels-clusters',
  clusterCountLayerId: 'map-channels-cluster-count',
  unclusteredLayerId: 'map-channels-unclustered',
};

const CONTACT_LAYER_IDS: ClusterLayerIds = {
  sourceId: 'map-contacts',
  clusterLayerId: 'map-contacts-clusters',
  clusterCountLayerId: 'map-contacts-cluster-count',
  unclusteredLayerId: 'map-contacts-unclustered',
};

const STATION_SOURCE_ID = 'map-stations';
const STATION_HOME_LAYER_ID = 'map-stations-home';
const STATION_OTHER_LAYER_ID = 'map-stations-other';
const STATION_HOME_PIN_IMAGE_ID = 'map-page-station-home-pin';
const STATION_OTHER_PIN_IMAGE_ID = 'map-page-station-other-pin';

const route = useRoute();
const colorMode = useColorMode();
const { mapStyle, customMapStyleUrl } = useAppearanceSettings();
const { channels: libraryChannels, groups: allGroups, memberships, refresh } = useSavedChannels();
const { qsos: libraryQsos, refresh: refreshStationLog } = useStationLog();
const { stations: libraryStations, antennas: libraryAntennas } = useStationAntennas();

const useFixture = computed(() => import.meta.dev && route.query.fixture === 'map');

const fixture = computed(() => (useFixture.value ? mapDevFixture() : undefined));

const channels = computed(() => fixture.value?.channels ?? libraryChannels.value);
const groups = computed(() => fixture.value?.groups ?? allGroups.value);
const groupMemberships = computed(() => fixture.value?.memberships ?? memberships.value);
const logQsos = computed(() => fixture.value?.qsos ?? libraryQsos.value);
const mapStations = computed(() => fixture.value?.stations ?? libraryStations.value);
const mapAntennas = computed(() => fixture.value?.antennas ?? libraryAntennas.value);

const storedGroups = computed(() => storedLibraryGroups(groups.value));

const pageSettings = ref<MapPageSettings>(readMapPageSettings());

const mapCanvas = useTemplateRef('mapCanvas');
const loadError = shallowRef<string | undefined>();
const usingEmptyStyle = shallowRef(false);

const styleUrl = computed(() => resolveMapStyleUrl(mapStyle.value, colorMode.value, customMapStyleUrl.value));

const repeaterRows = computed(() =>
  mapRepeaterChannels(channels.value, groupMemberships.value, groups.value, pageSettings.value.groupSelection),
);

const repeaterFeatureCollection = computed(() => {
  if (!pageSettings.value.repeaters) {
    return { type: 'FeatureCollection' as const, features: [] };
  }

  return mapRepeaterFeatures(
    channels.value,
    groupMemberships.value,
    groups.value,
    pageSettings.value.groupSelection,
  );
});

const channelRows = computed(() =>
  mapChannelRows(channels.value, groupMemberships.value, groups.value, pageSettings.value.groupSelection),
);

const channelFeatureCollection = computed(() => {
  if (!pageSettings.value.channels) {
    return { type: 'FeatureCollection' as const, features: [] };
  }

  return mapChannelFeatures(
    channels.value,
    groupMemberships.value,
    groups.value,
    pageSettings.value.groupSelection,
  );
});

const contactFeatureCollection = computed(() => {
  if (!pageSettings.value.log) {
    return { type: 'FeatureCollection' as const, features: [] };
  }

  return mapQsoFeatures(logQsos.value);
});

const contactPoints = computed(() => stationLogMapPoints(logQsos.value));

const contactPointByGrid = computed(() => {
  const byGrid = new Map<string, StationLogMapPoint>();

  for (const point of contactPoints.value) {
    byGrid.set(point.grid, point);
  }

  return byGrid;
});

const contactUnmappedCount = computed(() => mapQsoUnmappedCount(logQsos.value));

const contactUnmappedMessage = computed(() =>
  mapQsoUnmappedMessage(contactUnmappedCount.value, logQsos.value.length),
);

const stationFeatureCollection = computed(() => {
  if (!pageSettings.value.stations) {
    return { type: 'FeatureCollection' as const, features: [] };
  }

  return mapStationFeatures(mapStations.value);
});

const stationById = computed(() => {
  const byId = new Map<string, RadioStation>();

  for (const station of mapStations.value) {
    byId.set(station.id, station);
  }

  return byId;
});

const stationHomeUnlocatedMessage = computed(() => mapStationHomeUnlocatedMessage(mapStations.value));

const stationOtherUnlocatedMessage = computed(() => mapStationOtherUnlocatedMessage(mapStations.value));

const contactLegend = computed(() => {
  const items: { key: string; label: string; color: string }[] = [
    { key: 'none', label: 'No card', color: QSL_MARKER_COLOR.none },
    { key: 'sent', label: 'Card sent', color: QSL_MARKER_COLOR.sent },
    { key: 'received', label: 'Card received', color: QSL_MARKER_COLOR.received },
    { key: 'both', label: 'Both', color: QSL_MARKER_COLOR.both },
  ];

  if (contactPoints.value.some((point) => point.status === 'mixed')) {
    items.push({ key: 'mixed', label: 'Mixed', color: QSL_MARKER_COLOR.mixed });
  }

  return items;
});

const repeaterUnlocatedCount = computed(() =>
  mapRepeaterUnlocatedCount(
    channels.value,
    groupMemberships.value,
    groups.value,
    pageSettings.value.groupSelection,
  ),
);

const channelUnlocatedCount = computed(() =>
  mapChannelUnlocatedCount(
    channels.value,
    groupMemberships.value,
    groups.value,
    pageSettings.value.groupSelection,
  ),
);

const repeaterUnlocatedMessage = computed(() =>
  mapRepeaterUnlocatedMessage(repeaterUnlocatedCount.value, repeaterRows.value.length),
);

const channelUnlocatedMessage = computed(() =>
  mapChannelUnlocatedMessage(channelUnlocatedCount.value, channelRows.value.length),
);

const repeaterLegend = computed(() =>
  channelMapLegendBands(repeaterFeatureCollection.value.features).map((band) => ({
    band,
    color: channelMapBandColor(band),
  })),
);

const channelLegend = computed(() =>
  channelMapLegendBands(channelFeatureCollection.value.features).map((band) => ({
    band,
    color: channelMapBandColor(band),
  })),
);

const groupItems = computed(() => storedGroups.value.map((group) => ({ id: group.id, label: group.name })));

const selectedGroupIds = computed({
  get(): string[] {
    const ids = storedGroups.value.map((group) => group.id);

    if (pageSettings.value.groupSelection === MAP_PAGE_ALL_STORED_GROUPS) {
      return ids;
    }

    return pageSettings.value.groupSelection.filter((groupId) => ids.includes(groupId));
  },
  set(value: string[]) {
    const storedIds = storedGroups.value.map((group) => group.id);
    const allSelected =
      value.length === storedIds.length && storedIds.every((groupId) => value.includes(groupId));

    pageSettings.value = {
      ...pageSettings.value,
      groupSelection: allSelected ? MAP_PAGE_ALL_STORED_GROUPS : value,
    };
    writeMapPageSettings(pageSettings.value);
  },
});

let popup: Popup | undefined;
let listenersBound = false;
let stationNicknamesShown: boolean | undefined;
let mapReady = false;
let suppressCameraSave = false;
let cameraSaveTimer: ReturnType<typeof setTimeout> | undefined;
function mapInstance(): MapLibreMap | undefined {
  return mapCanvas.value?.map;
}

function geoJsonSource(instance: MapLibreMap, sourceId: string): GeoJSONSource | undefined {
  const source = instance.getSource(sourceId);

  if (!source || source.type !== 'geojson') {
    return undefined;
  }

  return source;
}

function persistSettings(): void {
  writeMapPageSettings(pageSettings.value);
}

function restoreCamera(instance: MapLibreMap): void {
  const camera = pageSettings.value.camera;

  if (!camera) {
    return;
  }

  suppressCameraSave = true;
  instance.jumpTo({
    center: [camera.longitude, camera.latitude],
    zoom: camera.zoom,
  });
  window.setTimeout(() => {
    suppressCameraSave = false;
  }, 0);
}

function scheduleCameraSave(instance: MapLibreMap): void {
  if (suppressCameraSave) {
    return;
  }

  if (cameraSaveTimer) {
    clearTimeout(cameraSaveTimer);
  }

  cameraSaveTimer = setTimeout(() => {
    const center = instance.getCenter();
    const zoom = instance.getZoom();

    pageSettings.value = {
      ...pageSettings.value,
      camera: {
        longitude: center.lng,
        latitude: center.lat,
        zoom,
      },
    };
    persistSettings();
  }, 300);
}

function qslCircleColorExpression(): ['match', ...unknown[]] {
  return [
    'match',
    ['get', 'status'],
    'sent',
    QSL_MARKER_COLOR.sent,
    'received',
    QSL_MARKER_COLOR.received,
    'both',
    QSL_MARKER_COLOR.both,
    'mixed',
    QSL_MARKER_COLOR.mixed,
    QSL_MARKER_COLOR.none,
  ];
}

function stationPinImage(fillColor: string): ImageData | undefined {
  const displayWidth = 18;
  const displayHeight = 24;
  const pixelRatio = 2;
  const canvas = document.createElement('canvas');
  canvas.width = displayWidth * pixelRatio;
  canvas.height = displayHeight * pixelRatio;
  const context = canvas.getContext('2d');

  if (!context) {
    return undefined;
  }

  context.scale(pixelRatio, pixelRatio);
  context.beginPath();
  context.moveTo(9, 22);
  context.bezierCurveTo(9, 22, 2, 13, 2, 8);
  context.arc(9, 8, 7, Math.PI, 0);
  context.bezierCurveTo(16, 13, 9, 22, 9, 22);
  context.closePath();
  context.fillStyle = fillColor;
  context.fill();
  context.lineWidth = 1.25;
  context.strokeStyle = '#ffffff';
  context.stroke();
  context.beginPath();
  context.arc(9, 8, 2.4, 0, Math.PI * 2);
  context.fillStyle = '#ffffff';
  context.fill();

  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function ensureStationPinImages(instance: MapLibreMap): void {
  if (!instance.hasImage(STATION_HOME_PIN_IMAGE_ID)) {
    const homeImage = stationPinImage(STATION_PIN_COLOR);

    if (homeImage) {
      instance.addImage(STATION_HOME_PIN_IMAGE_ID, homeImage, { pixelRatio: 2 });
    }
  }

  if (!instance.hasImage(STATION_OTHER_PIN_IMAGE_ID)) {
    const otherImage = stationPinImage(MAP_STATION_OTHER_PIN_COLOR);

    if (otherImage) {
      instance.addImage(STATION_OTHER_PIN_IMAGE_ID, otherImage, { pixelRatio: 2 });
    }
  }
}

function ensureOtherStationLayer(instance: MapLibreMap, showSymbols: boolean): void {
  if (instance.getLayer(STATION_OTHER_LAYER_ID)) {
    instance.removeLayer(STATION_OTHER_LAYER_ID);
  }

  instance.addLayer({
    id: STATION_OTHER_LAYER_ID,
    type: 'symbol',
    source: STATION_SOURCE_ID,
    filter: ['==', ['get', 'role'], 'station'],
    layout: showSymbols
      ? {
          'icon-image': STATION_OTHER_PIN_IMAGE_ID,
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'text-field': ['get', 'nickname'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
          'text-anchor': 'top',
          'text-offset': [0, 0.15],
          'text-optional': true,
        }
      : {
          'icon-image': STATION_OTHER_PIN_IMAGE_ID,
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
        },
    paint: showSymbols
      ? {
          'text-color': '#f8fafc',
          'text-halo-color': '#0f172a',
          'text-halo-width': 1.25,
        }
      : {},
  });
}

function ensureStationLayers(instance: MapLibreMap, showSymbols: boolean): void {
  ensureStationPinImages(instance);

  if (!instance.getSource(STATION_SOURCE_ID)) {
    stationNicknamesShown = undefined;
    instance.addSource(STATION_SOURCE_ID, {
      type: 'geojson',
      data: stationFeatureCollection.value,
    });
  }

  if (!instance.getLayer(STATION_HOME_LAYER_ID)) {
    instance.addLayer({
      id: STATION_HOME_LAYER_ID,
      type: 'symbol',
      source: STATION_SOURCE_ID,
      filter: ['==', ['get', 'role'], 'home'],
      layout: {
        'icon-image': STATION_HOME_PIN_IMAGE_ID,
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
      },
    });
  }

  if (!instance.getLayer(STATION_OTHER_LAYER_ID)) {
    stationNicknamesShown = undefined;
  }

  if (stationNicknamesShown !== showSymbols) {
    ensureOtherStationLayer(instance, showSymbols);
    stationNicknamesShown = showSymbols;
  }
}

function ensureContactClusterLayers(
  instance: MapLibreMap,
  data: typeof contactFeatureCollection.value,
  showSymbols: boolean,
): void {
  const ids = CONTACT_LAYER_IDS;

  if (!instance.getSource(ids.sourceId)) {
    instance.addSource(ids.sourceId, {
      type: 'geojson',
      data,
      cluster: true,
      clusterMaxZoom: 12,
      clusterRadius: 50,
    });

    instance.addLayer({
      id: ids.clusterLayerId,
      type: 'circle',
      source: ids.sourceId,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#334155',
        'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 25, 22],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.92,
      },
    });

    if (showSymbols) {
      instance.addLayer({
        id: ids.clusterCountLayerId,
        type: 'symbol',
        source: ids.sourceId,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
        },
        paint: {
          'text-color': '#f8fafc',
        },
      });
    }

    instance.addLayer({
      id: ids.unclusteredLayerId,
      type: 'circle',
      source: ids.sourceId,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': qslCircleColorExpression(),
        'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 6, 8, 14],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.95,
      },
    });
  } else if (showSymbols && !instance.getLayer(ids.clusterCountLayerId)) {
    instance.addLayer({
      id: ids.clusterCountLayerId,
      type: 'symbol',
      source: ids.sourceId,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 12,
      },
      paint: {
        'text-color': '#f8fafc',
      },
    });
  } else if (!showSymbols && instance.getLayer(ids.clusterCountLayerId)) {
    instance.removeLayer(ids.clusterCountLayerId);
  }
}

function ensureClusterLayers(
  instance: MapLibreMap,
  ids: ClusterLayerIds,
  data: typeof repeaterFeatureCollection.value,
  showSymbols: boolean,
): void {
  if (!instance.getSource(ids.sourceId)) {
    instance.addSource(ids.sourceId, {
      type: 'geojson',
      data,
      cluster: true,
      clusterMaxZoom: 12,
      clusterRadius: 50,
    });

    instance.addLayer({
      id: ids.clusterLayerId,
      type: 'circle',
      source: ids.sourceId,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#334155',
        'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 25, 22],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.92,
      },
    });

    if (showSymbols) {
      instance.addLayer({
        id: ids.clusterCountLayerId,
        type: 'symbol',
        source: ids.sourceId,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
        },
        paint: {
          'text-color': '#f8fafc',
        },
      });
    }

    instance.addLayer({
      id: ids.unclusteredLayerId,
      type: 'circle',
      source: ids.sourceId,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': channelMapBandColorExpression(),
        'circle-radius': 7,
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.95,
      },
    });
  } else if (showSymbols && !instance.getLayer(ids.clusterCountLayerId)) {
    instance.addLayer({
      id: ids.clusterCountLayerId,
      type: 'symbol',
      source: ids.sourceId,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 12,
      },
      paint: {
        'text-color': '#f8fafc',
      },
    });
  } else if (!showSymbols && instance.getLayer(ids.clusterCountLayerId)) {
    instance.removeLayer(ids.clusterCountLayerId);
  }
}

function ensureLayers(instance: MapLibreMap): void {
  const showSymbols = !usingEmptyStyle.value;

  ensureClusterLayers(instance, REPEATER_LAYER_IDS, repeaterFeatureCollection.value, showSymbols);
  ensureClusterLayers(instance, CHANNEL_LAYER_IDS, channelFeatureCollection.value, showSymbols);
  ensureContactClusterLayers(instance, contactFeatureCollection.value, showSymbols);
  ensureStationLayers(instance, showSymbols);
}

function syncData(instance: MapLibreMap): void {
  ensureLayers(instance);
  geoJsonSource(instance, REPEATER_LAYER_IDS.sourceId)?.setData(repeaterFeatureCollection.value);
  geoJsonSource(instance, CHANNEL_LAYER_IDS.sourceId)?.setData(channelFeatureCollection.value);
  geoJsonSource(instance, CONTACT_LAYER_IDS.sourceId)?.setData(contactFeatureCollection.value);
  geoJsonSource(instance, STATION_SOURCE_ID)?.setData(stationFeatureCollection.value);
}

function fitVisible(instance: MapLibreMap): void {
  const features = [
    ...repeaterFeatureCollection.value.features,
    ...channelFeatureCollection.value.features,
    ...contactFeatureCollection.value.features,
    ...stationFeatureCollection.value.features,
  ];

  if (features.length === 0) {
    instance.easeTo({ center: [0, 15], zoom: 1.2, duration: 300 });
    return;
  }

  const bounds = channelMapBounds(features);

  if (!bounds) {
    instance.easeTo({ center: [0, 15], zoom: 1.2, duration: 300 });
    return;
  }

  const box = new LngLatBounds(
    [bounds.minLongitude, bounds.minLatitude],
    [bounds.maxLongitude, bounds.maxLatitude],
  );

  instance.fitBounds(box, { padding: 48, maxZoom: 11, duration: 300 });
}

function channelFromFeature(feature: MapGeoJSONFeature): SavedChannel | undefined {
  const id = feature.properties?.id;

  if (typeof id !== 'string') {
    return undefined;
  }

  return (
    repeaterRows.value.find((channel) => String(channel.id) === id) ??
    channelRows.value.find((channel) => String(channel.id) === id)
  );
}

function setPopup(next: Popup | undefined): void {
  popup?.remove();
  popup = next;
  mapCanvas.value?.registerPopup(popup);
}

function openStationPopup(stationId: string, lngLat: LngLatLike): void {
  const instance = mapInstance();
  const station = stationById.value.get(stationId);

  if (!instance || !station) {
    return;
  }

  const root = document.createElement('div');
  root.style.color = '#0f172a';

  const title = document.createElement('div');
  title.style.fontWeight = '600';
  title.textContent = station.nickname;
  root.append(title);

  const place = document.createElement('div');
  place.textContent = formatStationLocation(station);
  root.append(place);

  const antennas = mapStationAntennas(station.id, mapAntennas.value);

  if (antennas.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = 'No antennas at this station.';
    root.append(empty);
  } else {
    const list = document.createElement('ul');
    list.style.margin = '0.35rem 0 0';
    list.style.paddingLeft = '1.1rem';

    for (const antenna of antennas) {
      const type = antennaTypeById(antenna.typeId);
      const label = antenna.nickname.trim() || type?.label || 'Antenna';
      const item = document.createElement('li');
      item.textContent = type ? `${label} · ${type.label}` : label;
      list.append(item);
    }

    root.append(list);
  }

  setPopup(
    new Popup({ closeButton: true, maxWidth: '280px' }).setLngLat(lngLat).setDOMContent(root).addTo(instance),
  );
}

function openContactPopup(grid: string, lngLat: LngLatLike): void {
  const instance = mapInstance();
  const point = contactPointByGrid.value.get(grid);

  if (!instance || !point) {
    return;
  }

  const feature = contactFeatureCollection.value.features.find((entry) => entry.properties.grid === grid);
  const precisionLabel = feature?.properties.precisionLabel ?? '';

  const root = document.createElement('div');
  root.style.color = '#0f172a';

  const title = document.createElement('div');
  title.style.fontWeight = '600';
  title.textContent = grid;
  root.append(title);

  if (precisionLabel) {
    const precision = document.createElement('div');
    precision.textContent = precisionLabel;
    root.append(precision);
  }

  const status = document.createElement('div');
  status.textContent = qslStatusLabel(point.status);
  root.append(status);

  const sorted = [...point.qsos].sort((left, right) =>
    left.theirCallsign.localeCompare(right.theirCallsign),
  );
  const shown = sorted.slice(0, MAP_CONTACT_POPUP_MAX_CALLS);
  const remaining = sorted.length - shown.length;

  const list = document.createElement('ul');
  list.style.margin = '0.35rem 0 0';
  list.style.paddingLeft = '1.1rem';

  for (const qso of shown) {
    const item = document.createElement('li');
    item.textContent = qso.theirCallsign;
    list.append(item);
  }

  root.append(list);

  if (remaining > 0) {
    const more = document.createElement('div');
    more.textContent = `and ${remaining} more`;
    root.append(more);
  }

  setPopup(
    new Popup({ closeButton: true, maxWidth: '280px' }).setLngLat(lngLat).setDOMContent(root).addTo(instance),
  );
}

function openChannelPopup(channel: SavedChannel, lngLat: LngLatLike): void {
  const instance = mapInstance();

  if (!instance) {
    return;
  }

  const feature =
    repeaterFeatureCollection.value.features.find((entry) => entry.properties.id === String(channel.id)) ??
    channelFeatureCollection.value.features.find((entry) => entry.properties.id === String(channel.id));
  const properties = feature?.properties;

  const root = document.createElement('div');
  root.style.color = '#0f172a';

  const title = document.createElement('div');
  title.style.fontWeight = '600';
  title.textContent = channel.callsign || channel.name || 'Channel';
  root.append(title);

  if (channel.callsign && channel.name) {
    const name = document.createElement('div');
    name.textContent = channel.name;
    root.append(name);
  }

  if (properties) {
    const frequency = document.createElement('div');
    frequency.textContent = `TX ${properties.transmitLabel} · RX ${properties.receiveLabel}`;
    root.append(frequency);

    const toneParts: string[] = [];

    if (properties.transmitToneLabel) {
      toneParts.push(`TX ${properties.transmitToneLabel}`);
    }

    if (properties.receiveToneLabel) {
      toneParts.push(`RX ${properties.receiveToneLabel}`);
    }

    if (toneParts.length > 0) {
      const tones = document.createElement('div');
      tones.textContent = toneParts.join(' · ');
      root.append(tones);
    }

    const location = document.createElement('div');
    location.textContent = properties.locationLabel;
    root.append(location);
  }

  setPopup(
    new Popup({ closeButton: true, maxWidth: '280px' }).setLngLat(lngLat).setDOMContent(root).addTo(instance),
  );
}

function applyStyle(instance: MapLibreMap, style: string | typeof CHANNEL_MAP_EMPTY_STYLE): void {
  instance.setStyle(style);
  instance.once('style.load', () => {
    syncData(instance);
  });
}

function showEmptyStyle(instance: MapLibreMap): void {
  usingEmptyStyle.value = true;
  loadError.value = 'The map could not be loaded. Check your connection.';
  applyStyle(instance, CHANNEL_MAP_EMPTY_STYLE);
}

function bindPointer(instance: MapLibreMap): void {
  if (listenersBound) {
    return;
  }

  listenersBound = true;

  instance.on('moveend', () => {
    scheduleCameraSave(instance);
  });

  for (const ids of [REPEATER_LAYER_IDS, CHANNEL_LAYER_IDS, CONTACT_LAYER_IDS]) {
    instance.on('click', ids.clusterLayerId, (event) => {
      void (async () => {
        const feature = event.features?.[0];
        const clusterId = Number(feature?.properties?.cluster_id);
        const source = geoJsonSource(instance, ids.sourceId);

        if (feature === undefined || !Number.isInteger(clusterId) || !source) {
          return;
        }

        const coordinates = (feature.geometry as { coordinates?: [number, number] }).coordinates;

        if (!coordinates) {
          return;
        }

        try {
          const zoom = await source.getClusterExpansionZoom(clusterId);
          instance.easeTo({ center: coordinates, zoom });
        } catch {
          // Cluster went away between click and worker reply.
        }
      })();
    });

    instance.on('click', ids.unclusteredLayerId, (event) => {
      const feature = event.features?.[0];

      if (!feature) {
        return;
      }

      if (ids.sourceId === CONTACT_LAYER_IDS.sourceId) {
        const stationsHere = instance.queryRenderedFeatures(event.point, {
          layers: [STATION_HOME_LAYER_ID, STATION_OTHER_LAYER_ID],
        });

        if (stationsHere.length > 0) {
          return;
        }

        const grid = feature.properties?.grid;

        if (typeof grid !== 'string') {
          return;
        }

        openContactPopup(grid, event.lngLat);
        return;
      }

      const channel = channelFromFeature(feature);

      if (!channel) {
        return;
      }

      openChannelPopup(channel, event.lngLat);
    });

    for (const layerId of [ids.clusterLayerId, ids.unclusteredLayerId]) {
      instance.on('mouseenter', layerId, () => {
        instance.getCanvas().style.cursor = 'pointer';
      });

      instance.on('mouseleave', layerId, () => {
        instance.getCanvas().style.cursor = '';
      });
    }
  }

  for (const layerId of [STATION_HOME_LAYER_ID, STATION_OTHER_LAYER_ID]) {
    instance.on('click', layerId, (event) => {
      const id = event.features?.[0]?.properties?.id;

      if (typeof id !== 'string') {
        return;
      }

      openStationPopup(id, event.lngLat);
    });

    instance.on('mouseenter', layerId, () => {
      instance.getCanvas().style.cursor = 'pointer';
    });

    instance.on('mouseleave', layerId, () => {
      instance.getCanvas().style.cursor = '';
    });
  }
}

function onMapReady(instance: MapLibreMap): void {
  mapReady = true;
  syncData(instance);
  bindPointer(instance);

  if (pageSettings.value.camera) {
    restoreCamera(instance);
    return;
  }

  fitVisible(instance);
}

function onCanvasStyleLoad(instance: MapLibreMap): void {
  if (!mapReady) {
    return;
  }

  syncData(instance);
}

function onConnectivityChange(online: boolean, instance: MapLibreMap): void {
  if (!mapReady) {
    return;
  }

  if (!online) {
    showEmptyStyle(instance);
    return;
  }

  if (usingEmptyStyle.value) {
    usingEmptyStyle.value = false;
    loadError.value = undefined;
    applyStyle(instance, styleUrl.value);
    restoreCamera(instance);
  }
}

function onFitClick(): void {
  const instance = mapInstance();

  if (!instance) {
    return;
  }

  fitVisible(instance);
}

function onRepeatersToggle(enabled: boolean | 'indeterminate'): void {
  pageSettings.value = {
    ...pageSettings.value,
    repeaters: enabled === true,
  };
  persistSettings();
}

function onChannelsToggle(enabled: boolean | 'indeterminate'): void {
  pageSettings.value = {
    ...pageSettings.value,
    channels: enabled === true,
  };
  persistSettings();
}

function onContactsToggle(enabled: boolean | 'indeterminate'): void {
  pageSettings.value = {
    ...pageSettings.value,
    log: enabled === true,
  };
  persistSettings();
}

function onStationsToggle(enabled: boolean | 'indeterminate'): void {
  pageSettings.value = {
    ...pageSettings.value,
    stations: enabled === true,
  };
  persistSettings();
}

function flushCameraSave(): void {
  if (!cameraSaveTimer) {
    return;
  }

  clearTimeout(cameraSaveTimer);
  cameraSaveTimer = undefined;

  const instance = mapInstance();

  if (!instance || suppressCameraSave || !mapReady) {
    return;
  }

  const center = instance.getCenter();
  const zoom = instance.getZoom();

  pageSettings.value = {
    ...pageSettings.value,
    camera: {
      longitude: center.lng,
      latitude: center.lat,
      zoom,
    },
  };
  persistSettings();
}

onMounted(() => {
  if (useFixture.value) {
    return;
  }

  if (libraryChannels.value.length === 0) {
    void refresh().catch(() => {
      // Browser dev without Tauri: fixture or empty library is fine.
    });
  }

  if (libraryQsos.value.length === 0) {
    void refreshStationLog().catch(() => {
      // Browser dev without Tauri: empty log is fine.
    });
  }
});

onBeforeUnmount(() => {
  flushCameraSave();
});

watch(styleUrl, (url) => {
  const instance = mapInstance();

  if (!instance || !mapReady || usingEmptyStyle.value || !url) {
    return;
  }

  applyStyle(instance, url);
});

watch([repeaterFeatureCollection, channelFeatureCollection, contactFeatureCollection, stationFeatureCollection], () => {
  const instance = mapInstance();

  if (!instance?.isStyleLoaded() || !geoJsonSource(instance, REPEATER_LAYER_IDS.sourceId)) {
    return;
  }

  syncData(instance);
});

watch(usingEmptyStyle, () => {
  const instance = mapInstance();

  if (!instance?.isStyleLoaded()) {
    return;
  }

  ensureLayers(instance);
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-3 px-4 py-3">
    <section class="flex flex-col gap-3 rounded-xl bg-default p-3 shadow-sm ring-1 ring-default" aria-label="Map layers">
      <div class="flex flex-wrap items-center gap-3">
        <UCheckbox
          :model-value="pageSettings.repeaters"
          label="Repeaters"
          @update:model-value="onRepeatersToggle"
        />
        <UCheckbox
          :model-value="pageSettings.channels"
          label="Channels"
          @update:model-value="onChannelsToggle"
        />
        <UCheckbox
          :model-value="pageSettings.log"
          label="Contacts"
          @update:model-value="onContactsToggle"
        />
        <UCheckbox
          :model-value="pageSettings.stations"
          label="Stations"
          @update:model-value="onStationsToggle"
        />
        <USelectMenu
          v-model="selectedGroupIds"
          :items="groupItems"
          value-key="id"
          multiple
          placeholder="Library groups"
          color="neutral"
          class="min-w-48 flex-1 sm:max-w-md"
          :disabled="groupItems.length === 0"
          :search-input="groupItems.length > 8"
        />
        <UButton label="Fit" color="neutral" variant="outline" size="sm" icon="i-lucide-scan" @click="onFitClick" />
      </div>

      <div v-if="repeaterLegend.length > 0" class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="text-xs font-medium text-muted">Repeaters</span>
        <span
          v-for="item in repeaterLegend"
          :key="`repeater-${item.band}`"
          class="inline-flex items-center gap-1.5 text-xs text-muted"
        >
          <span class="map-page__swatch" :style="{ backgroundColor: item.color }" />
          {{ item.band }}
        </span>
      </div>

      <div v-if="channelLegend.length > 0" class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="text-xs font-medium text-muted">Channels</span>
        <span
          v-for="item in channelLegend"
          :key="`channel-${item.band}`"
          class="inline-flex items-center gap-1.5 text-xs text-muted"
        >
          <span class="map-page__swatch" :style="{ backgroundColor: item.color }" />
          {{ item.band }}
        </span>
      </div>

      <div v-if="pageSettings.log && contactLegend.length > 0" class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="text-xs font-medium text-muted">Contacts</span>
        <span
          v-for="item in contactLegend"
          :key="`contact-${item.key}`"
          class="inline-flex items-center gap-1.5 text-xs text-muted"
        >
          <span class="map-page__swatch" :style="{ backgroundColor: item.color }" />
          {{ item.label }}
        </span>
      </div>

      <p v-if="pageSettings.log" class="text-xs text-muted">
        {{ MAP_QSO_GRID_CENTER_NOTE }}
      </p>

      <div v-if="pageSettings.stations" class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="text-xs font-medium text-muted">Stations</span>
        <span class="inline-flex items-center gap-1.5 text-xs text-muted">
          <span
            class="map-page__swatch map-page__swatch--pin"
            :style="{ backgroundColor: STATION_PIN_COLOR }"
          />
          Home
        </span>
        <span class="inline-flex items-center gap-1.5 text-xs text-muted">
          <span
            class="map-page__swatch map-page__swatch--pin"
            :style="{ backgroundColor: MAP_STATION_OTHER_PIN_COLOR }"
          />
          Other stations
        </span>
      </div>

      <p v-if="stationHomeUnlocatedMessage" class="text-xs text-muted">
        {{ stationHomeUnlocatedMessage }}
      </p>

      <p v-if="stationOtherUnlocatedMessage" class="text-xs text-muted">
        {{ stationOtherUnlocatedMessage }}
      </p>

      <p v-if="repeaterUnlocatedMessage" class="text-xs text-muted">
        {{ repeaterUnlocatedMessage }}
      </p>

      <p v-if="channelUnlocatedMessage" class="text-xs text-muted">
        {{ channelUnlocatedMessage }}
      </p>

      <p v-if="contactUnmappedMessage" class="text-xs text-muted">
        {{ contactUnmappedMessage }}
      </p>
    </section>

    <section class="flex min-h-0 flex-1 flex-col gap-2" aria-label="Map">
      <MapCanvas
        ref="mapCanvas"
        offline-fallback
        v-model:load-error="loadError"
        v-model:using-empty-style="usingEmptyStyle"
        class="map-page__canvas min-h-0 w-full flex-1 overflow-hidden rounded-md border border-default"
        @ready="onMapReady"
        @style-load="onCanvasStyleLoad"
        @connectivity-change="onConnectivityChange"
      />

      <UAlert
        v-if="loadError"
        color="warning"
        variant="subtle"
        icon="i-lucide-circle-alert"
        title="Map unavailable"
        :description="loadError"
      />
    </section>
  </div>
</template>

<style scoped>
.map-page__canvas {
  min-height: 16rem;
}

.map-page__swatch {
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 9999px;
}

.map-page__swatch--pin {
  width: 0.45rem;
  height: 0.55rem;
  border-radius: 50% 50% 50% 0;
  transform: rotate(-45deg);
}
</style>
