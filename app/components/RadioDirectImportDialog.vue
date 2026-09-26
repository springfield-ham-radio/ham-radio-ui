<script setup lang="ts">
import type { RadioId } from '@springfield/ham-radio-api';
import { SerialPort } from 'tauri-plugin-serialplugin-api';
import {
  defaultProgrammingBaudRate,
  listedProgrammingBaudRates,
  programmingBaudRateSelectItems,
  shouldSelectProgrammingBaudRate,
} from '~/utils/radio-baud-rate';
import { holdSerialPortInactive, releaseSerialPortHold } from '~/utils/serial-idle-hold';
import { serialPortSelectItems } from '~/utils/serial-port-list';
import { readSerialPortSettings } from '~/utils/serial-port-settings';

export interface DirectImportRequest {
  radioId: RadioId;
  baudRate?: number;
  serialPort: string;
}

const open = defineModel<boolean>('open', { required: true });

const emit = defineEmits<{
  confirm: [request: DirectImportRequest];
}>();

const { configurations, manufacturers } = useRadio();

const manufacturer = shallowRef<string | undefined>();
const model = shallowRef<string | undefined>();
const baudRate = shallowRef<number | undefined>();
const serialPort = shallowRef<string | undefined>();
const ports = ref<Array<{ label: string; value: string }>>([]);
const loadingPorts = shallowRef(false);
const manufacturerError = shallowRef<string | undefined>();
const modelError = shallowRef<string | undefined>();
const baudError = shallowRef<string | undefined>();
const portError = shallowRef<string | undefined>();

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

function onManufacturer(value: string | undefined): void {
  if (value !== manufacturer.value) {
    model.value = undefined;
  }

  manufacturer.value = value;
}

watch(modelItems, (items) => {
  if (items.length === 1) {
    model.value = items[0]?.value;
  }
});

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

watch(serialPort, (path) => {
  if (!open.value || !path) {
    return;
  }

  void holdSerialPortInactive(path).catch((cause) => {
    console.error('Failed to hold serial port inactive', cause);
  });
});

function reset(): void {
  manufacturer.value = manufacturers.value.length === 1 ? manufacturers.value[0] : undefined;
  model.value = undefined;
  baudRate.value = undefined;
  serialPort.value = undefined;
  manufacturerError.value = undefined;
  modelError.value = undefined;
  baudError.value = undefined;
  portError.value = undefined;
}

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

watch(open, (isOpen) => {
  if (!isOpen) {
    void releaseSerialPortHold();
    return;
  }

  reset();
  void loadPorts();
});

function close(): void {
  open.value = false;
}

async function confirm(): Promise<void> {
  const config = selectedConfig.value;
  manufacturerError.value = manufacturer.value ? undefined : 'Choose a manufacturer';
  modelError.value = config ? undefined : 'Choose a model';
  baudError.value = undefined;
  portError.value = serialPort.value ? undefined : 'Choose a serial port';

  if (config && showBaudRate.value) {
    const listed = listedProgrammingBaudRates(config.serialConfig);

    if (baudRate.value === undefined || !listed.includes(baudRate.value)) {
      baudError.value = 'Choose a baud rate';
    }
  }

  if (!config || manufacturerError.value || modelError.value || baudError.value || portError.value || !serialPort.value) {
    return;
  }

  const path = serialPort.value;
  await releaseSerialPortHold();
  emit('confirm', {
    radioId: config.id,
    baudRate: showBaudRate.value ? baudRate.value : undefined,
    serialPort: path,
  });
  open.value = false;
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Import from Radio"
    description="Choose the installed model and the cable's serial port. This clone is not added under Preferences."
    class="max-w-lg"
  >
    <template #body>
      <div class="flex flex-col gap-4">
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

        <UFormField label="Serial port" :error="portError" required>
          <div class="flex gap-2">
            <USelectMenu
              v-model="serialPort"
              :items="ports"
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
        <UButton color="primary" label="Import" icon="i-lucide-download" @click="confirm" />
      </div>
    </template>
  </UModal>
</template>
