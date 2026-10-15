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
  mapRepeaterChannels,
  mapRepeaterFeatures,
  mapRepeaterUnlocatedCount,
  mapRepeaterUnlocatedMessage,
  storedLibraryGroups,
} from '~/utils/map-page-layers';
import {
  MAP_PAGE_ALL_STORED_GROUPS,
  readMapPageSettings,
  writeMapPageSettings,
  type MapPageSettings,
} from '~/utils/map-page-settings';
import { resolveMapStyleUrl } from '~/utils/station-log-map';
import type { SavedChannel } from '~/utils/saved-channels-db';

useHead({ title: 'Map' });

const MARKER_SOURCE_ID = 'map-repeaters';
const CLUSTER_LAYER_ID = 'map-repeaters-clusters';
const CLUSTER_COUNT_LAYER_ID = 'map-repeaters-cluster-count';
const UNCLUSTERED_LAYER_ID = 'map-repeaters-unclustered';

const route = useRoute();
const colorMode = useColorMode();
const { mapStyle, customMapStyleUrl } = useAppearanceSettings();
const { channels: libraryChannels, groups: allGroups, memberships, refresh } = useSavedChannels();

const useFixture = computed(() => import.meta.dev && route.query.fixture === 'map');

const fixture = computed(() => (useFixture.value ? mapDevFixture() : undefined));

const channels = computed(() => fixture.value?.channels ?? libraryChannels.value);
const groups = computed(() => fixture.value?.groups ?? allGroups.value);
const groupMemberships = computed(() => fixture.value?.memberships ?? memberships.value);

const storedGroups = computed(() => storedLibraryGroups(groups.value));

const pageSettings = ref<MapPageSettings>(readMapPageSettings());

const mapCanvas = useTemplateRef('mapCanvas');
const loadError = shallowRef<string | undefined>();
const usingEmptyStyle = shallowRef(false);

const styleUrl = computed(() => resolveMapStyleUrl(mapStyle.value, colorMode.value, customMapStyleUrl.value));

const repeaterRows = computed(() =>
  mapRepeaterChannels(channels.value, groupMemberships.value, groups.value, pageSettings.value.groupSelection),
);

const featureCollection = computed(() => {
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

const unlocatedCount = computed(() =>
  mapRepeaterUnlocatedCount(
    channels.value,
    groupMemberships.value,
    groups.value,
    pageSettings.value.groupSelection,
  ),
);

const unlocatedMessage = computed(() => mapRepeaterUnlocatedMessage(unlocatedCount.value, repeaterRows.value.length));

const legend = computed(() =>
  channelMapLegendBands(featureCollection.value.features).map((band) => ({
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

function ensureLayers(instance: MapLibreMap): void {
  const showSymbols = !usingEmptyStyle.value;

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

    if (showSymbols) {
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
    }

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
  } else if (showSymbols && !instance.getLayer(CLUSTER_COUNT_LAYER_ID)) {
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
  } else if (!showSymbols && instance.getLayer(CLUSTER_COUNT_LAYER_ID)) {
    instance.removeLayer(CLUSTER_COUNT_LAYER_ID);
  }
}

function syncData(instance: MapLibreMap): void {
  ensureLayers(instance);
  geoJsonSource(instance, MARKER_SOURCE_ID)?.setData(featureCollection.value);
}

function fitVisible(instance: MapLibreMap): void {
  if (!pageSettings.value.repeaters) {
    instance.easeTo({ center: [0, 15], zoom: 1.2, duration: 300 });
    return;
  }

  const bounds = channelMapBounds(featureCollection.value.features);

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

  return repeaterRows.value.find((channel) => String(channel.id) === id);
}

function setPopup(next: Popup | undefined): void {
  popup?.remove();
  popup = next;
  mapCanvas.value?.registerPopup(popup);
}

function openRepeaterPopup(channel: SavedChannel, lngLat: LngLatLike): void {
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
  title.textContent = channel.callsign || channel.name || 'Repeater';
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

    openRepeaterPopup(channel, event.lngLat);
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

  if (libraryChannels.value.length > 0) {
    return;
  }

  void refresh().catch(() => {
    // Browser dev without Tauri: fixture or empty library is fine.
  });
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

watch(featureCollection, () => {
  const instance = mapInstance();

  if (!instance?.isStyleLoaded() || !geoJsonSource(instance, MARKER_SOURCE_ID)) {
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

      <div v-if="legend.length > 0" class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          v-for="item in legend"
          :key="item.band"
          class="inline-flex items-center gap-1.5 text-xs text-muted"
        >
          <span class="map-page__swatch" :style="{ backgroundColor: item.color }" />
          {{ item.band }}
        </span>
      </div>

      <p v-if="unlocatedMessage" class="text-xs text-muted">
        {{ unlocatedMessage }}
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
</style>
