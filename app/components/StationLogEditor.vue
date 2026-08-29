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
        <UAlert
          v-if="privilegeWarning"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="privilegeWarning.title"
          :description="privilegeWarning.detail"
        />

        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Start date (UTC)" :error="startDateError" required>
            <UInput v-model="startDate" type="date" class="w-full tabular-nums" />
          </UFormField>

          <UFormField label="Start time (UTC)" :error="startTimeError" required>
            <UInput v-model="startTime" type="time" step="1" class="w-full tabular-nums" />
          </UFormField>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="End date (UTC)">
            <UInput v-model="endDate" type="date" class="w-full tabular-nums" />
          </UFormField>

          <UFormField label="End time (UTC)">
            <UInput v-model="endTime" type="time" step="1" class="w-full tabular-nums" />
          </UFormField>
        </div>

        <UFormField label="Their callsign" :error="callsignError" required>
          <UInput
            v-model="theirCallsign"
            class="w-full uppercase"
            placeholder="W1AW"
            @blur="onCallsignBlur"
          />
        </UFormField>

        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Frequency (MHz)" :error="frequencyError">
            <UInput v-model="frequencyMHz" inputmode="decimal" class="w-full tabular-nums" placeholder="146.5200" />
          </UFormField>

          <UFormField label="Mode" :error="modeError" required>
            <UInputMenu
              v-model="mode"
              :items="modeItems"
              create-item
              placeholder="FM"
              class="w-full"
              @create="onModeCreate"
            />
          </UFormField>
        </div>

        <UFormField label="Submode" description="Optional, e.g. USB or LSB for SSB.">
          <UInput v-model="submode" class="w-full uppercase" placeholder="USB" />
        </UFormField>

        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="RST sent">
            <UInput v-model="rstSent" class="w-full" placeholder="59" />
          </UFormField>

          <UFormField label="RST received">
            <UInput v-model="rstReceived" class="w-full" placeholder="59" />
          </UFormField>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Their name">
            <div class="flex gap-1.5">
              <UInput v-model="theirName" class="w-full" :loading="isLookingUp" />
            </div>
          </UFormField>

          <UFormField label="Their grid">
            <UInput v-model="theirGridsquare" class="w-full uppercase" placeholder="FN31" />
          </UFormField>
        </div>

        <UFormField label="Their QTH">
          <UInput v-model="theirQth" class="w-full" />
        </UFormField>

        <UFormField label="TX power (W)" :error="txPowerError">
          <UInput v-model="txPowerWatts" inputmode="decimal" class="w-full tabular-nums" />
        </UFormField>

        <UFormField label="Comment">
          <UTextarea v-model="comment" :rows="3" class="w-full" autoresize />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <UButton color="neutral" variant="outline" label="Cancel" @click="close" />
        <UButton
          color="primary"
          :label="isCreate ? 'Log contact' : 'Save'"
          :loading="isSaving"
          @click="save"
        />
      </div>
    </template>
  </USlideover>
</template>

<script setup lang="ts">
import { formatFrequencyMHz, parseFrequencyMHz } from '~/utils/channel-edit';
import { fetchCallookLicense } from '~/utils/callook';
import {
  adifBandFromFrequencyHz,
  createBlankStationLogQso,
  type StationLogQso,
  type StationLogQsoInput,
} from '~/utils/station-log-db';

const COMMON_MODES = [
  'FM',
  'SSB',
  'CW',
  'AM',
  'FT8',
  'FT4',
  'DIGITALVOICE',
  'PACKET',
  'RTTY',
  'PSK31',
  'MFSK',
  'JS8',
];

const props = defineProps<{
  open: boolean;
  qso?: StationLogQso;
}>();

const emit = defineEmits<{
  'update:open': [open: boolean];
  save: [payload: StationLogQsoInput & { id?: string }];
}>();

const { license, getTransmitPrivilegeWarning } = useOperatorLicense();

