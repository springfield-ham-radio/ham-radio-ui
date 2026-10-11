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
  type MapGeoJSONFeature,
} from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  CHANNEL_MAP_EMPTY_STYLE,
  channelMapBandColor,
  channelMapBandColorExpression,
  channelMapBounds,
  channelMapFeatures,
  channelMapHoverFeature,
  channelMapLegendBands,
  channelMapLocatedIdKey,
  channelMapPopupDistanceLine,
  channelMapRangeFeatureCollection,
  channelMapStartFeatureCollection,
  channelMapUnlocatedCount,
  channelMapUnlocatedMessage,
  type ChannelMapChannel,
} from '~/utils/channel-map';
import { stationLogMapStyleUrl, STATION_PIN_COLOR } from '~/utils/station-log-map';
import type { GeoPoint } from '~/utils/location-format';
import type { DistanceUnit } from '~/utils/trip-channels';

setWorkerUrl(maplibreWorkerUrl);

const MARKER_SOURCE_ID = 'channel-map-markers';
const HOVER_SOURCE_ID = 'channel-map-hover';
const START_SOURCE_ID = 'channel-map-start';
const RANGE_SOURCE_ID = 'channel-map-range';
const CLUSTER_LAYER_ID = 'channel-map-clusters';
const CLUSTER_COUNT_LAYER_ID = 'channel-map-cluster-count';
const UNCLUSTERED_LAYER_ID = 'channel-map-unclustered';
const HOVER_LAYER_ID = 'channel-map-hover';
const START_LAYER_ID = 'channel-map-start';
const RANGE_LAYER_ID = 'channel-map-range';
const START_PIN_IMAGE_ID = 'channel-map-start-pin';

const props = defineProps<{
  channels: ChannelMapChannel[];
  highlightedChannelId?: string;
  hoveredChannelId?: string;
  distanceStartPoint?: GeoPoint;
  rangeRadiusKm?: number;
  distanceUnit: DistanceUnit;
}>();

const emit = defineEmits<{
  highlight: [channelId: string];
}>();

const colorMode = useColorMode();
const { mapStyle } = useAppearanceSettings();
const container = useTemplateRef('container');
const map = shallowRef<MapLibreMap | undefined>();
const loadError = shallowRef<string | undefined>();
const usingEmptyStyle = shallowRef(false);

const styleUrl = computed(() => stationLogMapStyleUrl(mapStyle.value, colorMode.value));

const featureCollection = computed(() => channelMapFeatures(props.channels));
const hoverCollection = computed(() =>
  channelMapHoverFeature(props.channels, props.hoveredChannelId ?? props.highlightedChannelId),
);
const startCollection = computed(() => channelMapStartFeatureCollection(props.distanceStartPoint));
const rangeCollection = computed(() => channelMapRangeFeatureCollection(props.distanceStartPoint, props.rangeRadiusKm));

const unlocatedCount = computed(() => channelMapUnlocatedCount(props.channels));
const unlocatedMessage = computed(() => channelMapUnlocatedMessage(unlocatedCount.value, props.channels.length));

const legend = computed(() =>
  channelMapLegendBands(featureCollection.value.features).map((band) => ({
    band,
    color: channelMapBandColor(band),
  })),
);

const locatedIdKey = computed(() => channelMapLocatedIdKey(props.channels, props.distanceStartPoint));

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

function ensureStartPin(instance: MapLibreMap): void {
  if (instance.hasImage(START_PIN_IMAGE_ID)) {
    return;
  }

  const image = stationPinImage();

  if (!image) {
    return;
  }

  instance.addImage(START_PIN_IMAGE_ID, image, { pixelRatio: 2 });
}

