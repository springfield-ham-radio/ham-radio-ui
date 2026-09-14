<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import {
  formatAntennaBands,
  formatAntennaGeometry,
  formatAntennaSummary,
  formatHeadingDeg,
  formatStationLocation,
  formatStationSummary,
} from '~/utils/antenna-station';
import {
  antennaBandSelectItems,
  antennaBandsAreLineOfSight,
  antennaTypeById,
  antennaTypeSelectItems,
  antennaTypeUsesHeading,
  isAntennaTypeId,
  type AntennaBandId,
} from '~/utils/antenna-types';

const router = useRouter();
const {
  stations,
  selectedStationId,
  selectedStation,
  stationAntennas,
  selectedId,
  source,
  whatIf,
  resolved,
  selectAntenna,
  selectStation,
  setSource,
  setWhatIfType,
  setWhatIfHeight,
  setWhatIfHeading,
  setWhatIfBands,
  setWhatIfTrapped,
  saveWhatIfToStation,
  typeUsesHeading,
} = useStationAntennas();

const sourceItems: TabsItem[] = [
  { label: 'Owned', value: 'station' },
  { label: 'What-if', value: 'what-if' },
];

const typeItems = antennaTypeSelectItems();
const bandItems = antennaBandSelectItems();

const stationItems = computed(() =>
  stations.value.map((station) => ({
    label: formatStationSummary(station),
    value: station.id,
  })),
);

const ownedItems = computed(() =>
  stationAntennas.value.map((antenna) => ({
    label: formatAntennaSummary(antenna),
    value: antenna.id,
  })),
);

const sourceModel = computed({
  get: () => source.value,
  set: (value: string | number) => {
    if (value === 'station' || value === 'what-if') {
      setSource(value);
    }
  },
});

const selectedStationModel = computed({
  get: () => selectedStationId.value,
  set: (value: string | undefined) => {
    if (value) {
      selectStation(value);
    }
  },
});

const selectedModel = computed({
  get: () => selectedId.value,
  set: (value: string | undefined) => {
    if (value) {
      selectAntenna(value);
    }
  },
});

const whatIfUsesHeading = computed(() => typeUsesHeading(whatIf.value.typeId));
const whatIfUsesTraps = computed(() => antennaTypeById(whatIf.value.typeId)?.supportsTraps === true);

const whatIfBands = computed({
  get: () => whatIf.value.bands ?? antennaTypeById(whatIf.value.typeId)?.defaultBands ?? [],
  set: (value: AntennaBandId[]) => {
    setWhatIfBands(value);
  },
});

const takeoffLabel = computed(() => {
  if (!resolved.value) {
    return undefined;
  }

  return `${resolved.value.takeoffDeg}° (estimate)`;
});

const isLineOfSight = computed(() =>
  resolved.value ? antennaBandsAreLineOfSight(resolved.value.bands) : false,
);

const locationLabel = computed(() => {
  if (resolved.value) {
    return formatStationLocation(resolved.value);
  }

  if (selectedStation.value) {
    return formatStationLocation(selectedStation.value);
  }

  return 'Location not set';
});

const gainLabel = computed(() => {
  if (!resolved.value) {
    return undefined;
  }

  const type = resolved.value.type;
  const heading = formatHeadingDeg(resolved.value.headingDeg, antennaTypeUsesHeading(type));
  const beam = type.pattern === 'omni' ? 'omni' : `${type.beamwidthDeg}° beam`;
  const parts = [`${resolved.value.gainDbi} dBi`, beam];

  if (heading) {
    parts.push(heading);
  }

  return parts.join(' · ');
});

function onWhatIfType(value: string): void {
  if (isAntennaTypeId(value)) {
    setWhatIfType(value);
  }
}

function goToPreferences(): void {
  void router.push({ path: '/preferences', query: { section: 'stations' } });
}

function onWhatIfHeightText(value: string | number): void {
  const next = Number(value);

  if (Number.isFinite(next)) {
    setWhatIfHeight(next);
  }
}

function onWhatIfHeadingText(value: string | number): void {
  const next = Number(value);

  if (Number.isFinite(next)) {
    setWhatIfHeading(next);
  }
}

function onWhatIfTrapped(value: boolean): void {
  setWhatIfTrapped(value);
}

function onSaveWhatIf(): void {
  saveWhatIfToStation();
}
</script>

