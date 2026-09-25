<script setup lang="ts">
import { SerialPort } from 'tauri-plugin-serialplugin-api';
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
  type SavedRadio,
  type SavedRadioDraft,
} from '~/utils/saved-radios';

const props = defineProps<{
  open: boolean;
  radio?: SavedRadio;
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
const ports = ref<Array<{ label: string; value: string }>>([]);
const loadingPorts = shallowRef(false);
const nameError = shallowRef<string | undefined>();
const manufacturerError = shallowRef<string | undefined>();
const modelError = shallowRef<string | undefined>();
const baudError = shallowRef<string | undefined>();
const portError = shallowRef<string | undefined>();

const isCreate = computed(() => props.radio === undefined);
const title = computed(() => (isCreate.value ? 'Add radio' : 'Edit radio'));
const description = computed(() =>
  isCreate.value
    ? 'Name this radio, then choose its driver, speed, and the serial port you usually use.'
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

const portItems = computed(() => {
  const items = ports.value.slice();
  const current = serialPort.value;

  if (current && !items.some((port) => port.value === current)) {
    items.unshift(serialPortOption(current, readSerialPortSettings().portAliases, { suffix: ' (saved)' }));
  }

  return items;
});

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
    name.value = draft?.name ?? '';
    manufacturer.value = draft?.manufacturer;
    model.value = draft?.model;
    baudRate.value = draft?.baudRate;
    serialPort.value = draft?.serialPort;
    nameError.value = undefined;
    manufacturerError.value = undefined;
    modelError.value = undefined;
    baudError.value = undefined;
    portError.value = undefined;
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

function close(): void {
  emit('update:open', false);
}

function save(): void {
  const draft: SavedRadioDraft = {
    name: name.value,
    manufacturer: manufacturer.value ?? '',
    model: model.value ?? '',
    baudRate: showBaudRate.value ? baudRate.value : undefined,
    serialPort: serialPort.value ?? '',
  };
  const listed = selectedConfig.value ? listedProgrammingBaudRates(selectedConfig.value.serialConfig) : [];
  const issues = savedRadioDraftIssues(draft, {
    radios: radios.value,
    ignoreId: props.radio?.id,
    baudRates: listed,
  });

  nameError.value = issues.name;
  manufacturerError.value = issues.manufacturer;
  modelError.value = issues.model;
  baudError.value = issues.baudRate;
  portError.value = issues.serialPort;

  if (savedRadioDraftHasIssues(issues)) {
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
          label="Default serial port"
          description="Used when you connect. You can pick a different port at that time."
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
