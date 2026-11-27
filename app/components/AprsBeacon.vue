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
  parseBeaconDecimalDegrees,
  type SavedRadioAprsBeacon,
} from '~/utils/aprs-beacon';
import { canonicalAx25Call } from '~/utils/aprs-ax25';
import { callsignError } from '~/utils/aprs-message';
import { formatAprsHeardAt } from '~/utils/aprs-display';
import { isValidLatitude, isValidLongitude } from '~/utils/maidenhead';

const props = defineProps<{
  cardId?: string;
  mine: string;
}>();

const host = useAprsHost();
const { radioById, rememberSavedRadioAprsBeacon } = useSavedRadios();

if (props.cardId) {
  host.watchCard(props.cardId);
}

const snapshot = computed(() => (props.cardId ? host.snapshots.value[props.cardId] : undefined));
const expanded = ref(false);

const settings = ref<SavedRadioAprsBeacon>(defaultSavedRadioAprsBeacon());
const latitudeText = ref('');
const longitudeText = ref('');
const altitudeText = ref('');
const symbolKey = ref('/-');
const intervalArmed = ref(false);

watch(
  () => radioById(props.cardId)?.aprsBeacon,
  (stored) => {
    if (!stored) {
      expanded.value = true;
      return;
    }

    settings.value = { ...stored };
    latitudeText.value = String(stored.latitude);
    longitudeText.value = String(stored.longitude);
    altitudeText.value = stored.altitudeFt !== undefined ? String(stored.altitudeFt) : '';
    symbolKey.value = `${stored.symbolTable}${stored.symbolCode}`;
    expanded.value = false;
  },
  { immediate: true },
);

const symbolItems = APRS_BEACON_SYMBOLS.map((entry) => ({
  label: entry.label,
  value: `${entry.table}${entry.code}`,
}));

const latitudeError = computed(() => {
  if (latitudeText.value.trim().length === 0) {
    return 'Enter latitude between -90 and 90';
  }

  const value = Number(latitudeText.value);

  if (!Number.isFinite(value) || !isValidLatitude(value)) {
    return 'Enter latitude between -90 and 90';
  }

  return undefined;
});

const longitudeError = computed(() => {
  if (longitudeText.value.trim().length === 0) {
    return 'Enter longitude between -180 and 180';
  }

  const value = Number(longitudeText.value);

  if (!Number.isFinite(value) || !isValidLongitude(value)) {
    return 'Enter longitude between -180 and 180';
  }

  return undefined;
});

const commentError = computed(() => beaconCommentError(settings.value.comment ?? ''));
const altitudeError = computed(() => beaconAltitudeError(altitudeText.value));
const pathError = computed(() => beaconPathError(settings.value.path));

const draftFromForm = computed((): SavedRadioAprsBeacon | undefined => {
  const coordinates = parseBeaconDecimalDegrees(latitudeText.value, longitudeText.value);

  if (!coordinates) {
    return undefined;
  }

  const altitudeTrim = altitudeText.value.trim();
  const altitudeFt = altitudeTrim.length > 0 ? Number(altitudeTrim) : undefined;

  return {
    ...settings.value,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    altitudeFt: altitudeFt !== undefined && Number.isFinite(altitudeFt) ? altitudeFt : undefined,
  };
});

