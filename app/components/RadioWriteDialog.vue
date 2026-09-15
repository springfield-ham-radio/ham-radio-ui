<script setup lang="ts">
import { SerialPort } from 'tauri-plugin-serialplugin-api';
import {
  programmingBaudRateSelectItems,
  readRememberedBaudRate,
  resolveProgrammingBaudRate,
  shouldSelectProgrammingBaudRate,
  writeRememberedBaudRate,
} from '~/utils/radio-baud-rate';
import {
  readRememberedSerialPort,
  resolveRememberedSerialPort,
  writeRememberedSerialPort,
} from '~/utils/remembered-serial-port';
import { holdSerialPortInactive, releaseSerialPortHold } from '~/utils/serial-idle-hold';
import { serialPortSelectItems } from '~/utils/serial-port-list';
import { markCatBusySerialPorts } from '~/utils/cat-memory-transfer';
import { readSerialPortSettings } from '~/utils/serial-port-settings';

const { configurations, writeOpen, activeRadioId, writeToRadio, refreshCatalogState } = useRadio();
const { lockedPorts } = useCatPortLock();

const selectedPort = ref<string | undefined>();
const selectedBaudRate = ref<number | undefined>();
const ports = ref<Array<{ label: string; value: string }>>([]);
const loadingPorts = ref(false);
const portItems = computed(() => markCatBusySerialPorts(ports.value, lockedPorts.value));

const selectedConfig = computed(() => {
  const radioId = activeRadioId.value;

  if (!radioId) {
    return undefined;
  }

  return configurations.value.find((config) => config.id.model === radioId.model);
});

const baudRateItems = computed(() => {
  if (!selectedConfig.value) {
    return [];
  }

  return programmingBaudRateSelectItems(selectedConfig.value.serialConfig);
});

const showBaudRate = computed(() => {
  if (!selectedConfig.value) {
    return false;
  }

  return shouldSelectProgrammingBaudRate(selectedConfig.value.serialConfig);
});

const canWrite = computed(() => {
  if (!activeRadioId.value || !selectedPort.value || selectedBaudRate.value === undefined) {
    return false;
  }

  return !lockedPorts.value.includes(selectedPort.value);
});
const radioLabel = computed(() => {
  const radioId = activeRadioId.value;

  if (!radioId) {
    return undefined;
  }

  return radioId.name;
});

watch(
  selectedConfig,
  (config) => {
    const radioId = activeRadioId.value;

    if (!config || !radioId) {
      selectedBaudRate.value = undefined;
      return;
    }

    selectedBaudRate.value = resolveProgrammingBaudRate(config.serialConfig, readRememberedBaudRate(radioId.model));
  },
  { immediate: true },
);

watch(selectedPort, (path) => {
  if (path) {
    writeRememberedSerialPort(path);
  }

  if (!path || lockedPorts.value.includes(path)) {
    return;
  }

  void holdSerialPortInactive(path).catch((cause) => {
    console.error('Failed to hold serial port inactive', cause);
  });
});

async function loadPorts(): Promise<void> {
  loadingPorts.value = true;
  const previousPort = selectedPort.value;

  try {
    await releaseSerialPortHold();
    const availablePorts = await SerialPort.available_ports();
    ports.value = serialPortSelectItems(Object.keys(availablePorts), readSerialPortSettings());
    selectedPort.value = resolveRememberedSerialPort(
      readRememberedSerialPort(),
      ports.value.map((port) => port.value),
      selectedPort.value,
    );

    if (selectedPort.value && lockedPorts.value.includes(selectedPort.value)) {
      selectedPort.value = ports.value.find((port) => !lockedPorts.value.includes(port.value))?.value;
    }
  } catch (cause) {
    console.error('Failed to list serial ports', cause);
    ports.value = [];
    selectedPort.value = undefined;
  } finally {
    loadingPorts.value = false;

    if (writeOpen.value && selectedPort.value && selectedPort.value === previousPort) {
      void holdSerialPortInactive(selectedPort.value).catch((holdCause) => {
        console.error('Failed to hold serial port inactive', holdCause);
      });
    }
  }
}

async function writeRadio(): Promise<void> {
  if (!selectedPort.value || !activeRadioId.value || selectedBaudRate.value === undefined) {
    return;
  }

  const serialPortPath = selectedPort.value;
  const baudRate = selectedBaudRate.value;

  writeRememberedBaudRate(activeRadioId.value.model, baudRate);
  await releaseSerialPortHold();
  writeOpen.value = false;
  await writeToRadio(serialPortPath, baudRate);
}

watch(writeOpen, (open) => {
  if (open) {
    void refreshCatalogState();
    void loadPorts();
    return;
  }

  void releaseSerialPortHold();
});
</script>

<template>
  <UModal
    v-model:open="writeOpen"
    title="Write to Radio"
    description="Plug the programming cable into the computer, choose the serial port, then plug the cable into the radio."
    class="max-w-lg"
  >
    <template #body>
      <UAlert
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="This replaces the radio's memory"
        description="The loaded memory image will overwrite what is currently stored in the radio."
        class="mb-4"
      />

      <div class="flex flex-col gap-4">
        <UFormField label="Radio">
          <p class="text-sm text-highlighted">{{ radioLabel }}</p>
        </UFormField>

        <UFormField
          v-if="showBaudRate"
          label="Baud rate"
          description="Match the radio's PC port speed"
        >
          <USelect
            v-model="selectedBaudRate"
            :items="baudRateItems"
            value-key="value"
            placeholder="Select baud rate"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Serial port">
          <div class="flex gap-2">
            <USelectMenu
              v-model="selectedPort"
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

    <template #footer="{ close }">
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" label="Cancel" @click="close" />
        <UButton label="Write" :disabled="!canWrite" @click="writeRadio" />
      </div>
    </template>
  </UModal>
</template>
