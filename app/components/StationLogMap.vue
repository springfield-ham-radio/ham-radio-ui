<script setup lang="ts">
import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
  type LngLatLike,
} from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { formatStationLocation } from '~/utils/antenna-station';
import type { StationLogQso } from '~/utils/station-log-db';
import {
  OPENFREEMAP_STYLE_DARK,
  OPENFREEMAP_STYLE_LIGHT,
  QSL_MARKER_COLOR,
  STATION_PIN_COLOR,
  qslMarkerStatus,
  qslStatusLabel,
  stationLogMapFeatureCollection,
  stationLogMapPoints,
  stationLogUnmappedCount,
  stationMapFeatureCollection,
  stationMapPins,
  type StationMapPinInput,
} from '~/utils/station-log-map';

// The desktop build bundles this module, so MapLibre cannot find the worker that ships beside the package.
setWorkerUrl(maplibreWorkerUrl);

const SOURCE_ID = 'station-log-contacts';
const LAYER_ID = 'station-log-contacts';
const STATION_SOURCE_ID = 'station-log-stations';
const STATION_LAYER_ID = 'station-log-stations';
const STATION_PIN_IMAGE_ID = 'station-log-pin';

const props = defineProps<{
  qsos: StationLogQso[];
  stations: StationMapPinInput[];
}>();

const emit = defineEmits<{
  select: [qso: StationLogQso];
}>();

const colorMode = useColorMode();
const container = useTemplateRef('container');
const map = shallowRef<MapLibreMap | undefined>();
const loadError = shallowRef<string | undefined>();

const styleUrl = computed(() =>
  colorMode.value === 'dark' ? OPENFREEMAP_STYLE_DARK : OPENFREEMAP_STYLE_LIGHT,
);

const points = computed(() => stationLogMapPoints(props.qsos));
const pins = computed(() => stationMapPins(props.stations));

const unmappedCount = computed(() => stationLogUnmappedCount(props.qsos));

const unmappedMessage = computed(() => {
  if (unmappedCount.value === 1) {
    return '1 contact has no grid and is not on the map.';
  }

  return `${unmappedCount.value} contacts have no grid and are not on the map.`;
});

const legend = computed(() => {
  const items: { key: string; label: string; color: string; pin: boolean }[] = [
    { key: 'none', label: 'No card', color: QSL_MARKER_COLOR.none, pin: false },
    { key: 'sent', label: 'Card sent', color: QSL_MARKER_COLOR.sent, pin: false },
    { key: 'received', label: 'Card received', color: QSL_MARKER_COLOR.received, pin: false },
    { key: 'both', label: 'Both', color: QSL_MARKER_COLOR.both, pin: false },
  ];

  if (points.value.some((point) => point.status === 'mixed')) {
    items.push({ key: 'mixed', label: 'Mixed', color: QSL_MARKER_COLOR.mixed, pin: false });
  }

  if (pins.value.length > 0) {
    items.push({ key: 'station', label: 'Station', color: STATION_PIN_COLOR, pin: true });
  }

  return items;
});

let popup: Popup | undefined;
let listenersBound = false;
let mapReady = false;

function geoJsonSource(instance: MapLibreMap, sourceId: string): GeoJSONSource | undefined {
  const source = instance.getSource(sourceId);

  if (!source || source.type !== 'geojson') {
    return undefined;
  }

  return source;
}