const formError = computed(() => {
  if (!draftFromForm.value) {
    if (latitudeText.value.trim().length === 0 || longitudeText.value.trim().length === 0) {
      return 'Enter latitude and longitude in decimal degrees (WGS84).';
    }

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

const intervalBlocked = computed(() => Boolean(sendBlock.value || kissBlock.value));

const beaconStatus = computed(() => {
  const detail = snapshot.value?.lastBeaconDetail;
  const at = snapshot.value?.lastBeaconAt;

  if (!detail) {
    return 'No beacon sent on this connection yet.';
  }

  if (at !== undefined && detail === 'Sent') {
    return `Last beacon sent ${formatAprsHeardAt(at)}.`;
  }

  return detail;
});

const intervalDetail = computed(() => {
  if (snapshot.value?.beaconIntervalArmed) {
    return `Beaconing every ${settings.value.intervalMinutes} minutes on this connection. Disconnect stops it.`;
  }

  return `Minimum ${APRS_BEACON_INTERVAL_MIN} minutes. Default ${APRS_BEACON_INTERVAL_DEFAULT}. Starts only when you turn this on. The next Connect does not start it. SmartBeaconing is not used.`;
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

function persistSettings(): void {
  const draft = buildSettings();

  if (!props.cardId || !draft) {
    return;
  }

  settings.value = draft;
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

  const draft = buildSettings();

  if (Boolean(armed) && !draft) {
    return;
  }

  intervalArmed.value = Boolean(armed);

  if (draft) {
    settings.value = draft;
    persistSettings();
  }

  host.setBeaconInterval(props.cardId, {
    armed: intervalArmed.value,
    minutes: settings.value.intervalMinutes,
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
    settings: buildSettings() ?? { ...settings.value },
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
  persistSettings();

  if (!props.cardId || !intervalArmed.value) {
    return;
  }

  const draft = buildSettings();

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
</script>

<template>
  <section class="w-full rounded-md border border-default p-3">
    <div class="mb-2 flex items-start justify-between gap-2">
      <div class="min-w-0">
        <h3 class="text-sm font-medium text-highlighted">Position beacon</h3>
        <p class="text-xs text-muted">KISS stops the radio’s own beacon. Beacon now keys the transmitter once. Connect does not send it.</p>
      </div>
      <UButton
        v-if="!expanded"
        size="xs"
        color="neutral"
        variant="ghost"
        label="Edit position"
        @click="expanded = true"
      />
    </div>

    <p v-if="!expanded" class="text-sm text-muted">{{ beaconStatus }}</p>

    <div v-else class="mt-3 grid gap-3">
      <p class="text-xs text-muted">Enter latitude and longitude as decimal degrees (WGS84). The radio position is not read while KISS is on.</p>
      <div class="grid gap-3 @min-[48rem]:grid-cols-2">
        <UFormField label="Latitude" :error="latitudeError">
          <UInput v-model="latitudeText" inputmode="decimal" placeholder="30.5187" @change="persistSettings" />
        </UFormField>
        <UFormField label="Longitude" :error="longitudeError">
          <UInput v-model="longitudeText" inputmode="decimal" placeholder="-97.8794" @change="persistSettings" />
        </UFormField>
      </div>
      <div class="grid gap-3 @min-[48rem]:grid-cols-2">
        <UFormField label="Symbol">
          <USelect :model-value="symbolKey" :items="symbolItems" @update:model-value="onSymbol" @change="persistSettings" />
        </UFormField>
        <UFormField label="Digipeater path" :error="pathError" :hint="`Default ${APRS_BEACON_PATH_DEFAULT}. Leave empty for direct.`">
          <UInput :model-value="settings.path" class="uppercase" :placeholder="APRS_BEACON_PATH_DEFAULT" @update:model-value="onPath" @change="persistSettings" />
        </UFormField>
      </div>
      <div class="grid gap-3 @min-[48rem]:grid-cols-2">
        <UFormField label="Comment" :error="commentError" hint="Optional">
          <UInput :model-value="settings.comment ?? ''" @update:model-value="onComment" @change="persistSettings" />
        </UFormField>
        <UFormField label="Altitude (feet)" :error="altitudeError" hint="Optional">
          <UInput v-model="altitudeText" inputmode="numeric" placeholder="1180" @change="persistSettings" />
        </UFormField>
      </div>
      <p class="text-sm text-muted">{{ beaconStatus }}</p>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          color="neutral"
          variant="solid"
          label="Beacon now"
          :disabled="Boolean(sendBlock)"
          @click="onBeaconNow"
        />
        <span v-if="sendBlock" class="text-xs text-muted">{{ sendBlock }}</span>
      </div>
      <USwitch
        :model-value="intervalArmed"
        label="Beacon on an interval"
        :description="intervalDetail"
        :disabled="intervalBlocked"
        @update:model-value="onInterval"
      />
      <UFormField label="Minutes between beacons" class="w-40">
        <UInput
          :model-value="String(settings.intervalMinutes)"
          inputmode="numeric"
          :disabled="!intervalArmed"
          @update:model-value="onIntervalMinutes"
          @change="onIntervalMinutesPersist"
        />
      </UFormField>
    </div>
  </section>
</template>