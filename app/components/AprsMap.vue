<script setup lang="ts">
import {
  LngLatBounds,
  Popup,
  type GeoJSONSource,
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
  type MapLibreEvent,
} from 'maplibre-gl';
import {
  aprsMapBounds,
  aprsMapFeatures,
  aprsMapPopupLines,
  aprsStationCirclePaint,
  aprsStationLabelLayout,
  aprsStationLabelPaint,
} from '~/utils/aprs-map';
import type { AprsStation } from '~/utils/aprs-stations';

const SOURCE_ID = 'aprs-stations';
const CIRCLE_ID = 'aprs-stations-circle';
const LABEL_ID = 'aprs-stations-label';

const props = defineProps<{
  stations: AprsStation[];
  selectedCall?: string;
  detailsCall?: string;
}>();

const emit = defineEmits<{
  select: [callsign: string];
  dismiss: [];
}>();

const mapCanvas = useTemplateRef('mapCanvas');
const collection = computed(() => aprsMapFeatures(props.stations, props.selectedCall));
const popupKey = computed(() => {
  const station = props.stations.find((entry) => entry.callsign === props.detailsCall);

  if (!station?.position) {
    return '';
  }

  return [
    station.callsign,
    station.position.value.label,
    station.position.heardAt,
    station.comment?.value ?? '',
    station.positionComment?.value ?? '',
    station.lastHeardAt,
  ].join('|');
});

let popup: Popup | undefined;
let popupCallsign: string | undefined;
let suppressPopupCloseEmit = false;
let userMoved = false;
let didInitialFit = false;
let listenersBound = false;

function mapInstance(): MapLibreMap | undefined {
  return mapCanvas.value?.map;
}

function geoJsonSource(instance: MapLibreMap): GeoJSONSource | undefined {
  const source = instance.getSource(SOURCE_ID);

  if (!source || source.type !== 'geojson') {
    return undefined;
  }

  return source;
}

function ensureLayers(instance: MapLibreMap): void {
  if (!instance.getSource(SOURCE_ID)) {
    instance.addSource(SOURCE_ID, {
      type: 'geojson',
      data: collection.value,
    });
  }

  if (!instance.getLayer(CIRCLE_ID)) {
    instance.addLayer({
      id: CIRCLE_ID,
      type: 'circle',
      source: SOURCE_ID,
      paint: aprsStationCirclePaint(),
    });
  }

  if (!instance.getLayer(LABEL_ID)) {
    instance.addLayer({
      id: LABEL_ID,
      type: 'symbol',
      source: SOURCE_ID,
      layout: aprsStationLabelLayout(),
      paint: aprsStationLabelPaint(),
    });
  }
}

function setData(instance: MapLibreMap): void {
  ensureLayers(instance);
  geoJsonSource(instance)?.setData(collection.value);
}

function fitStations(instance: MapLibreMap): void {
  const bounds = aprsMapBounds(collection.value);

  if (!bounds) {
    return;
  }

  didInitialFit = true;
  instance.fitBounds(
    new LngLatBounds([bounds.minLongitude, bounds.minLatitude], [bounds.maxLongitude, bounds.maxLatitude]),
    { padding: 56, maxZoom: 12, duration: 300 },
  );
}

function buildPopupContent(station: AprsStation): HTMLDivElement {
  const root = document.createElement('div');
  root.style.color = '#0f172a';
  root.style.fontSize = '12px';
  root.style.lineHeight = '1.4';

  for (const [index, line] of aprsMapPopupLines(station).entries()) {
    const row = document.createElement('div');

    if (index === 0) {
      row.style.fontWeight = '600';
    }

    row.textContent = line;
    root.append(row);
  }

  return root;
}

function closePopup(): void {
  if (popup) {
    suppressPopupCloseEmit = true;
    popup.remove();
    suppressPopupCloseEmit = false;
  }

  popup = undefined;
  popupCallsign = undefined;
  mapCanvas.value?.registerPopup(undefined);
}

function syncPopup(instance: MapLibreMap): void {
  const callsign = props.detailsCall;
  const station = callsign ? props.stations.find((entry) => entry.callsign === callsign) : undefined;
  const feature = callsign
    ? collection.value.features.find((entry) => entry.properties.callsign === callsign)
    : undefined;

  if (!station || !feature || !callsign) {
    closePopup();
    return;
  }

  const coordinates = feature.geometry.coordinates;

  const reanchor = (): void => {
    popup?.setLngLat(coordinates);
  };

  if (popup && popupCallsign === callsign) {
    popup.setDOMContent(buildPopupContent(station));
    reanchor();
    instance.once('idle', reanchor);
    return;
  }

  closePopup();
  popupCallsign = callsign;
  popup = new Popup({ closeButton: true, closeOnClick: false, maxWidth: '280px', offset: 16 })
    .setLngLat(coordinates)
    .setDOMContent(buildPopupContent(station))
    .addTo(instance);

  popup.on('close', () => {
    if (suppressPopupCloseEmit) {
      return;
    }

    popup = undefined;
    popupCallsign = undefined;
    mapCanvas.value?.registerPopup(undefined);
    emit('dismiss');
  });

  mapCanvas.value?.registerPopup(popup);
  instance.once('idle', reanchor);
}

