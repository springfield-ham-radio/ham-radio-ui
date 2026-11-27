<script setup lang="ts">
import {
  APRS_BEACON_INTERVAL_DEFAULT,
  APRS_BEACON_INTERVAL_MIN,
  APRS_BEACON_PATH_DEFAULT,
  APRS_BEACON_SYMBOLS,
  aprsBeaconSettingsError,
  beaconAltitudeError,
  beaconCommentError,
  beaconPathError,
  clampBeaconIntervalMinutes,
  defaultSavedRadioAprsBeacon,
  parseBeaconAltitudeFeet,
  type SavedRadioAprsBeacon,
} from '~/utils/aprs-beacon';
import {
  formatAprsBeaconSummaryPosition,
  resolveAprsBeaconLocation,
} from '~/utils/aprs-beacon-location';
import { canonicalAx25Call } from '~/utils/aprs-ax25';
import { callsignError } from '~/utils/aprs-message';
import { formatAprsHeardAt } from '~/utils/aprs-display';
import {
  dmsInputFromDecimal,
  emptyDmsInput,
  parseDmsInput,
  type DmsInput,
  type DmsParseResult,
} from '~/utils/location-format';

const props = defineProps<{
  cardId?: string;
  mine: string;
}>();

const host = useAprsHost();
const { radioById, rememberSavedRadioAprsBeacon } = useSavedRadios();
const { store: antennaStore, selectedStationId } = useStationAntennas();

if (props.cardId) {
  host.watchCard(props.cardId);
}

const snapshot = computed(() => (props.cardId ? host.snapshots.value[props.cardId] : undefined));
const modalOpen = ref(false);
const modalValidated = ref(false);
const latTouched = ref(false);
const lonTouched = ref(false);
const altTouched = ref(false);
const prefillSourceLabel = ref<string | undefined>();

const settings = ref<SavedRadioAprsBeacon>(defaultSavedRadioAprsBeacon());
const latitudeDms = ref<DmsInput>(emptyDmsInput('latitude'));
const longitudeDms = ref<DmsInput>(emptyDmsInput('longitude'));
const altitudeText = ref('');
const symbolKey = ref('/-');
const intervalArmed = ref(false);

function parsedDecimal(result: DmsParseResult): number | undefined {
  return 'value' in result ? result.value : undefined;
}

interface FormSnapshot {
  settings: SavedRadioAprsBeacon;
  latitudeDms: DmsInput;
  longitudeDms: DmsInput;
  altitudeText: string;
  symbolKey: string;
}

function captureFormSnapshot(): FormSnapshot {
  return {
    settings: { ...settings.value },
    latitudeDms: { ...latitudeDms.value },
    longitudeDms: { ...longitudeDms.value },
    altitudeText: altitudeText.value,
    symbolKey: symbolKey.value,
  };
}

let modalBaseline: FormSnapshot = captureFormSnapshot();

function applySnapshot(snapshot: FormSnapshot): void {
  settings.value = { ...snapshot.settings };
  latitudeDms.value = { ...snapshot.latitudeDms };
  longitudeDms.value = { ...snapshot.longitudeDms };
  altitudeText.value = snapshot.altitudeText;
  symbolKey.value = snapshot.symbolKey;
}

function applyStored(stored: SavedRadioAprsBeacon): void {
  prefillSourceLabel.value = undefined;
  settings.value = { ...stored };
  latitudeDms.value = dmsInputFromDecimal(stored.latitude, 'latitude');
  longitudeDms.value = dmsInputFromDecimal(stored.longitude, 'longitude');
  altitudeText.value = stored.altitudeFt !== undefined ? String(stored.altitudeFt) : '';
  symbolKey.value = `${stored.symbolTable}${stored.symbolCode}`;
}

