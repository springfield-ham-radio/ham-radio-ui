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
import type { StationLogQso } from '~/utils/station-log-db';
import {
  OPENFREEMAP_STYLE_DARK,
  OPENFREEMAP_STYLE_LIGHT,
  QSL_MARKER_COLOR,
  qslMarkerStatus,
  qslStatusLabel,
  stationLogMapFeatureCollection,
  stationLogMapPoints,
  stationLogUnmappedCount,
  type QslMarkerStatus,
} from '~/utils/station-log-map';

// The desktop build bundles this module, so MapLibre cannot find the worker that ships beside the package.
setWorkerUrl(maplibreWorkerUrl);

const SOURCE_ID = 'station-log-contacts';
const LAYER_ID = 'station-log-contacts';

const props = defineProps<{
  qsos: StationLogQso[];
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

const unmappedCount = computed(() => stationLogUnmappedCount(props.qsos));

const unmappedMessage = computed(() => {
  if (unmappedCount.value === 1) {
    return '1 contact has no grid and is not on the map.';
  }

  return `${unmappedCount.value} contacts have no grid and are not on the map.`;
});

const legend = computed(() => {
  const items: { status: QslMarkerStatus; label: string }[] = [
    { status: 'none', label: 'No card' },
    { status: 'sent', label: 'Card sent' },
    { status: 'received', label: 'Card received' },
    { status: 'both', label: 'Both' },
  ];

  if (points.value.some((point) => point.status === 'mixed')) {
    items.push({ status: 'mixed', label: 'Mixed' });
  }

  return items;
});

let popup: Popup | undefined;
let listenersBound = false;
let mapReady = false;

function contactSource(instance: MapLibreMap): GeoJSONSource | undefined {
  const source = instance.getSource(SOURCE_ID);

  if (!source || source.type !== 'geojson') {
    return undefined;
  }

  return source;
}

function ensureLayers(instance: MapLibreMap): void {
  if (instance.getSource(SOURCE_ID)) {
    return;
  }

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

function syncContacts(instance: MapLibreMap, fit: boolean): void {
  const source = contactSource(instance);

  if (!source) {
    return;
  }

  const current = points.value;
  source.setData(stationLogMapFeatureCollection(current));

  if (!fit) {
    return;
  }

  if (current.length === 0) {
    instance.easeTo({ center: [0, 15], zoom: 1.2, duration: 300 });
    return;
  }

  const bounds = new LngLatBounds();

  for (const point of current) {
    bounds.extend([point.longitude, point.latitude]);
  }

  instance.fitBounds(bounds, { padding: 48, maxZoom: 5, duration: 300 });
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

  instance.on('click', LAYER_ID, (event) => {
    const grid = event.features?.[0]?.properties?.grid;

    if (typeof grid !== 'string') {
      return;
    }

    openPoint(grid, event.lngLat);
  });

  instance.on('mouseenter', LAYER_ID, () => {
    instance.getCanvas().style.cursor = 'pointer';
  });

  instance.on('mouseleave', LAYER_ID, () => {
    instance.getCanvas().style.cursor = '';
  });
}

watch(styleUrl, (url) => {
  const instance = map.value;

  if (!instance || !mapReady) {
    return;
  }

  instance.setStyle(url);
  instance.once('style.load', () => {
    ensureLayers(instance);
    syncContacts(instance, false);
  });
});

watch(points, () => {
  const instance = map.value;

  if (!instance?.isStyleLoaded() || !contactSource(instance)) {
    return;
  }

  syncContacts(instance, true);
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
    ensureLayers(instance);
    bindPointer(instance);
    syncContacts(instance, true);
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
        :key="item.status"
        class="inline-flex items-center gap-1.5 text-xs text-muted"
      >
        <span
          class="station-log-map__swatch"
          :style="{ backgroundColor: QSL_MARKER_COLOR[item.status] }"
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
</style>