function ensureLayers(instance: MapLibreMap): void {
  ensureStartPin(instance);

  if (!instance.getSource(MARKER_SOURCE_ID)) {
    instance.addSource(MARKER_SOURCE_ID, {
      type: 'geojson',
      data: featureCollection.value,
      cluster: true,
      clusterMaxZoom: 12,
      clusterRadius: 50,
    });

    instance.addLayer({
      id: CLUSTER_LAYER_ID,
      type: 'circle',
      source: MARKER_SOURCE_ID,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#334155',
        'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 25, 22],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.92,
      },
    });

    instance.addLayer({
      id: CLUSTER_COUNT_LAYER_ID,
      type: 'symbol',
      source: MARKER_SOURCE_ID,
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

    instance.addLayer({
      id: UNCLUSTERED_LAYER_ID,
      type: 'circle',
      source: MARKER_SOURCE_ID,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': channelMapBandColorExpression(),
        'circle-radius': 7,
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.95,
      },
    });
  }

  if (!instance.getSource(HOVER_SOURCE_ID)) {
    instance.addSource(HOVER_SOURCE_ID, {
      type: 'geojson',
      data: hoverCollection.value,
    });

    instance.addLayer({
      id: HOVER_LAYER_ID,
      type: 'circle',
      source: HOVER_SOURCE_ID,
      paint: {
        'circle-color': ['get', 'bandColor'],
        'circle-radius': 11,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#f8fafc',
        'circle-opacity': 0.9,
      },
    });
  }

  if (!instance.getSource(START_SOURCE_ID)) {
    instance.addSource(START_SOURCE_ID, {
      type: 'geojson',
      data: startCollection.value,
    });
  }

  if (!instance.getSource(RANGE_SOURCE_ID)) {
    instance.addSource(RANGE_SOURCE_ID, {
      type: 'geojson',
      data: rangeCollection.value,
    });
  }

  if (!instance.getLayer(START_LAYER_ID)) {
    instance.addLayer({
      id: START_LAYER_ID,
      type: 'symbol',
      source: START_SOURCE_ID,
      layout: {
        'icon-image': START_PIN_IMAGE_ID,
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
      },
    });
  }

  if (!instance.getLayer(RANGE_LAYER_ID) && instance.getLayer(CLUSTER_LAYER_ID)) {
    instance.addLayer(
      {
        id: RANGE_LAYER_ID,
        type: 'fill',
        source: RANGE_SOURCE_ID,
        paint: {
          'fill-color': STATION_PIN_COLOR,
          'fill-opacity': 0.08,
        },
      },
      { beforeId: CLUSTER_LAYER_ID },
    );

    instance.addLayer(
      {
        id: `${RANGE_LAYER_ID}-outline`,
        type: 'line',
        source: RANGE_SOURCE_ID,
        paint: {
          'line-color': STATION_PIN_COLOR,
          'line-width': 1.5,
          'line-opacity': 0.65,
        },
      },
      { beforeId: CLUSTER_LAYER_ID },
    );
  }
}

function syncData(instance: MapLibreMap, fit: boolean): void {
  ensureLayers(instance);

  geoJsonSource(instance, MARKER_SOURCE_ID)?.setData(featureCollection.value);
  geoJsonSource(instance, HOVER_SOURCE_ID)?.setData(hoverCollection.value);
  geoJsonSource(instance, START_SOURCE_ID)?.setData(startCollection.value);
  geoJsonSource(instance, RANGE_SOURCE_ID)?.setData(rangeCollection.value);

  if (!fit) {
    return;
  }

  fitVisible(instance);
}

