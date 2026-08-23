<script setup lang="ts">
import type { RadioId } from '@springfield/ham-radio-api';
import { SerialPort } from 'tauri-plugin-serialplugin';
import { holdSerialPortInactive, releaseSerialPortHold } from '~/utils/serial-idle-hold';

const {
  manufacturers,
  isLoading,
  error,
  getModelsByManufacturer,
  importFromRadio,
  importOpen,
  addRadioFromFile,
} = useRadio();

const selectedManufacturer = ref<string | undefined>();
const selectedRadio = ref<RadioId | undefined>();
const selectedPort = ref<string | undefined>();
const ports = ref<Array<{ label: string; value: string }>>([]);
const loadingPorts = ref(false);
const addingRadio = ref(false);
const models = computed(() => {
  if (!selectedManufacturer.value) {
    return [];
  }

  return getModelsByManufacturer(selectedManufacturer.value).map((radioId) => ({
    label: radioId.name,
    value: radioId,
  }));
});

const canImport = computed(() => Boolean(selectedRadio.value && selectedPort.value));

watch(selectedManufacturer, () => {
  selectedRadio.value = undefined;
});

watch(selectedPort, (path) => {
  void holdSerialPortInactive(path).catch((cause) => {
    console.error('Failed to hold serial port inactive', cause);
  });
});

async function loadPorts(): Promise<void> {
  loadingPorts.value = true;

  try {
    const availablePorts = await SerialPort.available_ports();
    const isMacOS = navigator.userAgent.includes('Mac');

    ports.value = Object.keys(availablePorts)
      .filter((path) => !isMacOS || path.startsWith('/dev/cu.'))
      .map((path) => ({
        label: isMacOS ? path.replace('/dev/cu.', '') : path,
        value: path,
      }));
  } catch (cause) {
    console.error('Failed to list serial ports', cause);
    ports.value = [];
  } finally {
    loadingPorts.value = false;
  }
}

async function importRadio(): Promise<void> {
  if (!selectedRadio.value || !selectedPort.value) {
    return;
  }

  const serialPortPath = selectedPort.value;
  const radioId = selectedRadio.value;

  await releaseSerialPortHold();
  importOpen.value = false;
  await importFromRadio(serialPortPath, radioId);
}

async function addRadio(): Promise<void> {
  addingRadio.value = true;

  try {
    const previousManufacturer = selectedManufacturer.value;
    await addRadioFromFile();

    if (!selectedManufacturer.value && manufacturers.value.length === 1) {
      selectedManufacturer.value = manufacturers.value[0];
    } else if (previousManufacturer && manufacturers.value.includes(previousManufacturer)) {
      selectedManufacturer.value = previousManufacturer;
    }
  } finally {
    addingRadio.value = false;
  }
}

watch(importOpen, (open) => {
  if (open) {
    void loadPorts();

    if (selectedPort.value) {
      void holdSerialPortInactive(selectedPort.value).catch((cause) => {
        console.error('Failed to hold serial port inactive', cause);
      });
    }

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
            <UTooltip text="Add radio configuration JSON">
              <UButton
                icon="i-lucide-plus"
                color="neutral"
                variant="outline"
                :loading="addingRadio"
                @click="addRadio"
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

        <UFormField label="Serial port">
          <div class="flex gap-2">
            <USelectMenu
              v-model="selectedPort"
              :items="ports"
              value-key="value"
              placeholder="Select a serial port"
              class="w-full"
            />
            <UTooltip text="Refresh serial ports">
              <UButton icon="i-lucide-refresh-cw" color="neutral" variant="outline" :loading="loadingPorts" @click="loadPorts" />
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
