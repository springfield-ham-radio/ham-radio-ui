<script setup lang="ts">
import { SerialPort } from 'tauri-plugin-serialplugin-api';
import { aprsReceiveProfile } from '~/utils/aprs-capability';
import {
  defaultProgrammingBaudRate,
  listedProgrammingBaudRates,
  programmingBaudRateSelectItems,
  shouldSelectProgrammingBaudRate,
} from '~/utils/radio-baud-rate';
import { serialPortOption, serialPortSelectItems } from '~/utils/serial-port-list';
import { readSerialPortSettings } from '~/utils/serial-port-settings';
import {
  draftFromSavedRadio,
  savedRadioDraftHasIssues,
  savedRadioDraftIssues,
  txPowerWattsFieldError,
  txPowerWattsFromText,
  type SavedRadio,
  type SavedRadioDraft,
} from '~/utils/saved-radios';

const props = defineProps<{
  open: boolean;
  radio?: SavedRadio;
  /** Create-only starting point, used when onboarding names a checked model. */
  initialManufacturer?: string;
  initialModel?: string;
  initialName?: string;
}>();

const emit = defineEmits<{
  'update:open': [open: boolean];
  save: [draft: SavedRadioDraft];
}>();

const { configurations, manufacturers } = useRadio();
const { radios } = useSavedRadios();

const name = shallowRef('');
const manufacturer = shallowRef<string | undefined>();
const model = shallowRef<string | undefined>();
const baudRate = shallowRef<number | undefined>();
const serialPort = shallowRef<string | undefined>();
const aprsBaudRate = shallowRef<number | undefined>();
const aprsSerialPort = shallowRef<string | undefined>();
const txPower = shallowRef('');
const ports = ref<Array<{ label: string; value: string }>>([]);
const loadingPorts = shallowRef(false);
const nameError = shallowRef<string | undefined>();
const manufacturerError = shallowRef<string | undefined>();
const modelError = shallowRef<string | undefined>();
const baudError = shallowRef<string | undefined>();
const portError = shallowRef<string | undefined>();
const aprsBaudError = shallowRef<string | undefined>();
const aprsPortError = shallowRef<string | undefined>();
const txPowerError = shallowRef<string | undefined>();

const isCreate = computed(() => props.radio === undefined);
const title = computed(() => (isCreate.value ? 'Add radio' : 'Edit radio'));
const description = computed(() =>
  isCreate.value
    ? 'Name this radio, then choose its driver, speed, serial port, and usual transmit power.'
    : props.radio?.name || 'Radio',
);

const modelItems = computed(() => {
  if (!manufacturer.value) {
    return [];
  }

  return configurations.value
    .filter((config) => config.id.manufacturer === manufacturer.value)
    .map((config) => ({
      label: config.id.name,
      value: String(config.id.model),
    }));
});

const selectedConfig = computed(() => {
  if (!model.value) {
    return undefined;
  }

  return configurations.value.find((config) => String(config.id.model) === model.value);
});

const aprsProfile = computed(() =>
  aprsReceiveProfile({
    config: selectedConfig.value,
    model: model.value,
    name: selectedConfig.value?.id.name ?? props.radio?.name,
  }),
);

const aprsBaudItems = computed(() => (aprsProfile.value?.baudRates ?? []).map((rate) => ({ label: `${rate} baud`, value: rate })));

const showBaudRate = computed(() => {
  if (!selectedConfig.value) {
    return false;
  }

  return shouldSelectProgrammingBaudRate(selectedConfig.value.serialConfig);
});

const baudItems = computed(() => {
  if (!selectedConfig.value) {
    return [];
  }

  return programmingBaudRateSelectItems(selectedConfig.value.serialConfig);
});

function portItemsFor(current: string | undefined, missingSuffix: string): Array<{ label: string; value: string }> {
  const items = ports.value.slice();

  if (current && !items.some((port) => port.value === current)) {
    items.unshift(serialPortOption(current, readSerialPortSettings().portAliases, { suffix: missingSuffix }));
  }

  return items;
}

const portItems = computed(() => portItemsFor(serialPort.value, ' (saved)'));

const aprsPortItems = computed(() => [
  { label: 'No APRS port', value: '' },
  ...portItemsFor(aprsSerialPort.value, ' (saved, not connected)'),
]);

function onManufacturer(value: string | undefined): void {
  if (value !== manufacturer.value) {
    model.value = undefined;
  }

  manufacturer.value = value;
}

watch(selectedConfig, (config) => {
  if (!config) {
    baudRate.value = undefined;
    return;
  }

  const listed = listedProgrammingBaudRates(config.serialConfig);

  if (!shouldSelectProgrammingBaudRate(config.serialConfig)) {
    baudRate.value = undefined;
    return;
  }

  if (baudRate.value === undefined || !listed.includes(baudRate.value)) {
    baudRate.value = defaultProgrammingBaudRate(config.serialConfig);
  }
});

watch(
  () => props.open,
  (open) => {
    if (!open) {
      return;
    }

    const draft = props.radio ? draftFromSavedRadio(props.radio) : undefined;
    name.value = draft?.name ?? (props.radio ? '' : props.initialName ?? '');
    manufacturer.value = draft?.manufacturer ?? (props.radio ? undefined : props.initialManufacturer);
    model.value = draft?.model ?? (props.radio ? undefined : props.initialModel);
    baudRate.value = draft?.baudRate;
    serialPort.value = draft?.serialPort;
    aprsBaudRate.value = draft?.aprsBaudRate;
    aprsSerialPort.value = draft?.aprsSerialPort ?? '';
    txPower.value = draft?.txPowerWatts !== undefined ? String(draft.txPowerWatts) : '';
    nameError.value = undefined;
    manufacturerError.value = undefined;
    modelError.value = undefined;
    baudError.value = undefined;
    portError.value = undefined;
    aprsBaudError.value = undefined;
    aprsPortError.value = undefined;
    txPowerError.value = undefined;
    void loadPorts();
  },
);

