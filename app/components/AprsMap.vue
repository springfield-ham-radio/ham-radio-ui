<script setup lang="ts">
import {
  LngLatBounds,
  Popup,
  type GeoJSONSource,
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
  type MapLibreEvent,
} from 'maplibre-gl';
import { aprsMapBounds, aprsMapFeatures, aprsMapPopupLines } from '~/utils/aprs-map';
import type { AprsStation } from '~/utils/aprs-stations';

const SOURCE_ID = 'aprs-stations';
const CIRCLE_ID = 'aprs-stations-circle';
const LABEL_ID = 'aprs-stations-label';

const props = defineProps<{
  stations: AprsStation[];
  selectedCall?: string;
}>();

const emit = defineEmits<{
  select: [callsign: string];
}>();

const mapCanvas = useTemplateRef('mapCanvas');
const collection = computed(() => aprsMapFeatures(props.stations, props.selectedCall));
const popupKey = computed(() => {
  const station = props.stations.find((entry) => entry.callsign === props.selectedCall);

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
      paint: {
        'circle-radius': ['case', ['==', ['get', 'selected'], 1], 8, 6],
        'circle-color': ['case', ['==', ['get', 'selected'], 1], '#c2410c', '#0f766e'],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    });
  }

  if (!instance.getLayer(LABEL_ID)) {
    instance.addLayer({
      id: LABEL_ID,
      type: 'symbol',
      source: SOURCE_ID,
      layout: {
        'text-field': ['get', 'callsign'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-offset': [0, 1.15],
        'text-anchor': 'top',
      },
      paint: {
        'text-color': '#0f172a',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.2,
      },
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

function closePopup(): void {
  popup?.remove();
  popup = undefined;
  mapCanvas.value?.registerPopup(undefined);
}

function syncPopup(instance: MapLibreMap): void {
  const station = props.stations.find((entry) => entry.callsign === props.selectedCall);
  const feature = collection.value.features.find((entry) => entry.properties.callsign === props.selectedCall);

  if (!station || !feature) {
    closePopup();
    return;
  }

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

  closePopup();
  popup = new Popup({ closeButton: true, closeOnClick: false, maxWidth: '280px', offset: 16 })
    .setLngLat(feature.geometry.coordinates)
    .setDOMContent(root)
    .addTo(instance);
  mapCanvas.value?.registerPopup(popup);
}

function onMoveStart(event: MapLibreEvent): void {
  if (event.originalEvent) {
    userMoved = true;
  }
}

function onLayerClick(event: MapLayerMouseEvent): void {
  const callsign = event.features?.[0]?.properties?.callsign;

  if (typeof callsign === 'string' && callsign.length > 0) {
    emit('select', callsign);
  }
}

function bind(instance: MapLibreMap): void {
  if (listenersBound) {
    return;
  }

  listenersBound = true;
  instance.on('movestart', onMoveStart);
  instance.on('click', CIRCLE_ID, onLayerClick);
  instance.on('click', LABEL_ID, onLayerClick);
  instance.on('mouseenter', CIRCLE_ID, () => {
    instance.getCanvas().style.cursor = 'pointer';
  });
  instance.on('mouseleave', CIRCLE_ID, () => {
    instance.getCanvas().style.cursor = '';
  });
}

function onReady(instance: MapLibreMap): void {
  setData(instance);
  bind(instance);

  if (!userMoved && !didInitialFit && collection.value.features.length > 0) {
    fitStations(instance);
  }

  syncPopup(instance);
}

function onStyleLoad(instance: MapLibreMap): void {
  listenersBound = false;
  setData(instance);
  bind(instance);
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

  if (!instance?.isStyleLoaded()) {
    return;
  }

  syncPopup(instance);
});

onUnmounted(() => {
  const instance = mapInstance();

  if (instance && listenersBound) {
    instance.off('movestart', onMoveStart);
    instance.off('click', CIRCLE_ID, onLayerClick);
    instance.off('click', LABEL_ID, onLayerClick);
  }

  closePopup();
});
</script>

<template>
  <MapCanvas ref="mapCanvas" class="h-full min-h-64 w-full" @ready="onReady" @style-load="onStyleLoad" />
</template>
