<script setup lang="ts">
import {
  defaultStationDraft,
  draftFromRadioStation,
  stationDraftErrors,
  stationEditorCanSave,
  type RadioStation,
  type StationDraft,
  type StationLocationSource,
} from '~/utils/antenna-station';
import {
  dmsInputFromDecimal,
  emptyDmsInput,
  parseDmsInput,
  type DmsInput,
  type DmsParseResult,
} from '~/utils/location-format';
import { latLonToMaidenhead, maidenheadToLatLon, normalizeMaidenhead } from '~/utils/maidenhead';
import { revalidateShownFields, type ShownFormApi } from '~/utils/shown-form-errors';

const props = defineProps<{
  open: boolean;
  station?: RadioStation;
  /** Render the form in place. Preferences keeps the slideover. */
  embedded?: boolean;
  /** Onboarding hides this form's Save button and uses the guide's Continue button. */
  hideSave?: boolean;
  /** Unsaved Home edits kept by the guide while the step is not on screen. */
  sessionDraft?: StationDraft;
}>();

const emit = defineEmits<{
  'update:open': [open: boolean];
  save: [draft: StationDraft];
  draft: [draft: StationDraft];
}>();

const nickname = ref('');
const gridText = ref('');
const latitudeDms = ref<DmsInput>(emptyDmsInput('latitude'));
const longitudeDms = ref<DmsInput>(emptyDmsInput('longitude'));
const locationSource = ref<StationLocationSource | undefined>();
const form = ref<ShownFormApi | null>(null);
const locationFields = ['gridsquare', 'latitude', 'longitude'] as const;

const formState = computed(() => ({
  nickname: nickname.value,
  gridsquare: gridText.value,
  latitude: latitudeDms.value,
  longitude: longitudeDms.value,
}));

const isCreate = computed(() => props.station === undefined);
const title = computed(() => (isCreate.value ? 'Add station' : 'Edit station'));
const locationHint = 'A site with a Maidenhead grid and coordinates in degrees, minutes, and seconds. License grid is a starting point, not the shack.';
const description = computed(() => (isCreate.value ? locationHint : props.station?.nickname || 'Station'));

watch(
  () => props.open,
  (open) => {
    if (props.embedded || !open) {
      return;
    }

    applyDraft(props.station ? draftFromRadioStation(props.station) : defaultStationDraft());
  },
);

const restoredSession = ref(false);

function applyDraft(draft: StationDraft): void {
  nickname.value = draft.nickname;
  gridText.value = draft.gridsquare ?? '';
  latitudeDms.value = dmsInputFromDecimal(draft.latitude, 'latitude');
  longitudeDms.value = dmsInputFromDecimal(draft.longitude, 'longitude');
  locationSource.value = draft.locationSource;
}

watch(
  () => props.station,
  () => {
    if (!props.embedded || restoredSession.value) {
      return;
    }

    restoredSession.value = true;
    applyDraft(
      props.sessionDraft ?? (props.station ? draftFromRadioStation(props.station) : defaultStationDraft()),
    );
  },
  { immediate: true },
);

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

    void revalidateShownFields(form.value, locationFields);
    return;
  }

  locationSource.value = 'grid';
  const grid = normalizeMaidenhead(text);
  const point = grid ? maidenheadToLatLon(grid) : undefined;

  if (point) {
    latitudeDms.value = dmsInputFromDecimal(point.latitude, 'latitude');
    longitudeDms.value = dmsInputFromDecimal(point.longitude, 'longitude');
  }

  void revalidateShownFields(form.value, locationFields);
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

  void revalidateShownFields(form.value, locationFields);
}

function close(): void {
  emit('update:open', false);
}

function coordinateErrors(): { latitude?: string; longitude?: string } {
  const latitude = parseDmsInput(latitudeDms.value, 'latitude');
  const longitude = parseDmsInput(longitudeDms.value, 'longitude');
  const errors = stationDraftErrors(currentDraft());

  return {
    latitude: 'error' in latitude ? latitude.error : errors?.latitude,
    longitude: 'error' in longitude ? longitude.error : errors?.longitude,
  };
}

