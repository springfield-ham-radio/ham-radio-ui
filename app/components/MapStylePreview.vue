<script setup lang="ts">
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { stationLogMapStyleUrl } from '~/utils/station-log-map';

setWorkerUrl(maplibreWorkerUrl);

const colorMode = useColorMode();
const { mapStyle } = useAppearanceSettings();
const container = useTemplateRef('container');
const map = shallowRef<MapLibreMap | undefined>();

const styleUrl = computed(() => stationLogMapStyleUrl(mapStyle.value, colorMode.value));

watch(styleUrl, (url) => {
  map.value?.setStyle(url);
});

onMounted(() => {
  const element = container.value;

  if (!element) {
    return;
  }

  const instance = new MapLibreMap({
    container: element,
    style: styleUrl.value,
    center: [-30, 22],
    zoom: 1,
    interactive: false,
  });

  const observer = new ResizeObserver(() => {
    instance.resize();
  });
  observer.observe(element);

  map.value = instance;

  onUnmounted(() => {
    observer.disconnect();
    instance.remove();
    map.value = undefined;
  });
});
</script>

<template>
  <div
    ref="container"
    class="map-style-preview h-28 w-full overflow-hidden rounded-md border border-default"
    aria-label="Map style preview"
  />
</template>

<style scoped>
.map-style-preview :deep(.maplibregl-map img) {
  max-width: none;
}
</style>