function stationPinImage(): ImageData | undefined {
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
  context.fillStyle = STATION_PIN_COLOR;
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

function ensureStationPin(instance: MapLibreMap): void {
  if (instance.hasImage(STATION_PIN_IMAGE_ID)) {
    return;
  }

  const image = stationPinImage();

  if (!image) {
    return;
  }

  instance.addImage(STATION_PIN_IMAGE_ID, image, { pixelRatio: 2 });
}

function ensureLayers(instance: MapLibreMap): void {
  ensureStationPin(instance);
  ensureStationSource(instance);

  if (!instance.getSource(SOURCE_ID)) {
    instance.addSource(SOURCE_ID, {
      type: 'geojson',
      data: stationLogMapFeatureCollection(points.value),
    });

    instance.addLayer({
      id: LAYER_ID,
      type: 'circle',
      source: SOURCE_ID,
      paint: {
        'circle-color': [
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
        ],
        'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 6, 8, 14],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.95,
      },
    });
  }

  if (!instance.hasImage(STATION_PIN_IMAGE_ID) || instance.getLayer(STATION_LAYER_ID)) {
    return;
  }

  instance.addLayer({
    id: STATION_LAYER_ID,
    type: 'symbol',
    source: STATION_SOURCE_ID,
    layout: {
      'icon-image': STATION_PIN_IMAGE_ID,
      'icon-anchor': 'bottom',
      'icon-allow-overlap': true,
      'text-field': ['get', 'nickname'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 12,
      'text-anchor': 'top',
      'text-offset': [0, 0.15],
      'text-optional': true,
    },
    paint: {
      'text-color': '#f8fafc',
      'text-halo-color': '#0f172a',
      'text-halo-width': 1.25,
    },
  });
}

function ensureStationSource(instance: MapLibreMap): void {
  if (instance.getSource(STATION_SOURCE_ID)) {
    return;
  }

  instance.addSource(STATION_SOURCE_ID, {
    type: 'geojson',
    data: stationMapFeatureCollection(pins.value),
  });
}

function syncMap(instance: MapLibreMap, fit: boolean): void {
  ensureLayers(instance);

  geoJsonSource(instance, SOURCE_ID)?.setData(stationLogMapFeatureCollection(points.value));
  geoJsonSource(instance, STATION_SOURCE_ID)?.setData(stationMapFeatureCollection(pins.value));

  if (!fit) {
    return;
  }

  const current = points.value;
  const stationPins = pins.value;

  if (current.length === 0 && stationPins.length === 0) {
    instance.easeTo({ center: [0, 15], zoom: 1.2, duration: 300 });
    return;
  }

  const bounds = new LngLatBounds();

  for (const point of current) {
    bounds.extend([point.longitude, point.latitude]);
  }

  for (const pin of stationPins) {
    bounds.extend([pin.longitude, pin.latitude]);
  }

  instance.fitBounds(bounds, { padding: 48, maxZoom: 5, duration: 300 });
}

function openStations(ids: string[], lngLat: LngLatLike): void {
  const selected = pins.value.filter((pin) => ids.includes(pin.id));
  const instance = map.value;

  if (selected.length === 0 || !instance) {
    return;
  }

  const root = document.createElement('div');
  root.style.color = '#0f172a';

  for (const pin of selected) {
    const block = document.createElement('div');
    const name = document.createElement('div');
    name.textContent = pin.nickname;
    name.style.fontWeight = '600';
    const place = document.createElement('div');
    place.textContent = formatStationLocation(pin);
    block.append(name, place);
    root.append(block);
  }

  popup?.remove();
  popup = new Popup({ closeButton: true, maxWidth: '260px' })
    .setLngLat(lngLat)
    .setDOMContent(root)
    .addTo(instance);
}

function stationIdsAt(event: { features?: { properties?: { id?: unknown } | null }[] }): string[] {
  const ids: string[] = [];

  for (const feature of event.features ?? []) {
    const id = feature.properties?.id;

    if (typeof id === 'string' && !ids.includes(id)) {
      ids.push(id);
    }
  }

  return ids;
}

function openPoint(grid: string, lngLat: LngLatLike): void {
  const point = points.value.find((candidate) => candidate.grid === grid);
  const instance = map.value;

  if (!point || !instance) {
    return;
  }

  const [only] = point.qsos;

  if (point.qsos.length === 1 && only) {
    popup?.remove();
    emit('select', only);
    return;
  }

  const root = document.createElement('div');
  root.style.color = '#0f172a';

  for (const qso of point.qsos) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${qso.theirCallsign} · ${qslStatusLabel(qslMarkerStatus(qso))}`;
    button.addEventListener('click', () => {
      popup?.remove();
      emit('select', qso);
    });
    button.style.display = 'block';
    button.style.width = '100%';
    button.style.padding = '0.2rem 0';
    button.style.textAlign = 'left';
    button.style.background = 'transparent';
    button.style.border = 'none';
    button.style.cursor = 'pointer';
    button.style.font = 'inherit';
    root.append(button);
  }

  popup?.remove();
  popup = new Popup({ closeButton: true, maxWidth: '260px' })
    .setLngLat(lngLat)
    .setDOMContent(root)
    .addTo(instance);
}

function bindPointer(instance: MapLibreMap): void {
  if (listenersBound) {
    return;
  }

  listenersBound = true;

  instance.on('click', STATION_LAYER_ID, (event) => {
    const ids = stationIdsAt(event);

    if (ids.length === 0) {
      return;
    }

    openStations(ids, event.lngLat);
  });

  instance.on('click', LAYER_ID, (event) => {
    if (instance.getLayer(STATION_LAYER_ID)) {
      const stationsHere = instance.queryRenderedFeatures(event.point, { layers: [STATION_LAYER_ID] });

      if (stationsHere.length > 0) {
        return;
      }
    }

    const grid = event.features?.[0]?.properties?.grid;

    if (typeof grid !== 'string') {
      return;
    }

    openPoint(grid, event.lngLat);
  });

  for (const layerId of [LAYER_ID, STATION_LAYER_ID]) {
    instance.on('mouseenter', layerId, () => {
      instance.getCanvas().style.cursor = 'pointer';
    });

    instance.on('mouseleave', layerId, () => {
      instance.getCanvas().style.cursor = '';
    });
  }
}

watch(styleUrl, (url) => {
  const instance = map.value;

  if (!instance || !mapReady) {
    return;
  }

  instance.setStyle(url);
  instance.once('style.load', () => {
    syncMap(instance, false);
  });
});

watch([points, pins], () => {
  const instance = map.value;

  if (!instance?.isStyleLoaded() || !geoJsonSource(instance, SOURCE_ID)) {
    return;
  }

  syncMap(instance, true);
});

onMounted(() => {
  const element = container.value;

  if (!element) {
    return;
  }

  const instance = new MapLibreMap({
    container: element,
    style: styleUrl.value,
    center: [0, 15],
    zoom: 1.2,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  });

  instance.addControl(new NavigationControl({ showCompass: false, visualizePitch: false }), 'top-right');
  instance.addControl(new AttributionControl({ compact: false }), 'bottom-right');

  let didLoad = false;

  instance.on('load', () => {
    didLoad = true;
    mapReady = true;
    loadError.value = undefined;
    syncMap(instance, true);
    bindPointer(instance);
  });

  instance.on('error', () => {
    if (!didLoad) {
      loadError.value = 'The map could not be loaded. Check your connection.';
    }
  });

  const observer = new ResizeObserver(() => {
    instance.resize();
  });
  observer.observe(element);

  map.value = instance;

  onUnmounted(() => {
    observer.disconnect();
    popup?.remove();
    instance.remove();
    map.value = undefined;
  });
});
</script>

<template>
  <section class="station-log-map flex h-full min-h-0 w-full flex-col gap-2" aria-label="Contact map">
    <div
      ref="container"
      class="station-log-map__canvas min-h-0 w-full flex-1 overflow-hidden rounded-md border border-default"
    />

    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span
        v-for="item in legend"
        :key="item.key"
        class="inline-flex items-center gap-1.5 text-xs text-muted"
      >
        <span
          class="station-log-map__swatch"
          :class="{ 'station-log-map__swatch--pin': item.pin }"
          :style="{ backgroundColor: item.color }"
        />
        {{ item.label }}
      </span>
    </div>

    <p v-if="unmappedCount > 0" class="text-xs text-muted">
      {{ unmappedMessage }}
    </p>

    <UAlert
      v-if="loadError"
      color="warning"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Map unavailable"
      :description="loadError"
    />
  </section>
</template>

<style scoped>
.station-log-map__canvas :deep(.maplibregl-map img) {
  max-width: none;
}

.station-log-map__swatch {
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 9999px;
}

.station-log-map__swatch--pin {
  width: 0.45rem;
  height: 0.55rem;
  border-radius: 50% 50% 50% 0;
  transform: rotate(-45deg);
}
</style>