function canSaveDraft(): boolean {
  const coordinates = coordinateErrors();

  return stationEditorCanSave({
    draft: currentDraft(),
    latitudeError: coordinates.latitude,
    longitudeError: coordinates.longitude,
  });
}

function validateStation(): { name: string; message: string }[] {
  const draft = currentDraft();
  const errors = stationDraftErrors(draft);
  const coordinates = coordinateErrors();
  const messages: { name: string; message: string }[] = [];

  if (errors?.nickname) {
    messages.push({ name: 'nickname', message: errors.nickname });
  }

  if (errors?.gridsquare) {
    messages.push({ name: 'gridsquare', message: errors.gridsquare });
  }

  if (coordinates.latitude) {
    messages.push({ name: 'latitude', message: coordinates.latitude });
  }

  if (coordinates.longitude) {
    messages.push({ name: 'longitude', message: coordinates.longitude });
  }

  return messages;
}

watch(
  [nickname, gridText, latitudeDms, longitudeDms, locationSource],
  () => {
    if (!props.embedded || !props.hideSave) {
      return;
    }

    emit('draft', currentDraft());
  },
  { deep: true },
);

async function save(): Promise<boolean> {
  if (!form.value) {
    return false;
  }

  try {
    await form.value.validate();
  } catch {
    return false;
  }

  if (!canSaveDraft()) {
    return false;
  }

  emit('save', currentDraft());
  return true;
}

defineExpose({ save });
</script>

<template>
  <USlideover
    v-if="!embedded"
    :open="open"
    :title="title"
    :description="description"
    :ui="{ content: 'max-w-lg' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <UForm
        ref="form"
        :state="formState"
        :validate="validateStation"
        :loading-auto="false"
        class="space-y-4"
        @submit.prevent
      >
        <UFormField name="nickname" label="Nickname" required>
          <UInput v-model="nickname" class="w-full" placeholder="Home" />
        </UFormField>

        <UFormField
          name="gridsquare"
          label="Maidenhead grid"
          hint="Optional"
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
          name="latitude"
          axis="latitude"
          label="Latitude"
          @change="onCoordinateInput"
        />

        <DmsCoordinateInput
          v-model="longitudeDms"
          name="longitude"
          axis="longitude"
          label="Longitude"
          @change="onCoordinateInput"
        />
        <p class="text-xs text-muted">
          Degrees, minutes, and decimal seconds. Editing coordinates keeps that point and sets a 6-character grid.
        </p>
      </UForm>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <UButton color="neutral" variant="outline" label="Cancel" @click="close" />
        <UButton color="primary" :label="isCreate ? 'Add' : 'Save'" @click="save" />
      </div>
    </template>
  </USlideover>

  <div v-else class="flex flex-col gap-4 rounded-xl bg-default p-4 shadow-sm ring-1 ring-default">
    <p class="text-xs text-muted">{{ locationHint }}</p>
    <UForm
      ref="form"
      :state="formState"
      :validate="validateStation"
      :loading-auto="false"
      class="space-y-4"
      @submit.prevent
    >
      <UFormField name="nickname" label="Nickname" required>
        <UInput v-model="nickname" class="w-full" placeholder="Home" />
      </UFormField>

      <UFormField
        name="gridsquare"
        label="Maidenhead grid"
        hint="Optional"
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
        name="latitude"
        axis="latitude"
        label="Latitude"
        @change="onCoordinateInput"
      />

      <DmsCoordinateInput
        v-model="longitudeDms"
        name="longitude"
        axis="longitude"
        label="Longitude"
        @change="onCoordinateInput"
      />
      <p class="text-xs text-muted">
        Degrees, minutes, and decimal seconds. Editing coordinates keeps that point and sets a 6-character grid.
      </p>
    </UForm>
    <div v-if="!hideSave" class="flex justify-end">
      <UButton color="primary" label="Save" @click="save" />
    </div>
  </div>
</template>
