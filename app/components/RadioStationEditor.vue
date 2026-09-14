<script setup lang="ts">
import {
  defaultStationDraft,
  draftFromRadioStation,
  stationDraftErrors,
  type RadioStation,
  type StationDraft,
  type StationLocationSource,
} from '~/utils/antenna-station';
import {
  dmsInputFromDecimal,
  emptyDmsInput,
  latLonToMaidenhead,
  maidenheadToLatLon,
  normalizeMaidenhead,
  parseDmsInput,
  type DmsInput,
  type DmsParseResult,
} from '~/utils/maidenhead';

const props = defineProps<{
  open: boolean;
  station?: RadioStation;
}>();

const emit = defineEmits<{
  'update:open': [open: boolean];
  save: [draft: StationDraft];
}>();

const nickname = ref('');
const gridText = ref('');
const latitudeDms = ref<DmsInput>(emptyDmsInput('latitude'));
const longitudeDms = ref<DmsInput>(emptyDmsInput('longitude'));
const locationSource = ref<StationLocationSource | undefined>();
const nicknameError = ref<string | undefined>();
const gridError = ref<string | undefined>();
const latitudeError = ref<string | undefined>();
const longitudeError = ref<string | undefined>();

const isCreate = computed(() => props.station === undefined);
const title = computed(() => (isCreate.value ? 'Add station' : 'Edit station'));
const description = computed(() =>
  isCreate.value
    ? 'A site with a Maidenhead grid and coordinates in degrees, minutes, and seconds. License grid is a starting point, not the shack.'
    : props.station?.nickname || 'Station',
);

watch(
  () => props.open,
  (open) => {
    if (!open) {
      return;
    }

    applyDraft(props.station ? draftFromRadioStation(props.station) : defaultStationDraft());
  },
);

function applyDraft(draft: StationDraft): void {
  nickname.value = draft.nickname;
  gridText.value = draft.gridsquare ?? '';
  latitudeDms.value = dmsInputFromDecimal(draft.latitude, 'latitude');
  longitudeDms.value = dmsInputFromDecimal(draft.longitude, 'longitude');
  locationSource.value = draft.locationSource;
  nicknameError.value = undefined;
  gridError.value = undefined;
  latitudeError.value = undefined;
  longitudeError.value = undefined;
}

function parsedDecimal(result: DmsParseResult): number | undefined {
  return 'value' in result ? result.value : undefined;
}

function currentDraft(): StationDraft {
  return {
    nickname: nickname.value,
    gridsquare: gridText.value.trim() || undefined,
    latitude: parsedDecimal(parseDmsInput(latitudeDms.value, 'latitude')),
    longitude: parsedDecimal(parseDmsInput(longitudeDms.value, 'longitude')),
    locationSource: locationSource.value,
  };
}

function onGridInput(value: string | number): void {
  const text = String(value);
  gridText.value = text;

  if (!text.trim()) {
    if (locationSource.value === 'grid') {
      latitudeDms.value = emptyDmsInput('latitude');
      longitudeDms.value = emptyDmsInput('longitude');
      locationSource.value = undefined;
    }

    return;
  }

  locationSource.value = 'grid';
  const grid = normalizeMaidenhead(text);
  const point = grid ? maidenheadToLatLon(grid) : undefined;

  if (point) {
    latitudeDms.value = dmsInputFromDecimal(point.latitude, 'latitude');
    longitudeDms.value = dmsInputFromDecimal(point.longitude, 'longitude');
  }
}

function onCoordinateInput(): void {
  const latitude = parseDmsInput(latitudeDms.value, 'latitude');
  const longitude = parseDmsInput(longitudeDms.value, 'longitude');

  if (!latitude.empty || !longitude.empty) {
    locationSource.value = 'coordinates';
  }

  const latitudeValue = parsedDecimal(latitude);
  const longitudeValue = parsedDecimal(longitude);

  if (latitudeValue === undefined || longitudeValue === undefined) {
    return;
  }

  const grid = latLonToMaidenhead(latitudeValue, longitudeValue, 6);

  if (grid) {
    gridText.value = grid;
  }
}

function close(): void {
  emit('update:open', false);
}

function save(): void {
  const latitude = parseDmsInput(latitudeDms.value, 'latitude');
  const longitude = parseDmsInput(longitudeDms.value, 'longitude');
  const draft = currentDraft();
  const errors = stationDraftErrors(draft);

  nicknameError.value = errors?.nickname;
  gridError.value = errors?.gridsquare;
  latitudeError.value = 'error' in latitude ? latitude.error : errors?.latitude;
  longitudeError.value = 'error' in longitude ? longitude.error : errors?.longitude;

  if (nicknameError.value || gridError.value || latitudeError.value || longitudeError.value) {
    return;
  }

  emit('save', draft);
}
</script>

<template>
  <USlideover
    :open="open"
    :title="title"
    :description="description"
    :ui="{ content: 'max-w-lg' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField label="Nickname" :error="nicknameError" required>
          <UInput v-model="nickname" class="w-full" placeholder="Home" />
        </UFormField>

        <UFormField
          label="Maidenhead grid"
          hint="Optional"
          :error="gridError"
          description="2, 4, or 6 characters. Editing the grid sets latitude and longitude to the cell center."
        >
          <UInput
            :model-value="gridText"
            class="w-full uppercase"
            placeholder="EM48"
            @update:model-value="onGridInput"
          />
        </UFormField>

        <DmsCoordinateInput
          v-model="latitudeDms"
          axis="latitude"
          label="Latitude"
          :error="latitudeError"
          @change="onCoordinateInput"
        />

        <DmsCoordinateInput
          v-model="longitudeDms"
          axis="longitude"
          label="Longitude"
          :error="longitudeError"
          @change="onCoordinateInput"
        />
        <p class="text-xs text-muted">
          Degrees, minutes, and decimal seconds. Editing coordinates keeps that point and sets a 6-character grid.
        </p>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <UButton color="neutral" variant="outline" label="Cancel" @click="close" />
        <UButton color="primary" :label="isCreate ? 'Add' : 'Save'" @click="save" />
      </div>
    </template>
  </USlideover>
</template>