function applyPrefill(): void {
  const prefill = resolveAprsBeaconLocation(antennaStore.value);

  if (!prefill) {
    latitudeDms.value = emptyDmsInput('latitude');
    longitudeDms.value = emptyDmsInput('longitude');
    altitudeText.value = '';
    prefillSourceLabel.value = undefined;
    settings.value = defaultSavedRadioAprsBeacon();
    symbolKey.value = '/-';
    return;
  }

  prefillSourceLabel.value = prefill.label;
  settings.value = defaultSavedRadioAprsBeacon();
  latitudeDms.value = dmsInputFromDecimal(prefill.latitude, 'latitude');
  longitudeDms.value = dmsInputFromDecimal(prefill.longitude, 'longitude');
  altitudeText.value = '';
  symbolKey.value = '/-';
}

function onCoordinateInput(axis: 'latitude' | 'longitude'): void {
  if (axis === 'latitude') {
    latTouched.value = true;
    return;
  }

  lonTouched.value = true;
}

function draftFromParts(
  settingsBase: SavedRadioAprsBeacon,
  latDms: DmsInput,
  lonDms: DmsInput,
  altText: string,
): SavedRadioAprsBeacon | undefined {
  const latitude = parsedDecimal(parseDmsInput(latDms, 'latitude'));
  const longitude = parsedDecimal(parseDmsInput(lonDms, 'longitude'));

  if (latitude === undefined || longitude === undefined) {
    return undefined;
  }

  const altitude = parseBeaconAltitudeFeet(altText);

  if (altitude.error) {
    return undefined;
  }

  const { altitudeFt: _dropped, ...settingsRest } = settingsBase;

  return {
    ...settingsRest,
    latitude,
    longitude,
    ...(altitude.feet !== undefined ? { altitudeFt: altitude.feet } : {}),
  };
}

function buildSettingsFromFormSnapshot(snapshot: FormSnapshot): SavedRadioAprsBeacon | undefined {
  const draft = draftFromParts(snapshot.settings, snapshot.latitudeDms, snapshot.longitudeDms, snapshot.altitudeText);

  if (!draft || aprsBeaconSettingsError(draft)) {
    return undefined;
  }

  return draft;
}

watch(
  () => radioById(props.cardId)?.aprsBeacon,
  (stored) => {
    if (stored) {
      applyStored(stored);
      return;
    }

    applyPrefill();
  },
  { immediate: true },
);

watch(selectedStationId, () => {
  if (!radioById(props.cardId)?.aprsBeacon) {
    applyPrefill();
  }
});

const symbolItems = APRS_BEACON_SYMBOLS.map((entry) => ({
  label: entry.label,
  value: `${entry.table}${entry.code}`,
}));

function showLatFieldError(): boolean {
  return latTouched.value || modalValidated.value;
}

function showLonFieldError(): boolean {
  return lonTouched.value || modalValidated.value;
}

function showAltFieldError(): boolean {
  return altTouched.value || modalValidated.value;
}

function coordinateFieldError(axis: 'latitude' | 'longitude', touched: boolean): string | undefined {
  if (!touched && !modalValidated.value) {
    return undefined;
  }

  const parsed = parseDmsInput(axis === 'latitude' ? latitudeDms.value : longitudeDms.value, axis);

  if ('error' in parsed) {
    return parsed.error;
  }

  if (parsed.empty) {
    return axis === 'latitude'
      ? 'Enter latitude in degrees, minutes, and seconds.'
      : 'Enter longitude in degrees, minutes, and seconds.';
  }

  return undefined;
}

const latitudeError = computed(() => coordinateFieldError('latitude', latTouched.value));

const longitudeError = computed(() => coordinateFieldError('longitude', lonTouched.value));

const commentError = computed(() => (modalValidated.value ? beaconCommentError(settings.value.comment ?? '') : undefined));
const altitudeError = computed(() => (showAltFieldError() ? beaconAltitudeError(altitudeText.value) : undefined));
const pathError = computed(() => (modalValidated.value ? beaconPathError(settings.value.path) : undefined));

