<script setup lang="ts">
import { formatStationSummary, hasStationLocation, type RadioStation } from '~/utils/antenna-station';
import { TRIP_START_COORDINATES, TRIP_START_NONE, typedCoordinateError } from '~/utils/trip-channels';

const startId = defineModel<string>('startId', { required: true });
const latitudeText = defineModel<string>('latitudeText', { required: true });
const longitudeText = defineModel<string>('longitudeText', { required: true });

const props = defineProps<{
  stations: RadioStation[];
}>();

const items = computed(() => [
  { label: 'None', value: TRIP_START_NONE },
  ...props.stations.filter((station) => hasStationLocation(station)).map((station) => ({
    label: formatStationSummary(station),
    value: station.id,
  })),
  { label: 'Type coordinates', value: TRIP_START_COORDINATES },
]);

const latitudeError = computed(() =>
  startId.value === TRIP_START_COORDINATES ? typedCoordinateError(latitudeText.value, 'latitude') : undefined,
);
const longitudeError = computed(() =>
  startId.value === TRIP_START_COORDINATES ? typedCoordinateError(longitudeText.value, 'longitude') : undefined,
);
</script>

<template>
  <UFormField label="Distance from" class="w-64">
    <USelect
      v-model="startId"
      :items="items"
      value-key="value"
      color="neutral"
      size="sm"
      class="w-full"
      aria-label="Distance from"
    />
  </UFormField>
  <UFormField v-if="startId === TRIP_START_COORDINATES" label="Latitude" :error="latitudeError" class="w-32">
    <UInput v-model="latitudeText" placeholder="39.0997" size="sm" class="w-full" aria-label="Start latitude" />
  </UFormField>
  <UFormField v-if="startId === TRIP_START_COORDINATES" label="Longitude" :error="longitudeError" class="w-32">
    <UInput v-model="longitudeText" placeholder="-94.5786" size="sm" class="w-full" aria-label="Start longitude" />
  </UFormField>
</template>