async function loadPorts(): Promise<void> {
  loadingPorts.value = true;

  try {
    const available = await SerialPort.available_ports();
    ports.value = serialPortSelectItems(Object.keys(available), readSerialPortSettings());
  } catch (cause) {
    console.error('Failed to list serial ports', cause);
    ports.value = [];
  } finally {
    loadingPorts.value = false;
  }
}

watch(aprsProfile, (profile) => {
  if (!profile) {
    return;
  }

  const rate = aprsBaudRate.value;

  if (rate === undefined || !profile.baudRates.some((entry) => entry === rate)) {
    aprsBaudRate.value = profile.baudRate;
  }
});

function close(): void {
  emit('update:open', false);
}

function save(): void {
  const txPowerWatts = txPowerWattsFromText(txPower.value);
  const profile = aprsProfile.value;
  const draft: SavedRadioDraft = {
    name: name.value,
    manufacturer: manufacturer.value ?? '',
    model: model.value ?? '',
    baudRate: showBaudRate.value ? baudRate.value : undefined,
    serialPort: serialPort.value ?? '',
    txPowerWatts,
    aprsSerialPort: profile ? (aprsSerialPort.value ?? '') : props.radio?.aprsSerialPort,
    aprsBaudRate: profile ? aprsBaudRate.value : props.radio?.aprsBaudRate,
  };
  const listed = selectedConfig.value ? listedProgrammingBaudRates(selectedConfig.value.serialConfig) : [];
  const issues = savedRadioDraftIssues(draft, {
    radios: radios.value,
    ignoreId: props.radio?.id,
    baudRates: listed,
    aprsBaudRates: profile?.baudRates,
  });

  nameError.value = issues.name;
  manufacturerError.value = issues.manufacturer;
  modelError.value = issues.model;
  baudError.value = issues.baudRate;
  portError.value = issues.serialPort;
  aprsBaudError.value = issues.aprsBaudRate;
  aprsPortError.value = issues.aprsSerialPort;
  txPowerError.value = txPowerWattsFieldError(txPower.value);

  if (savedRadioDraftHasIssues(issues) || txPowerError.value) {
    return;
  }

  emit('save', draft);
}
</script>

<template>
  <UModal
    :open="open"
    :title="title"
    :description="description"
    class="max-w-lg"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <UFormField label="Name" :error="nameError" required>
          <UInput v-model="name" class="w-full" placeholder="Mobile" />
        </UFormField>

        <UFormField label="Manufacturer" :error="manufacturerError" required>
          <USelectMenu
            :model-value="manufacturer"
            :items="manufacturers"
            placeholder="Select manufacturer"
            class="w-full"
            @update:model-value="onManufacturer"
          />
        </UFormField>

        <UFormField label="Model" :error="modelError" required>
          <USelectMenu
            v-model="model"
            :items="modelItems"
            value-key="value"
            :disabled="!manufacturer"
            placeholder="Select model"
            class="w-full"
          />
        </UFormField>

        <UFormField
          v-if="showBaudRate"
          label="Baud rate"
          description="Match the radio's PC port speed"
          :error="baudError"
          required
        >
          <USelect
            v-model="baudRate"
            :items="baudItems"
            value-key="value"
            placeholder="Select baud rate"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Memory serial port"
          :description="aprsProfile ? 'Read, write, and CAT. Not the APRS COM port.' : 'Used when you connect. You can pick a different port at that time.'"
          :error="portError"
          required
        >
          <div class="flex gap-2">
            <USelectMenu
              v-model="serialPort"
              :items="portItems"
              value-key="value"
              placeholder="Select a serial port"
              class="w-full"
              :loading="loadingPorts"
            />
            <UTooltip text="Refresh serial ports">
              <UButton
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="outline"
                :disabled="loadingPorts"
                aria-label="Refresh serial ports"
                @click="loadPorts"
              />
            </UTooltip>
          </div>
        </UFormField>

        <template v-if="aprsProfile">
          <UFormField label="APRS baud" :description="aprsProfile.help" :error="aprsBaudError" required>
            <USelect
              v-model="aprsBaudRate"
              :items="aprsBaudItems"
              value-key="value"
              placeholder="Select APRS baud"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="APRS serial port"
            description="USB adapter on the control-head COM cable. A saved port that is unplugged stays in the list."
            :error="aprsPortError"
          >
            <div class="flex gap-2">
              <USelectMenu
                v-model="aprsSerialPort"
                :items="aprsPortItems"
                value-key="value"
                placeholder="Select the APRS port"
                class="w-full"
                :loading="loadingPorts"
              />
              <UTooltip text="Refresh serial ports">
                <UButton
                  icon="i-lucide-refresh-cw"
                  color="neutral"
                  variant="outline"
                  :disabled="loadingPorts"
                  aria-label="Refresh APRS serial ports"
                  @click="loadPorts"
                />
              </UTooltip>
            </div>
          </UFormField>
        </template>

        <UFormField
          label="TX power (W)"
          description="Fills the station log when this radio is selected."
          :error="txPowerError"
        >
          <UInput v-model="txPower" inputmode="decimal" class="w-full tabular-nums" placeholder="5" />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" label="Cancel" @click="close" />
        <UButton color="primary" :label="isCreate ? 'Add' : 'Save'" @click="save" />
      </div>
    </template>
  </UModal>
</template>