const draftFromForm = computed((): SavedRadioAprsBeacon | undefined =>
  draftFromParts(settings.value, latitudeDms.value, longitudeDms.value, altitudeText.value));

const formError = computed(() => {
  const altitude = parseBeaconAltitudeFeet(altitudeText.value);

  if (altitude.error) {
    return altitude.error;
  }

  const latitude = parseDmsInput(latitudeDms.value, 'latitude');
  const longitude = parseDmsInput(longitudeDms.value, 'longitude');

  if ('error' in latitude) {
    return latitude.error;
  }

  if ('error' in longitude) {
    return longitude.error;
  }

  if (latitude.empty || longitude.empty) {
    return 'Enter latitude and longitude in degrees, minutes, and seconds.';
  }

  if (!draftFromForm.value) {
    return 'Enter a valid latitude and longitude';
  }

  return aprsBeaconSettingsError(draftFromForm.value);
});

function buildSettings(): SavedRadioAprsBeacon | undefined {
  const draft = draftFromForm.value;

  if (!draft || aprsBeaconSettingsError(draft)) {
    return undefined;
  }

  return draft;
}

const mineReady = computed(() => canonicalAx25Call(props.mine) !== undefined);
const mineBlock = computed(() => (mineReady.value ? undefined : callsignError(props.mine) ?? 'Set My callsign to beacon'));

const kissBlock = computed(() => {
  if (!snapshot.value?.connected) {
    return 'Listen is not open. Nothing was sent.';
  }

  if (!snapshot.value.hardwareTransmit) {
    return 'This session does not transmit.';
  }

  if (!snapshot.value.kissConfirmed) {
    return 'This Listen has no AX.25 UI frame. A KISS frame that is not a UI frame does not count. Nothing was sent.';
  }

  return undefined;
});

const sendBlock = computed(() => mineBlock.value ?? formError.value ?? kissBlock.value);

/** Interval and arm/disarm use committed settings; in-modal edits wait for Save. */
const settingsForIntervalGate = computed((): SavedRadioAprsBeacon | undefined => {
  if (modalOpen.value) {
    return buildSettingsFromFormSnapshot(modalBaseline);
  }

  return buildSettings();
});

const intervalGateError = computed(() => {
  const draft = settingsForIntervalGate.value;

  if (!draft) {
    return formError.value ?? 'Enter latitude and longitude in degrees, minutes, and seconds.';
  }

  return aprsBeaconSettingsError(draft);
});

const intervalBlocked = computed(() => Boolean(mineBlock.value ?? intervalGateError.value ?? kissBlock.value));

const symbolLabel = computed(() => {
  const match = APRS_BEACON_SYMBOLS.find((entry) => entry.table === settings.value.symbolTable && entry.code === settings.value.symbolCode);

  return match?.label ?? `${settings.value.symbolTable}${settings.value.symbolCode}`;
});

const positionSummary = computed(() => {
  const draft = buildSettings();

  if (!draft) {
    return 'No position';
  }

  const position = formatAprsBeaconSummaryPosition(draft.latitude, draft.longitude);
  const prefix = prefillSourceLabel.value ? `From ${prefillSourceLabel.value}` : undefined;

  return prefix ? `${prefix}: ${position}` : position;
});

const commentSummary = computed(() => {
  const text = settings.value.comment?.trim();

  if (!text) {
    return undefined;
  }

  return text.length > 24 ? `${text.slice(0, 24)}…` : text;
});

const beaconStatus = computed(() => {
  const detail = snapshot.value?.lastBeaconDetail;
  const at = snapshot.value?.lastBeaconAt;

  if (!detail) {
    return 'Not sent this connection';
  }

  if (at !== undefined && detail === 'Sent') {
    return `Sent ${formatAprsHeardAt(at)}`;
  }

  return detail;
});

