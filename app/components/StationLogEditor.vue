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

        <UFormField label="Callsign" :error="callsignError" required>
          <UInput
            v-model="theirCallsign"
            class="w-full uppercase"
            placeholder="W1AW"
            @blur="onCallsignBlur"
          />
        </UFormField>

        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Frequency (MHz)" :error="frequencyError" required>
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
          <UFormField label="Name">
            <div class="flex gap-1.5">
              <UInput v-model="theirName" class="w-full" :loading="isLookingUp" />
            </div>
          </UFormField>

          <UFormField label="Grid">
            <UInput v-model="theirGridsquare" class="w-full uppercase" placeholder="FN31" :loading="isLookingUp" />
          </UFormField>
        </div>

        <UFormField label="QTH">
          <UInput v-model="theirQth" class="w-full" :loading="isLookingUp" />
        </UFormField>

        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Radio" description="Saved radios configured for this band.">
            <USelectMenu
              v-model="radioMenu"
              :items="radioItems"
              value-key="value"
              :search-input="false"
              :content="{ side: 'top' }"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Antenna" description="Station antennas configured for this band.">
            <USelectMenu
              v-model="antennaMenu"
              :items="antennaItems"
              value-key="value"
              :search-input="false"
              :content="{ side: 'top' }"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField label="TX power (W)" :error="txPowerError">
          <UInput v-model="txPowerWatts" inputmode="decimal" class="w-full tabular-nums" />
        </UFormField>

        <UFormField label="QSL cards" description="Marker color on the log map.">
          <div class="flex flex-wrap gap-4 pt-1">
            <UCheckbox v-model="qslSent" label="Card sent" />
            <UCheckbox v-model="qslReceived" label="Card received" />
          </div>
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
import { formatAntennaBands, formatStationAntennaLogLabel } from '~/utils/antenna-station';
import { formatFrequencyMHz, frequencyMHzFieldError, parseFrequencyMHz } from '~/utils/channel-edit';
import { fetchCallookLicense, qthFromCallook, resolveCallookGrid } from '~/utils/callook';
import {
  equipmentCoversAdifBand,
  equipmentListedForBand,
  equipmentMenuValue,
  formatEquipmentBands,
  NO_EQUIPMENT_VALUE,
  radioBandsFromConfig,
  storedEquipmentValue,
} from '~/utils/radio-bands';
import { txPowerTextForSavedRadio } from '~/utils/saved-radios';
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
  defaults?: Partial<StationLogQsoInput>;
}>();

const emit = defineEmits<{
  'update:open': [open: boolean];
  save: [payload: StationLogQsoInput & { id?: string }];
}>();

const { solePrivilege, amateurIdentity, getTransmitPrivilegeWarning } = useOperatorLicense();
const { radios } = useSavedRadios();
const { configurations } = useRadio();
const { antennas, stations } = useStationAntennas();

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
const qslSent = ref(false);
const qslReceived = ref(false);
const txPowerWatts = ref('');
const myRig = ref('');
const myAntenna = ref('');
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
  return getTransmitPrivilegeWarning(hz, solePrivilege.value);
});

const contactBand = computed(() => adifBandFromFrequencyHz(parseFrequencyMHz(frequencyMHz.value)));

interface EquipmentChoice {
  label: string;
  value: string;
  description?: string;
  bands: string[];
}

function withStoredChoice(
  listed: EquipmentChoice[],
  configured: EquipmentChoice[],
  current: string,
  missingDescription: string,
): EquipmentChoice[] {
  const trimmed = current.trim();

  if (!trimmed || configured.some((item) => item.value === trimmed) || listed.some((item) => item.value === trimmed)) {
    return listed;
  }

  return [{ label: trimmed, value: trimmed, description: missingDescription, bands: [] }, ...listed];
}

function byCoverage(left: EquipmentChoice, right: EquipmentChoice): number {
  const rank = (bands: string[]): number => {
    const covers = equipmentCoversAdifBand(bands, contactBand.value);

    if (covers === true) {
      return 0;
    }

    if (covers === undefined) {
      return 1;
    }

    return 2;
  };

  return rank(left.bands) - rank(right.bands) || left.label.localeCompare(right.label);
}

const configuredRadios = computed(() =>
  radios.value.map((radio) => {
    const config = configurations.value.find((entry) => String(entry.id.model) === radio.model);
    const bands = radioBandsFromConfig(config);

    return {
      label: radio.name,
      value: radio.name,
      description: bands.length > 0 ? formatEquipmentBands(bands) : 'Bands not declared by the installed driver',
      bands,
    };
  }),
);