<template>
  <section class="flex flex-col gap-3">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="min-w-0">
        <h3 class="text-sm font-semibold text-highlighted">Antenna</h3>
        <p class="text-xs text-muted">
          Owned antennas at a station, or a scratch what-if. Catalog estimates, not a path forecast.
        </p>
      </div>
      <UTabs
        v-model="sourceModel"
        :items="sourceItems"
        :content="false"
        color="neutral"
        variant="pill"
        size="xs"
        class="w-auto"
        :ui="{ list: 'w-auto', trigger: 'grow-0' }"
      />
    </div>

    <UCard :ui="{ body: 'p-3 sm:p-4' }" class="bg-default">
      <div class="flex flex-col gap-3">
        <UFormField label="Station">
          <USelect
            v-model="selectedStationModel"
            :items="stationItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <p class="text-xs text-muted">{{ locationLabel }}</p>

        <div v-if="source === 'station'" class="flex flex-col gap-3">
          <div v-if="stationAntennas.length === 0" class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm text-muted">No antennas at this station yet.</p>
            <UButton
              label="Add in Preferences"
              color="neutral"
              variant="outline"
              size="xs"
              icon="i-lucide-settings"
              @click="goToPreferences"
            />
          </div>
          <template v-else>
            <UFormField label="Owned">
              <USelect
                v-model="selectedModel"
                :items="ownedItems"
                value-key="value"
                class="w-full"
              />
            </UFormField>
            <dl v-if="resolved" class="grid gap-2 text-xs sm:grid-cols-3">
              <div>
                <dt class="text-muted">Geometry</dt>
                <dd class="font-medium text-highlighted">{{ formatAntennaGeometry(resolved) }}</dd>
              </div>
              <div>
                <dt class="text-muted">Pattern</dt>
                <dd class="font-medium text-highlighted">{{ gainLabel }}</dd>
              </div>
              <div>
                <dt class="text-muted">Takeoff</dt>
                <dd class="font-medium text-highlighted">{{ takeoffLabel }}</dd>
              </div>
            </dl>
            <p v-if="resolved" class="text-xs text-muted">{{ formatAntennaBands(resolved.bands, resolved.trapped) }}</p>
            <p v-if="isLineOfSight" class="text-xs text-muted">Line-of-sight and tropo — not HF skip.</p>
          </template>
        </div>

      <div v-else class="flex flex-col gap-3">
        <div class="grid gap-3 sm:grid-cols-3">
          <UFormField label="Type">
            <USelect
              :model-value="whatIf.typeId"
              :items="typeItems"
              value-key="value"
              class="w-full"
              @update:model-value="onWhatIfType"
            />
          </UFormField>
          <UFormField label="Height AGL (m)">
            <UInput
              :model-value="String(whatIf.heightAglM)"
              inputmode="decimal"
              class="w-full tabular-nums"
              @update:model-value="onWhatIfHeightText"
            />
          </UFormField>
          <UFormField v-if="whatIfUsesHeading" label="Heading (°)">
            <UInput
              :model-value="whatIf.headingDeg === undefined ? '' : String(whatIf.headingDeg)"
              inputmode="numeric"
              class="w-full tabular-nums"
              @update:model-value="onWhatIfHeadingText"
            />
          </UFormField>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Bands">
            <USelectMenu
              v-model="whatIfBands"
              :items="bandItems"
              value-key="id"
              multiple
              class="w-full"
              :search-input="false"
            />
          </UFormField>
          <UFormField v-if="whatIfUsesTraps" label="Traps">
            <USwitch
              :model-value="whatIf.trapped === true"
              label="Trapped"
              @update:model-value="onWhatIfTrapped"
            />
          </UFormField>
        </div>
        <dl v-if="resolved" class="grid gap-2 text-xs sm:grid-cols-3">
          <div>
            <dt class="text-muted">Geometry</dt>
            <dd class="font-medium text-highlighted">{{ formatAntennaGeometry(resolved) }}</dd>
          </div>
          <div>
            <dt class="text-muted">Pattern</dt>
            <dd class="font-medium text-highlighted">{{ gainLabel }}</dd>
          </div>
          <div>
            <dt class="text-muted">Takeoff</dt>
            <dd class="font-medium text-highlighted">{{ takeoffLabel }}</dd>
          </div>
        </dl>
        <p v-if="resolved" class="text-xs text-muted">{{ formatAntennaBands(resolved.bands, resolved.trapped) }}</p>
        <p v-if="isLineOfSight" class="text-xs text-muted">Line-of-sight and tropo — not HF skip.</p>
        <div class="flex justify-end">
          <UButton
            label="Add to station"
            color="neutral"
            variant="outline"
            size="xs"
            icon="i-lucide-plus"
            @click="onSaveWhatIf"
          />
        </div>
      </div>
      </div>
    </UCard>
  </section>
</template>