const intervalHint = computed(() => {
  if (snapshot.value?.beaconIntervalArmed) {
    return `Every ${settings.value.intervalMinutes} min on this connection until Disconnect.`;
  }

  return `Min ${APRS_BEACON_INTERVAL_MIN}, default ${APRS_BEACON_INTERVAL_DEFAULT}. Off each Connect.`;
});

function onSymbol(value: string | number): void {
  const key = String(value);

  if (key.length !== 2) {
    return;
  }

  symbolKey.value = key;
  settings.value.symbolTable = key[0] ?? '/';
  settings.value.symbolCode = key[1] ?? '-';
}

function persistSettings(draftOverride?: SavedRadioAprsBeacon): void {
  const draft = draftOverride ?? buildSettings();

  if (!props.cardId || !draft) {
    return;
  }

  settings.value = draft;
  prefillSourceLabel.value = undefined;
  rememberSavedRadioAprsBeacon(props.cardId, draft);
}

function onPath(value: string | number): void {
  settings.value.path = String(value).toUpperCase();
}

function onComment(value: string | number): void {
  const text = String(value);

  settings.value.comment = text.trim().length > 0 ? text : undefined;
}

function onIntervalMinutes(value: string | number): void {
  settings.value.intervalMinutes = clampBeaconIntervalMinutes(Number(value));
}

async function onBeaconNow(): Promise<void> {
  if (!props.cardId || sendBlock.value) {
    return;
  }

  const draft = buildSettings();

  if (!draft) {
    return;
  }

  settings.value = draft;
  persistSettings();
  await host.sendBeacon(props.cardId, { mine: props.mine, settings: draft });
}

function onInterval(armed: boolean): void {
  if (!props.cardId || intervalBlocked.value) {
    return;
  }

  const draft = settingsForIntervalGate.value;

  if (Boolean(armed) && !draft) {
    return;
  }

  intervalArmed.value = Boolean(armed);

  if (draft && !modalOpen.value) {
    settings.value = draft;
    persistSettings();
  }

  host.setBeaconInterval(props.cardId, {
    armed: intervalArmed.value,
    minutes: draft?.intervalMinutes ?? settings.value.intervalMinutes,
    mine: props.mine,
    settings: draft ?? { ...settings.value },
  });
}

watch(() => snapshot.value?.beaconIntervalArmed, (armed) => {
  intervalArmed.value = armed === true;
});

function disarmInterval(): void {
  if (!props.cardId || !intervalArmed.value) {
    return;
  }

  intervalArmed.value = false;
  host.setBeaconInterval(props.cardId, {
    armed: false,
    minutes: settings.value.intervalMinutes,
    mine: props.mine,
    settings: settingsForIntervalGate.value ?? { ...settings.value },
  });
}

watch(intervalBlocked, (blocked) => {
  if (blocked) {
    disarmInterval();
  }
});

watch(
  () => snapshot.value?.hardwareTransmit,
  (on) => {
    if (on === false) {
      disarmInterval();
    }
  },
);

function onIntervalMinutesPersist(): void {
  if (!modalOpen.value) {
    persistSettings();
  }

  if (!props.cardId || !intervalArmed.value) {
    return;
  }

  const draft = settingsForIntervalGate.value;

  if (!draft) {
    return;
  }

  host.setBeaconInterval(props.cardId, {
    armed: true,
    minutes: draft.intervalMinutes,
    mine: props.mine,
    settings: draft,
  });
}

function openModal(): void {
  modalValidated.value = false;
  latTouched.value = false;
  lonTouched.value = false;
  altTouched.value = false;
  modalBaseline = captureFormSnapshot();
  modalOpen.value = true;
}

function cancelModal(): void {
  applySnapshot(modalBaseline);
  modalValidated.value = false;
  modalOpen.value = false;
}