const configuredAntennas = computed(() =>
  antennas.value.map((antenna) => {
    const station = stations.value.find((entry) => entry.id === antenna.stationId);
    const label = formatStationAntennaLogLabel(antenna, station?.nickname);

    return {
      label,
      value: label,
      description: formatAntennaBands(antenna.bands, antenna.trapped === true),
      bands: [...antenna.bands],
    };
  }),
);

const radioItems = computed(() => {
  const listed = equipmentListedForBand(configuredRadios.value, contactBand.value);
  listed.sort(byCoverage);

  return [
    { label: 'None', value: NO_EQUIPMENT_VALUE, bands: [] },
    ...withStoredChoice(listed, configuredRadios.value, myRig.value, 'Not in your radios'),
  ];
});

const antennaItems = computed(() => {
  const listed = equipmentListedForBand(configuredAntennas.value, contactBand.value);
  listed.sort(byCoverage);

  return [
    { label: 'None', value: NO_EQUIPMENT_VALUE, bands: [] },
    ...withStoredChoice(listed, configuredAntennas.value, myAntenna.value, 'Not at a station'),
  ];
});

function applyRadioTxPower(name: string): void {
  txPowerWatts.value = txPowerTextForSavedRadio(name, radios.value);
}

const radioMenu = computed({
  get: () => equipmentMenuValue(myRig.value),
  set: (value: string) => {
    const name = storedEquipmentValue(value);
    myRig.value = name;
    applyRadioTxPower(name);
  },
});

const antennaMenu = computed({
  get: () => equipmentMenuValue(myAntenna.value),
  set: (value: string) => {
    myAntenna.value = storedEquipmentValue(value);
  },
});

watch(contactBand, () => {
  const band = contactBand.value;

  if (!band) {
    return;
  }

  const radio = configuredRadios.value.find((item) => item.value === myRig.value);
  const antenna = configuredAntennas.value.find((item) => item.value === myAntenna.value);

  if (radio && equipmentCoversAdifBand(radio.bands, band) === false) {
    myRig.value = '';
    applyRadioTxPower('');
  }

  if (antenna && equipmentCoversAdifBand(antenna.bands, band) === false) {
    myAntenna.value = '';
  }
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
  () => [props.open, props.qso?.id, props.defaults?.frequencyHz, props.defaults?.mode] as const,
  () => {
    if (!props.open) {
      return;
    }

    const identity = amateurIdentity.value;
    const blank = createBlankStationLogQso({
      operatorCallsign: identity.callSign,
      stationCallsign: identity.callSign,
      myGridsquare: identity.gridsquare,
    });
    const source = props.qso ?? { ...blank, ...props.defaults };
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
    qslSent.value = source.qslSent === true;
    qslReceived.value = source.qslReceived === true;
    myRig.value = source.myRig ?? '';
    txPowerWatts.value =
      source.txPowerWatts !== undefined
        ? String(source.txPowerWatts)
        : props.qso
          ? ''
          : txPowerTextForSavedRadio(myRig.value, radios.value);
    myAntenna.value = source.myAntenna ?? '';
    comment.value = source.comment ?? '';
    operatorCallsign.value = source.operatorCallsign ?? identity.callSign;
    stationCallsign.value = source.stationCallsign ?? identity.callSign;
    myGridsquare.value = source.myGridsquare ?? identity.gridsquare;
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

    if (!theirQth.value.trim()) {
      const qth = qthFromCallook(response);

      if (qth) {
        theirQth.value = qth;
      }
    }

    if (!theirGridsquare.value.trim()) {
      const grid = await resolveCallookGrid(response);

      if (grid) {
        theirGridsquare.value = grid;
      }
    }
  } catch {
    // Lookup is best-effort; leave fields as entered.
  } finally {
    isLookingUp.value = false;
  }
}

function adifExtraForSave(): Record<string, string> | undefined {
  const extra = { ...(adifExtra.value ?? {}) };

  if (qslSent.value) {
    delete extra.QSL_SENT;
  }

  if (qslReceived.value) {
    delete extra.QSL_RCVD;
  }

  if (Object.keys(extra).length === 0) {
    return undefined;
  }

  return extra;
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

  const frequencyHz = parseFrequencyMHz(frequencyMHz.value);
  frequencyError.value = frequencyMHzFieldError(frequencyMHz.value);

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
      qslSent: qslSent.value,
      qslReceived: qslReceived.value,
      txPowerWatts: power,
      myRig: myRig.value.trim() || undefined,
      myAntenna: myAntenna.value.trim() || undefined,
      comment: comment.value.trim() || undefined,
      operatorCallsign: operatorCallsign.value,
      stationCallsign: stationCallsign.value,
      myGridsquare: myGridsquare.value,
      adifExtra: adifExtraForSave(),
      createdAt: props.qso?.createdAt,
    });
  } finally {
    isSaving.value = false;
  }
}
</script>
