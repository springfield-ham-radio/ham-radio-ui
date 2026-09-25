<script setup lang="ts">
import { SerialPort } from 'tauri-plugin-serialplugin-api';
import { markCatBusySerialPorts } from '~/utils/cat-memory-transfer';
import { holdSerialPortInactive, releaseSerialPortHold } from '~/utils/serial-idle-hold';
import { serialPortOption, serialPortSelectItems } from '~/utils/serial-port-list';
import { readSerialPortSettings } from '~/utils/serial-port-settings';

const props = defineProps<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmLoading?: boolean;
  defaultPort?: string;
  unavailablePorts?: string[];
  omitUnavailablePorts?: boolean;
  warningTitle?: string;
  warningDescription?: string;
}>();

const emit = defineEmits<{
  'update:open': [open: boolean];
  confirm: [serialPortPath: string];
}>();

const isOpen = computed({
  get: () => props.open,
  set: (open: boolean) => {
    emit('update:open', open);
  },
});

const selectedPort = shallowRef<string | undefined>();
const ports = ref<Array<{ label: string; value: string; description?: string }>>([]);
const loadingPorts = shallowRef(false);
const unavailable = computed(() => props.unavailablePorts ?? []);
const portItems = computed(() =>
  markCatBusySerialPorts(ports.value, unavailable.value, {
    omitBusy: props.omitUnavailablePorts ?? false,
  }),
);
const canSubmit = computed(() => {
  if (!selectedPort.value) {
    return false;
  }

  return !unavailable.value.includes(selectedPort.value);
});

watch(selectedPort, (path) => {
  if (!props.open || !path || unavailable.value.includes(path)) {
    return;
  }

  void holdSerialPortInactive(path).catch((cause) => {
    console.error('Failed to hold serial port inactive', cause);
  });
});

async function loadPorts(): Promise<void> {
  loadingPorts.value = true;
  const previous = selectedPort.value;

  try {
    await releaseSerialPortHold();
    const available = await SerialPort.available_ports();
    const settings = readSerialPortSettings();
    const listed = serialPortSelectItems(Object.keys(available), settings);
    const fallback = props.defaultPort?.trim();

    if (fallback && !listed.some((port) => port.value === fallback)) {
      listed.unshift(serialPortOption(fallback, settings.portAliases, { suffix: ' (saved)' }));
    }

    ports.value = listed;
    const preferred = previous ?? fallback;
    selectedPort.value = preferred && listed.some((port) => port.value === preferred) ? preferred : undefined;

    if (selectedPort.value && unavailable.value.includes(selectedPort.value)) {
      selectedPort.value = listed.find((port) => !unavailable.value.includes(port.value))?.value;
    }
  } catch (cause) {
    console.error('Failed to list serial ports', cause);
    const fallback = props.defaultPort?.trim();

    if (fallback) {
      ports.value = [serialPortOption(fallback, readSerialPortSettings().portAliases, { suffix: ' (saved)' })];
      selectedPort.value = unavailable.value.includes(fallback) ? undefined : fallback;
    } else {
      ports.value = [];
      selectedPort.value = undefined;
    }
  } finally {
    loadingPorts.value = false;

    if (props.open && selectedPort.value && selectedPort.value === previous) {
      void holdSerialPortInactive(selectedPort.value).catch((holdCause) => {
        console.error('Failed to hold serial port inactive', holdCause);
      });
    }
  }
}

async function confirm(): Promise<void> {
  if (!selectedPort.value || unavailable.value.includes(selectedPort.value)) {
    return;
  }

  const path = selectedPort.value;
  await releaseSerialPortHold();
  emit('confirm', path);
  isOpen.value = false;
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      selectedPort.value = props.defaultPort;
      void loadPorts();
      return;
    }

    void releaseSerialPortHold();
  },
);
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :title="title"
    :description="description"
    class="max-w-lg"
  >
    <template #body>
      <UAlert
        v-if="warningTitle"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="warningTitle"
        :description="warningDescription"
        class="mb-4"
      />
      <UFormField
        label="Serial port"
        description="The saved port is selected when it is available. Choose another adapter if this cable is plugged in somewhere else."
      >
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
    </template>

    <template #footer="{ close }">
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" label="Cancel" @click="close" />
        <UButton
          :label="confirmLabel"
          :disabled="!canSubmit"
          :loading="confirmLoading"
          @click="confirm"
        />
      </div>
    </template>
  </UModal>
</template>