function saveModal(): void {
  modalValidated.value = true;

  if (formError.value || pathError.value || commentError.value || latitudeError.value || longitudeError.value || altitudeError.value) {
    return;
  }

  const draft = buildSettings();

  if (!draft) {
    return;
  }

  settings.value = draft;
  persistSettings(draft);
  modalOpen.value = false;
}
</script>

<template>
  <section class="w-full rounded-md border border-default p-2">
    <div class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
      <span class="font-medium text-highlighted">Position beacon</span>
      <span class="text-muted">·</span>
      <span>{{ positionSummary }}</span>
      <span class="text-muted">·</span>
      <span>{{ symbolLabel }}</span>
      <span class="text-muted">·</span>
      <span class="uppercase">{{ settings.path.trim() || 'direct' }}</span>
      <template v-if="commentSummary">
        <span class="text-muted">·</span>
        <span>{{ commentSummary }}</span>
      </template>
      <span class="text-muted">·</span>
      <span>{{ beaconStatus }}</span>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <UTooltip v-if="sendBlock" :text="sendBlock">
        <UButton color="neutral" variant="solid" label="Beacon now" disabled />
      </UTooltip>
      <UButton
        v-else
        color="neutral"
        variant="solid"
        label="Beacon now"
        @click="onBeaconNow"
      />
      <UButton size="sm" color="neutral" variant="outline" label="Edit beacon" @click="openModal" />
      <USwitch
        :model-value="intervalArmed"
        label="Interval"
        :description="intervalHint"
        :disabled="intervalBlocked"
        class="ms-2"
        @update:model-value="onInterval"
      />
      <UFormField v-if="intervalArmed" label="Min" class="w-16 shrink-0">
        <UInput
          :model-value="String(settings.intervalMinutes)"
          inputmode="numeric"
          @update:model-value="onIntervalMinutes"
          @change="onIntervalMinutesPersist"
        />
      </UFormField>
    </div>

    <UModal
      :open="modalOpen"
      title="Position beacon"
      description="Manual WGS84 position for KISS. The radio GPS is not read while KISS is on."
      class="max-w-lg"
      @update:open="(open) => { if (!open) cancelModal(); }"
    >
      <template #body>
        <div v-if="prefillSourceLabel" class="mb-3 text-xs text-muted">From {{ prefillSourceLabel }}</div>
        <div class="grid gap-3">
          <DmsCoordinateInput
            v-model="latitudeDms"
            name="latitude"
            axis="latitude"
            label="Latitude"
            hint=""
            :error="latitudeError"
            @change="onCoordinateInput('latitude')"
          />
          <DmsCoordinateInput
            v-model="longitudeDms"
            name="longitude"
            axis="longitude"
            label="Longitude"
            hint=""
            :error="longitudeError"
            @change="onCoordinateInput('longitude')"
          />
          <UFormField label="Altitude (feet)" :error="altitudeError" hint="Optional">
            <UInput
              v-model="altitudeText"
              inputmode="numeric"
              @change="altTouched = true"
            />
          </UFormField>
          <UFormField label="Symbol">
            <USelect :model-value="symbolKey" :items="symbolItems" @update:model-value="onSymbol" />
          </UFormField>
          <UFormField label="Digipeater path" :error="pathError" :hint="`Default ${APRS_BEACON_PATH_DEFAULT}. Empty = direct.`">
            <UInput :model-value="settings.path" class="w-full uppercase" :placeholder="APRS_BEACON_PATH_DEFAULT" @update:model-value="onPath" />
          </UFormField>
          <UFormField label="Comment" :error="commentError" hint="Optional">
            <UInput :model-value="settings.comment ?? ''" class="w-full" @update:model-value="onComment" />
          </UFormField>
          <p class="text-xs text-muted">Connect does not beacon. Beacon now keys once after a UI frame is heard.</p>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="cancelModal" />
          <UButton color="primary" variant="solid" label="Save" @click="saveModal" />
        </div>
      </template>
    </UModal>
  </section>
</template>