function syncPopupWhenDetailsChange(instance: MapLibreMap): void {
  const attempt = (): void => {
    try {
      syncPopup(instance);
    } catch {
      instance.once('idle', attempt);
    }
  };

  attempt();

  if (instance.isStyleLoaded() === false) {
    instance.once('idle', attempt);
  }
}

function onMoveStart(event: MapLibreEvent): void {
  if (event.originalEvent) {
    userMoved = true;
  }
}

function onMapClick(event: MapLayerMouseEvent): void {
  const instance = mapInstance();

  if (!instance) {
    return;
  }

  const hits = instance.queryRenderedFeatures(event.point, { layers: [CIRCLE_ID, LABEL_ID] });
  const callsign = hits[0]?.properties?.callsign;

  if (typeof callsign === 'string' && callsign.length > 0) {
    emit('select', callsign);
    return;
  }

  emit('dismiss');
}

function onPointerEnter(): void {
  const instance = mapInstance();

  if (instance) {
    instance.getCanvas().style.cursor = 'pointer';
  }
}

function onPointerLeave(): void {
  const instance = mapInstance();

  if (instance) {
    instance.getCanvas().style.cursor = '';
  }
}

function unbindPointer(instance: MapLibreMap): void {
  instance.off('movestart', onMoveStart);
  instance.off('click', onMapClick);

  for (const layerId of [CIRCLE_ID, LABEL_ID]) {
    instance.off('mouseenter', layerId, onPointerEnter);
    instance.off('mouseleave', layerId, onPointerLeave);
  }

  listenersBound = false;
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !props.detailsCall) {
    return;
  }

  const target = event.target;

  if (target instanceof HTMLElement) {
    const tag = target.tagName;

    if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
      return;
    }
  }

  emit('dismiss');
}

function bindPointer(instance: MapLibreMap): void {
  unbindPointer(instance);

  instance.on('movestart', onMoveStart);
  instance.on('click', onMapClick);

  for (const layerId of [CIRCLE_ID, LABEL_ID]) {
    instance.on('mouseenter', layerId, onPointerEnter);
    instance.on('mouseleave', layerId, onPointerLeave);
  }

  listenersBound = true;
}

function onReady(instance: MapLibreMap): void {
  setData(instance);
  bindPointer(instance);

  if (!userMoved && !didInitialFit && collection.value.features.length > 0) {
    fitStations(instance);
  }

  syncPopup(instance);
}

function onStyleLoad(instance: MapLibreMap): void {
  setData(instance);
  bindPointer(instance);
  syncPopup(instance);
}

function focus(callsign: string): void {
  const instance = mapInstance();
  const feature = collection.value.features.find((entry) => entry.properties.callsign === callsign);

  if (!instance || !feature) {
    return;
  }

  instance.easeTo({ center: feature.geometry.coordinates, duration: 300 });
}

function fit(): void {
  const instance = mapInstance();

  if (!instance) {
    return;
  }

  fitStations(instance);
}

defineExpose({ focus, fit });

watch(collection, () => {
  const instance = mapInstance();

  if (!instance?.isStyleLoaded()) {
    return;
  }

  setData(instance);

  if (!userMoved && !didInitialFit && collection.value.features.length > 0) {
    fitStations(instance);
  }
});

watch(popupKey, () => {
  const instance = mapInstance();

  if (!instance) {
    return;
  }

  syncPopupWhenDetailsChange(instance);
});

watch(
  () => props.detailsCall,
  () => {
    const instance = mapInstance();

    if (!instance) {
      return;
    }

    syncPopupWhenDetailsChange(instance);
  },
);

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown);
});

onUnmounted(() => {
  const instance = mapInstance();

  if (instance && listenersBound) {
    unbindPointer(instance);
  }

  window.removeEventListener('keydown', onWindowKeydown);
  closePopup();
});
</script>

<template>
  <MapCanvas ref="mapCanvas" class="h-full min-h-64 w-full" @ready="onReady" @style-load="onStyleLoad" />
</template>