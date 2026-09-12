<script setup lang="ts">
import type { RadioId } from '@springfield/ham-radio-api';
import { SerialPort } from 'tauri-plugin-serialplugin';
import {
  programmingBaudRateSelectItems,
  readRememberedBaudRate,
  resolveProgrammingBaudRate,
  shouldSelectProgrammingBaudRate,
  writeRememberedBaudRate,
} from '~/utils/radio-baud-rate';
import { readRememberedRadio, resolveRememberedRadio, writeRememberedRadio } from '~/utils/remembered-radio';
import {
  readRememberedSerialPort,
  resolveRememberedSerialPort,
  writeRememberedSerialPort,
} from '~/utils/remembered-serial-port';
import { holdSerialPortInactive, releaseSerialPortHold } from '~/utils/serial-idle-hold';
import { serialPortSelectItems } from '~/utils/serial-port-list';
import { readSerialPortSettings } from '~/utils/serial-port-settings';

const {
  configurations,
  manufacturers,
  isLoading,
  error,
  getModelsByManufacturer,
  importFromRadio,
  importOpen,
  openModulesInstall,
  refreshCatalogState,
} = useRadio();

const selectedManufacturer = ref<string | undefined>();
const selectedRadio = ref<RadioId | undefined>();
const selectedPort = ref<string | undefined>();
const selectedBaudRate = ref<number | undefined>();
const ports = ref<Array<{ label: string; value: string }>>([]);
const loadingPorts = ref(false);
const models = computed(() => {
  if (!selectedManufacturer.value) {
    return [];
  }

  return getModelsByManufacturer(selectedManufacturer.value).map((radioId) => ({
    label: radioId.name,
    value: radioId,
  }));
});

const selectedConfig = computed(() => {
  if (!selectedRadio.value) {
    return undefined;
  }

  return configurations.value.find((config) => config.id.model === selectedRadio.value?.model);
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

const canImport = computed(() => Boolean(selectedRadio.value && selectedPort.value && selectedBaudRate.value));

watch(selectedManufacturer, (manufacturer) => {
  if (selectedRadio.value?.manufacturer !== manufacturer) {
    selectedRadio.value = undefined;
  }
});

watch(selectedRadio, (radioId) => {
  if (radioId) {
    writeRememberedRadio(radioId);
  }
});

watch(
  selectedConfig,
  (config) => {
    if (!config || !selectedRadio.value) {
      selectedBaudRate.value = undefined;
      return;
    }

    selectedBaudRate.value = resolveProgrammingBaudRate(
      config.serialConfig,
      readRememberedBaudRate(selectedRadio.value.model),
    );
  },
  { immediate: true },
);

watch(selectedPort, (path) => {
  if (path) {
    writeRememberedSerialPort(path);
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
  } catch (cause) {
    console.error('Failed to list serial ports', cause);
    ports.value = [];
    selectedPort.value = undefined;
  } finally {
    loadingPorts.value = false;

    if (importOpen.value && selectedPort.value && selectedPort.value === previousPort) {
      void holdSerialPortInactive(selectedPort.value).catch((holdCause) => {
        console.error('Failed to hold serial port inactive', holdCause);
      });
    }
  }
}

async function importRadio(): Promise<void> {
  if (!selectedRadio.value || !selectedPort.value || selectedBaudRate.value === undefined) {
    return;
  }

  const serialPortPath = selectedPort.value;
  const radioId = selectedRadio.value;
  const baudRate = selectedBaudRate.value;

  writeRememberedBaudRate(radioId.model, baudRate);
  await releaseSerialPortHold();
  importOpen.value = false;
  await importFromRadio(serialPortPath, radioId, baudRate);
}

async function applyRememberedRadio(): Promise<void> {
  const restored = resolveRememberedRadio(
    readRememberedRadio(),
    configurations.value.map((config) => config.id),
  );

  if (!restored) {
    const current = selectedRadio.value;
    const installed = current !== undefined && configurations.value.some((config) => config.id.model === current.model);

    if (!installed) {
      selectedRadio.value = undefined;
      selectedManufacturer.value = undefined;
    }

    return;
  }

  selectedManufacturer.value = restored.manufacturer;
  await nextTick();
  selectedRadio.value = restored;
}

watch(importOpen, (open) => {
  if (open) {
    void refreshCatalogState().then(() => applyRememberedRadio());
    void loadPorts();
    return;
  }

  void releaseSerialPortHold();
});
</script>

<template>
  <UModal
    v-model:open="importOpen"
    title="Import from Radio"
    description="Plug the programming cable into the computer, choose the serial port, then plug the cable into the radio."
    class="max-w-lg"
  >
    <template #body>
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        title="Could not load radios"
        :description="error"
        class="mb-4"
      />

      <div class="flex flex-col gap-4">
        <UFormField label="Manufacturer">
          <div class="flex gap-2">
            <USelectMenu
              v-model="selectedManufacturer"
              :items="manufacturers"
              :loading="isLoading"
              placeholder="Select manufacturer"
              class="w-full"
            />
            <UTooltip text="Install radios">
              <UButton
                icon="i-lucide-download"
                color="neutral"
                variant="outline"
                aria-label="Install radios"
                @click="openModulesInstall()"
              />
            </UTooltip>
          </div>
        </UFormField>

        <UFormField label="Model">
          <USelectMenu
            v-model="selectedRadio"
            :items="models"
            value-key="value"
            :disabled="!selectedManufacturer"
            placeholder="Select model"
            class="w-full"
          />
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

    <template #footer="{ close }">
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" label="Cancel" @click="close" />
        <UButton label="Import" :disabled="!canImport" @click="importRadio" />
      </div>
    </template>
  </UModal>
</template>
