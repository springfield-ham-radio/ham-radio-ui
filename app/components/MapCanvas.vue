<script setup lang="ts">
import {
  AttributionControl,
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type StyleSpecification,
} from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CHANNEL_MAP_EMPTY_STYLE, mapCanvasUsesEmptyStyle } from '~/utils/map-canvas';
import { stationLogMapStyleUrl } from '~/utils/station-log-map';

setWorkerUrl(maplibreWorkerUrl);

const MAP_LOAD_ERROR = 'The map could not be loaded. Check your connection.';

const props = withDefaults(
  defineProps<{
    offlineFallback?: boolean;
  }>(),
  {
    offlineFallback: false,
  },
);

const loadError = defineModel<string | undefined>('loadError');
const usingEmptyStyle = defineModel<boolean>('usingEmptyStyle', { default: false });

const emit = defineEmits<{
  ready: [instance: MapLibreMap];
  styleLoad: [instance: MapLibreMap];
  connectivityChange: [online: boolean, instance: MapLibreMap];
}>();

const colorMode = useColorMode();
const { mapStyle } = useAppearanceSettings();
const container = useTemplateRef('container');
const map = shallowRef<MapLibreMap | undefined>();

let consumerPopup: Popup | undefined;
let mapReady = false;
let didLoad = false;

function registerPopup(popup: Popup | undefined): void {
  consumerPopup?.remove();
  consumerPopup = popup;
}

function initialStyle(): string | StyleSpecification {
  if (props.offlineFallback && import.meta.client && !navigator.onLine) {
    return CHANNEL_MAP_EMPTY_STYLE;
  }

  return stationLogMapStyleUrl(mapStyle.value, colorMode.value);
}

function swapToEmptyStyle(instance: MapLibreMap): void {
  usingEmptyStyle.value = true;
  loadError.value = MAP_LOAD_ERROR;
  instance.setStyle(CHANNEL_MAP_EMPTY_STYLE);
  instance.once('style.load', () => {
    emit('styleLoad', instance);
  });
}

function onConnectivityChange(): void {
  const instance = map.value;

  if (!instance || !mapReady || !props.offlineFallback) {
    return;
  }

  emit('connectivityChange', navigator.onLine, instance);
}

defineExpose({
  map,
  registerPopup,
});

onMounted(() => {
  const element = container.value;

  if (!element) {
    return;
  }

  const resolvedStyle = initialStyle();

  if (props.offlineFallback && mapCanvasUsesEmptyStyle(resolvedStyle)) {
    usingEmptyStyle.value = true;
    loadError.value = MAP_LOAD_ERROR;
  }

  const instance = new MapLibreMap({
    container: element,
    style: resolvedStyle,
    center: [0, 15],
    zoom: 1.2,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  });

  instance.addControl(new NavigationControl({ showCompass: false, visualizePitch: false }), 'top-right');
  instance.addControl(new AttributionControl({ compact: false }), 'bottom-right');

  instance.on('load', () => {
    didLoad = true;
    mapReady = true;

    if (!usingEmptyStyle.value) {
      loadError.value = undefined;
    }

    emit('ready', instance);
  });

  instance.on('error', () => {
    if (didLoad) {
      return;
    }

    if (props.offlineFallback && !usingEmptyStyle.value) {
      swapToEmptyStyle(instance);
      return;
    }

    if (!props.offlineFallback) {
      loadError.value = MAP_LOAD_ERROR;
    }
  });

  const observer = new ResizeObserver(() => {
    instance.resize();
  });
  observer.observe(element);

  if (props.offlineFallback) {
    window.addEventListener('online', onConnectivityChange);
    window.addEventListener('offline', onConnectivityChange);
  }

  map.value = instance;

  onUnmounted(() => {
    observer.disconnect();

    if (props.offlineFallback) {
      window.removeEventListener('online', onConnectivityChange);
      window.removeEventListener('offline', onConnectivityChange);
    }

    consumerPopup?.remove();
    instance.remove();
    map.value = undefined;
  });
});
</script>

<template>
  <div ref="container" class="map-canvas map-canvas__surface" />
</template>

<style scoped>
.map-canvas :deep(.maplibregl-map img) {
  max-width: none;
}
</style>
