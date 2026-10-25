<script setup lang="ts">
import {
  HOME_STATION_ID,
  antennaIsAtStation,
  formatStationLocation,
  type AntennaDraft,
  type StationDraft,
} from '~/utils/antenna-station';
import { formatLatitude, formatLongitude, locatedPoint } from '~/utils/location-format';

const { stations, antennas, addStation, addAntenna } = useStationAntennas();

const stationOpen = ref(false);
const antennaOpen = ref(false);

const home = computed(() => stations.value.find((station) => station.id === HOME_STATION_ID));
const homePoint = computed(() => locatedPoint(home.value?.latitude, home.value?.longitude));
const homeGrid = computed(() => home.value?.gridsquare?.trim() || 'Grid not set');
const homeDms = computed(() => {
  const point = homePoint.value;

  if (!point) {
    return 'Coordinates not set';
  }

  return `${formatLatitude(point.latitude)} ${formatLongitude(point.longitude)}`;
});
const otherStations = computed(() => stations.value.filter((station) => station.id !== HOME_STATION_ID));
const homeAntennas = computed(() => antennas.value.filter((antenna) => antennaIsAtStation(antenna, HOME_STATION_ID)));

function onStationSave(draft: StationDraft): void {
  addStation(draft);
  stationOpen.value = false;
}

function onAntennaSave(draft: AntennaDraft): void {
  addAntenna({ ...draft, stationId: HOME_STATION_ID });
  antennaOpen.value = false;
}
</script>

<template>
  <div class="mt-4 flex flex-col gap-4">
    <div class="overflow-hidden rounded-xl bg-default p-4 shadow-sm ring-1 ring-default">
      <p class="text-sm font-medium text-highlighted">Other places you operate</p>
      <p class="mt-1 text-xs text-muted">
        Home is set up. If you also operate from somewhere else — a cabin, club station, or portable spot — add it here.
        You can also add the antennas at Home. This is optional.
      </p>
    </div>

    <div class="flex items-center gap-3 rounded-lg bg-muted px-3 py-2.5">
      <UIcon name="i-lucide-circle-check" class="size-5 shrink-0 text-success" />
      <div class="min-w-0">
        <p class="truncate text-sm font-medium text-highlighted">{{ home?.nickname || 'Home' }}</p>
        <p class="truncate text-xs text-muted">{{ homeGrid }}</p>
        <p class="truncate text-xs text-muted">{{ homeDms }}</p>
      </div>
    </div>

    <div class="flex flex-wrap gap-2">
      <UButton
        label="Add another station"
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        @click="stationOpen = true"
      />
      <UButton
        label="Add antenna at Home"
        icon="i-lucide-antenna"
        color="neutral"
        variant="outline"
        @click="antennaOpen = true"
      />
    </div>

    <ul v-if="otherStations.length > 0 || homeAntennas.length > 0" class="divide-y divide-default rounded-lg bg-muted">
      <li v-for="station in otherStations" :key="station.id" class="px-3 py-2">
        <p class="truncate text-sm font-medium text-highlighted">{{ station.nickname }}</p>
        <p class="truncate text-xs text-muted">{{ formatStationLocation(station) }}</p>
      </li>
      <li v-for="antenna in homeAntennas" :key="antenna.id" class="px-3 py-2">
        <p class="truncate text-sm font-medium text-highlighted">{{ antenna.nickname }}</p>
        <p class="truncate text-xs text-muted">Antenna at Home</p>
      </li>
    </ul>

    <RadioStationEditor v-model:open="stationOpen" @save="onStationSave" />
    <AntennaStationEditor v-model:open="antennaOpen" :station-id="HOME_STATION_ID" @save="onAntennaSave" />
  </div>
</template>
