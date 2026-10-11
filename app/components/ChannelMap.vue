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
import { STATION_PIN_COLOR, stationLogMapStyleUrl } from '~/utils/station-log-map';
import type { GeoPoint } from '~/utils/location-format';
import type { DistanceUnit } from '~/utils/trip-channels';

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
const mapCanvas = useTemplateRef('mapCanvas');
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

function setPopup(next: Popup | undefined): void {
  popup?.remove();
  popup = next;
  mapCanvas.value?.registerPopup(popup);
}

function openChannelPopup(channel: ChannelMapChannel, lngLat: LngLatLike): void {
  const instance = mapInstance();

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

  setPopup(
    new Popup({ closeButton: true, maxWidth: '280px' }).setLngLat(lngLat).setDOMContent(root).addTo(instance),
  );
}

function applyStyle(instance: MapLibreMap, style: string | typeof CHANNEL_MAP_EMPTY_STYLE, fit = false): void {
  instance.setStyle(style);
  instance.once('style.load', () => {
    syncData(instance, fit);
  });
}

function showEmptyStyle(instance: MapLibreMap): void {
  usingEmptyStyle.value = true;
  loadError.value = 'The map could not be loaded. Check your connection.';
  applyStyle(instance, CHANNEL_MAP_EMPTY_STYLE, false);
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

function onMapReady(instance: MapLibreMap): void {
  mapReady = true;
  syncData(instance, true);
  bindPointer(instance);
}

function onCanvasStyleLoad(instance: MapLibreMap): void {
  if (!mapReady) {
    return;
  }

  syncData(instance, false);
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
    applyStyle(instance, styleUrl.value, true);
  }
}

watch(styleUrl, (url) => {
  const instance = mapInstance();

  if (!instance || !mapReady || usingEmptyStyle.value || !url) {
    return;
  }

  applyStyle(instance, url);
});

watch(hoverCollection, () => {
  const instance = mapInstance();

  if (!instance?.isStyleLoaded() || !geoJsonSource(instance, HOVER_SOURCE_ID)) {
    return;
  }

  geoJsonSource(instance, HOVER_SOURCE_ID)?.setData(hoverCollection.value);
});

watch([rangeCollection, startCollection], () => {
  const instance = mapInstance();

  if (!instance?.isStyleLoaded()) {
    return;
  }

  geoJsonSource(instance, START_SOURCE_ID)?.setData(startCollection.value);
  geoJsonSource(instance, RANGE_SOURCE_ID)?.setData(rangeCollection.value);
});

watch(featureCollection, () => {
  const instance = mapInstance();

  if (!instance?.isStyleLoaded() || !geoJsonSource(instance, MARKER_SOURCE_ID)) {
    return;
  }

  geoJsonSource(instance, MARKER_SOURCE_ID)?.setData(featureCollection.value);
});

watch(locatedIdKey, () => {
  const instance = mapInstance();

  if (!instance?.isStyleLoaded()) {
    return;
  }

  syncData(instance, true);
});
</script>

<template>
  <section class="channel-map flex h-full min-h-0 w-full flex-col gap-2" aria-label="Repeater map">
    <MapCanvas
      ref="mapCanvas"
      offline-fallback
      v-model:load-error="loadError"
      v-model:using-empty-style="usingEmptyStyle"
      class="channel-map__canvas min-h-0 w-full flex-1 overflow-hidden rounded-md border border-default"
      @ready="onMapReady"
      @style-load="onCanvasStyleLoad"
      @connectivity-change="onConnectivityChange"
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
.channel-map__swatch {
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 9999px;
}
</style>