const startDate = ref('');
const startTime = ref('');
const endDate = ref('');
const endTime = ref('');
const theirCallsign = ref('');
const frequencyMHz = ref('');
const mode = ref('FM');
const submode = ref('');
const rstSent = ref('');
const rstReceived = ref('');
const theirName = ref('');
const theirQth = ref('');
const theirGridsquare = ref('');
const txPowerWatts = ref('');
const comment = ref('');
const operatorCallsign = ref<string | undefined>();
const stationCallsign = ref<string | undefined>();
const myGridsquare = ref<string | undefined>();
const adifExtra = ref<Record<string, string> | undefined>();

const startDateError = ref<string | undefined>();
const startTimeError = ref<string | undefined>();
const callsignError = ref<string | undefined>();
const frequencyError = ref<string | undefined>();
const modeError = ref<string | undefined>();
const txPowerError = ref<string | undefined>();
const isSaving = ref(false);
const isLookingUp = ref(false);

const modeItems = COMMON_MODES;

const isCreate = computed(() => props.qso === undefined);
const title = computed(() => (isCreate.value ? 'New contact' : 'Edit contact'));
const description = computed(() =>
  isCreate.value ? 'Add a QSO to the station log.' : props.qso?.theirCallsign || 'Station log contact',
);

const privilegeWarning = computed(() => {
  const hz = parseFrequencyMHz(frequencyMHz.value);
  return getTransmitPrivilegeWarning(hz);
});

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatUtcDate(ms: number): string {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function formatUtcTime(ms: number): string {
  const date = new Date(ms);
  return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`;
}

function parseUtcDateTime(dateText: string, timeText: string): number | undefined {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText.trim());

  if (!dateMatch) {
    return undefined;
  }

  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeText.trim() || '00:00:00');

  if (!timeMatch) {
    return undefined;
  }

  const ms = Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    timeMatch[3] ? Number(timeMatch[3]) : 0,
  );

  if (Number.isNaN(ms)) {
    return undefined;
  }

  return ms;
}

function resetErrors(): void {
  startDateError.value = undefined;
  startTimeError.value = undefined;
  callsignError.value = undefined;
  frequencyError.value = undefined;
  modeError.value = undefined;
  txPowerError.value = undefined;
}

watch(
  () => [props.open, props.qso?.id] as const,
  () => {
    if (!props.open) {
      return;
    }

    const blank = createBlankStationLogQso({
      operatorCallsign: license.value?.callSign,
      stationCallsign: license.value?.callSign,
      myGridsquare: license.value?.gridsquare,
    });
    const source = props.qso ?? blank;
    const startedAt = source.startedAt ?? Date.now();

    startDate.value = formatUtcDate(startedAt);
    startTime.value = formatUtcTime(startedAt);
    endDate.value = source.endedAt !== undefined ? formatUtcDate(source.endedAt) : '';
    endTime.value = source.endedAt !== undefined ? formatUtcTime(source.endedAt) : '';
    theirCallsign.value = source.theirCallsign ?? '';
    frequencyMHz.value =
      source.frequencyHz !== undefined ? formatFrequencyMHz(source.frequencyHz) : '';
    mode.value = source.mode || 'FM';
    submode.value = source.submode ?? '';
    rstSent.value = source.rstSent ?? '';
    rstReceived.value = source.rstReceived ?? '';
    theirName.value = source.theirName ?? '';
    theirQth.value = source.theirQth ?? '';
    theirGridsquare.value = source.theirGridsquare ?? '';
    txPowerWatts.value = source.txPowerWatts !== undefined ? String(source.txPowerWatts) : '';
    comment.value = source.comment ?? '';
    operatorCallsign.value = source.operatorCallsign ?? license.value?.callSign;
    stationCallsign.value = source.stationCallsign ?? license.value?.callSign;
    myGridsquare.value = source.myGridsquare ?? license.value?.gridsquare;
    adifExtra.value = source.adifExtra;
    resetErrors();
    isSaving.value = false;
    isLookingUp.value = false;
  },
);

function close(): void {
  emit('update:open', false);
}

function onModeCreate(item: string): void {
  mode.value = item.trim().toUpperCase();
}

async function onCallsignBlur(): Promise<void> {
  const call = theirCallsign.value.trim().toUpperCase();
  theirCallsign.value = call;

  if (!call || theirName.value.trim() || theirGridsquare.value.trim()) {
    return;
  }

  isLookingUp.value = true;

  try {
    const response = await fetchCallookLicense(call);

    if (response.status !== 'VALID') {
      return;
    }

    if (!theirName.value.trim() && response.name) {
      theirName.value = response.name;
    }

    if (!theirGridsquare.value.trim() && response.location?.gridsquare) {
      theirGridsquare.value = response.location.gridsquare.toUpperCase();
    }
  } catch {
    // Lookup is best-effort; leave fields as entered.
  } finally {
    isLookingUp.value = false;
  }
}

function save(): void {
  resetErrors();

  const startedAt = parseUtcDateTime(startDate.value, startTime.value);

  if (!startDate.value.trim()) {
    startDateError.value = 'Enter a start date';
  } else if (!startTime.value.trim()) {
    startTimeError.value = 'Enter a start time';
  } else if (startedAt === undefined) {
    startDateError.value = 'Enter a valid UTC date and time';
  }

  const call = theirCallsign.value.trim().toUpperCase();

  if (!call) {
    callsignError.value = 'Enter a callsign';
  }

  const modeValue = (typeof mode.value === 'string' ? mode.value : String(mode.value ?? '')).trim();

  if (!modeValue) {
    modeError.value = 'Enter a mode';
  }

  let frequencyHz: number | undefined;

  if (frequencyMHz.value.trim()) {
    frequencyHz = parseFrequencyMHz(frequencyMHz.value);

    if (frequencyHz === undefined) {
      frequencyError.value = 'Enter a frequency in MHz';
    }
  }

  let endedAt: number | undefined;

  if (endDate.value.trim() || endTime.value.trim()) {
    endedAt = parseUtcDateTime(endDate.value || startDate.value, endTime.value || '00:00:00');

    if (endedAt === undefined) {
      startDateError.value = startDateError.value ?? 'Enter a valid UTC end date and time';
    }
  }

  let power: number | undefined;

  if (txPowerWatts.value.trim()) {
    power = Number(txPowerWatts.value.trim());

    if (!Number.isFinite(power) || power < 0) {
      txPowerError.value = 'Enter a valid TX power';
    }
  }

  if (
    startDateError.value ||
    startTimeError.value ||
    callsignError.value ||
    modeError.value ||
    frequencyError.value ||
    txPowerError.value ||
    startedAt === undefined
  ) {
    return;
  }

  isSaving.value = true;

  try {
    emit('save', {
      id: props.qso?.id,
      startedAt,
      endedAt,
      theirCallsign: call,
      frequencyHz,
      band: adifBandFromFrequencyHz(frequencyHz) ?? props.qso?.band,
      mode: modeValue,
      submode: submode.value.trim() || undefined,
      rstSent: rstSent.value.trim() || undefined,
      rstReceived: rstReceived.value.trim() || undefined,
      theirName: theirName.value.trim() || undefined,
      theirQth: theirQth.value.trim() || undefined,
      theirGridsquare: theirGridsquare.value.trim() || undefined,
      txPowerWatts: power,
      comment: comment.value.trim() || undefined,
      operatorCallsign: operatorCallsign.value,
      stationCallsign: stationCallsign.value,
      myGridsquare: myGridsquare.value,
      adifExtra: adifExtra.value,
      createdAt: props.qso?.createdAt,
    });
  } finally {
    isSaving.value = false;
  }
}
</script>