function fitVisible(instance: MapLibreMap): void {
  const bounds = channelMapBounds(featureCollection.value.features, props.distanceStartPoint);

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

function channelFromFeature(feature: MapGeoJSONFeature): ChannelMapChannel | undefined {
  const id = feature.properties?.id;

  if (typeof id !== 'string') {
    return undefined;
  }

  return props.channels.find((channel) => String(channel.id) === id);
}

function openChannelPopup(channel: ChannelMapChannel, lngLat: LngLatLike): void {
  const instance = map.value;

  if (!instance) {
    return;
  }

  const feature = featureCollection.value.features.find((entry) => entry.properties.id === String(channel.id));
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

  const distanceLine = channelMapPopupDistanceLine(channel, props.distanceStartPoint, props.distanceUnit);

  if (distanceLine) {
    const distance = document.createElement('div');
    distance.textContent = distanceLine;
    root.append(distance);
  }

  popup?.remove();
  popup = new Popup({ closeButton: true, maxWidth: '280px' })
    .setLngLat(lngLat)
    .setDOMContent(root)
    .addTo(instance);
}

function applyStyle(instance: MapLibreMap, style: string | typeof CHANNEL_MAP_EMPTY_STYLE, fit = false): void {
  instance.setStyle(style);
  instance.once('style.load', () => {
    syncData(instance, fit);
  });
}

function bindPointer(instance: MapLibreMap): void {
  if (listenersBound) {
    return;
  }

  listenersBound = true;

  instance.on('click', CLUSTER_LAYER_ID, (event) => {
    void (async () => {
      const feature = event.features?.[0];
      const clusterId = Number(feature?.properties?.cluster_id);
      const source = geoJsonSource(instance, MARKER_SOURCE_ID);

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

  instance.on('click', UNCLUSTERED_LAYER_ID, (event) => {
    const feature = event.features?.[0];
    const channel = feature ? channelFromFeature(feature) : undefined;

    if (!channel || !feature) {
      return;
    }

    emit('highlight', String(channel.id));
    openChannelPopup(channel, event.lngLat);
  });

  for (const layerId of [CLUSTER_LAYER_ID, UNCLUSTERED_LAYER_ID]) {
    instance.on('mouseenter', layerId, () => {
      instance.getCanvas().style.cursor = 'pointer';
    });

    instance.on('mouseleave', layerId, () => {
      instance.getCanvas().style.cursor = '';
    });
  }
}

function showEmptyStyle(instance: MapLibreMap): void {
  usingEmptyStyle.value = true;
  loadError.value = 'The map could not be loaded. Check your connection.';
  applyStyle(instance, CHANNEL_MAP_EMPTY_STYLE, false);
}

watch(styleUrl, (url) => {
  const instance = map.value;

  if (!instance || !mapReady || usingEmptyStyle.value) {
    return;
  }

  applyStyle(instance, url);
});

watch(hoverCollection, () => {
  const instance = map.value;

  if (!instance?.isStyleLoaded() || !geoJsonSource(instance, HOVER_SOURCE_ID)) {
    return;
  }

  geoJsonSource(instance, HOVER_SOURCE_ID)?.setData(hoverCollection.value);
});

watch([rangeCollection, startCollection], () => {
  const instance = map.value;

  if (!instance?.isStyleLoaded()) {
    return;
  }

  geoJsonSource(instance, START_SOURCE_ID)?.setData(startCollection.value);
  geoJsonSource(instance, RANGE_SOURCE_ID)?.setData(rangeCollection.value);
});

watch(featureCollection, () => {
  const instance = map.value;

  if (!instance?.isStyleLoaded() || !geoJsonSource(instance, MARKER_SOURCE_ID)) {
    return;
  }

  geoJsonSource(instance, MARKER_SOURCE_ID)?.setData(featureCollection.value);
});

watch(locatedIdKey, () => {
  const instance = map.value;

  if (!instance?.isStyleLoaded()) {
    return;
  }

  syncData(instance, true);
});

function onOnlineChange(): void {
  const instance = map.value;

  if (!instance || !mapReady) {
    return;
  }

  if (!navigator.onLine) {
    showEmptyStyle(instance);
    return;
  }

  if (usingEmptyStyle.value) {
    usingEmptyStyle.value = false;
    loadError.value = undefined;
    applyStyle(instance, styleUrl.value, true);
  }
}

onMounted(() => {
  const element = container.value;

  if (!element) {
    return;
  }

  const initialStyle = import.meta.client && !navigator.onLine ? CHANNEL_MAP_EMPTY_STYLE : styleUrl.value;
  usingEmptyStyle.value = initialStyle === CHANNEL_MAP_EMPTY_STYLE;

  if (usingEmptyStyle.value) {
    loadError.value = 'The map could not be loaded. Check your connection.';
  }

  const instance = new MapLibreMap({
    container: element,
    style: initialStyle,
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

    if (!usingEmptyStyle.value) {
      loadError.value = undefined;
    }

    syncData(instance, true);
    bindPointer(instance);
  });

  instance.on('error', () => {
    if (!didLoad && !usingEmptyStyle.value) {
      showEmptyStyle(instance);
    }
  });

  const observer = new ResizeObserver(() => {
    instance.resize();
  });
  observer.observe(element);

  window.addEventListener('online', onOnlineChange);
  window.addEventListener('offline', onOnlineChange);

  map.value = instance;

  onUnmounted(() => {
    observer.disconnect();
    window.removeEventListener('online', onOnlineChange);
    window.removeEventListener('offline', onOnlineChange);
    popup?.remove();
    instance.remove();
    map.value = undefined;
  });
});
</script>

<template>
  <section class="channel-map flex h-full min-h-0 w-full flex-col gap-2" aria-label="Repeater map">
    <div
      ref="container"
      class="channel-map__canvas min-h-0 w-full flex-1 overflow-hidden rounded-md border border-default"
    />

    <div v-if="legend.length > 0" class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span
        v-for="item in legend"
        :key="item.band"
        class="inline-flex items-center gap-1.5 text-xs text-muted"
      >
        <span class="channel-map__swatch" :style="{ backgroundColor: item.color }" />
        {{ item.band }}
      </span>
    </div>

    <p v-if="unlocatedMessage" class="text-xs text-muted">
      {{ unlocatedMessage }}
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
.channel-map__canvas :deep(.maplibregl-map img) {
  max-width: none;
}

.channel-map__swatch {
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 9999px;
}
</style>
