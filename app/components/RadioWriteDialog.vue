<script setup lang="ts">
import { SerialPort } from 'tauri-plugin-serialplugin';
import { holdSerialPortInactive, releaseSerialPortHold } from '~/utils/serial-idle-hold';

const { writeOpen, activeRadioId, writeToRadio } = useRadio();

const selectedPort = ref<string | undefined>();
const ports = ref<Array<{ label: string; value: string }>>([]);
const loadingPorts = ref(false);

const canWrite = computed(() => Boolean(activeRadioId.value && selectedPort.value));
const radioLabel = computed(() => {
  const radioId = activeRadioId.value;

  if (!radioId) {
    return undefined;
  }

  return radioId.name;
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

async function writeRadio(): Promise<void> {
  if (!selectedPort.value) {
    return;
  }

  const serialPortPath = selectedPort.value;

  await releaseSerialPortHold();
  writeOpen.value = false;
  await writeToRadio(serialPortPath);
}

watch(writeOpen, (open) => {
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
        <UButton label="Write" :disabled="!canWrite" @click="writeRadio" />
      </div>
    </template>
  </UModal>
</template>
