<script setup lang="ts">
import { SerialPort } from 'tauri-plugin-serialplugin-api';
import { markCatBusySerialPorts } from '~/utils/cat-memory-transfer';
import { holdSerialPortInactive, releaseSerialPortHold } from '~/utils/serial-idle-hold';
import { resolveRadioPortChoices, type RadioPortChoice } from '~/utils/radio-port-selection';
import { serialPortOption, serialPortSelectItems } from '~/utils/serial-port-list';
import { readSerialPortSettings } from '~/utils/serial-port-settings';
import type { RadioDialogMessageAlert } from '~/utils/radio-dialog-message';

const props = defineProps<{
  open?: boolean;
  /** Render the port field in place. Callers that omit this keep the modal. */
  embedded?: boolean;
  title?: string;
  description?: string;
  /** Optional per-radio setup text (immediately above the serial port field). */
  setupAlert?: RadioDialogMessageAlert;
  confirmLabel?: string;
  confirmColor?: 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral';
  confirmIcon?: string;
  confirmLoading?: boolean;
  /** Extra gate on the confirm button (for example acknowledging validation errors). */
  confirmDisabled?: boolean;
  defaultPort?: string;
  unavailablePorts?: string[];
  omitUnavailablePorts?: boolean;
  warningTitle?: string;
  warningDescription?: string;
  /** Width class for the dialog panel. */
  panelClass?: string;
}>();

const emit = defineEmits<{
  'update:open': [open: boolean];
  confirm: [serialPortPath: string];
  selection: [selection: { port: string | undefined; livePorts: string[]; loading: boolean }];
}>();

const slots = useSlots();

const isOpen = computed({
  get: () => props.open ?? false,
  set: (open: boolean) => {
    emit('update:open', open);
  },
});

const selectedPort = shallowRef<string | undefined>();
const ports = ref<RadioPortChoice[]>([]);
const loadingPorts = shallowRef(false);
const unavailable = computed(() => props.unavailablePorts ?? []);
const portItems = computed(() =>
  markCatBusySerialPorts(ports.value, unavailable.value, {
    omitBusy: props.omitUnavailablePorts ?? false,
  }),
);
const canSubmit = computed(() => {
  const path = selectedPort.value;

  if (!path || unavailable.value.includes(path)) {
    return false;
  }

  const item = portItems.value.find((port) => port.value === path);

  return Boolean(item && !item.disabled);
});

watch([selectedPort, ports, loadingPorts], () => {
  if (!props.embedded) {
    return;
  }

  emit('selection', {
    port: selectedPort.value,
    livePorts: ports.value.map((port) => port.value),
    loading: loadingPorts.value,
  });
});

watch(selectedPort, (path) => {
  if (props.embedded || !props.open || !path || unavailable.value.includes(path)) {
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
    const resolved = resolveRadioPortChoices({
      livePorts: listed,
      savedPort: props.embedded ? undefined : props.defaultPort,
      currentPort: previous,
      unavailablePorts: unavailable.value,
      aliases: settings.portAliases,
    });

    ports.value = resolved.ports;
    selectedPort.value = resolved.selectedPort;
  } catch (cause) {
    console.error('Failed to list serial ports', cause);
    const fallback = props.embedded ? undefined : props.defaultPort?.trim();

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
  if (!canSubmit.value || !selectedPort.value) {
    return;
  }

  const path = selectedPort.value;
  await releaseSerialPortHold();
  emit('confirm', path);
  isOpen.value = false;
}

onMounted(() => {
  if (props.embedded) {
    void loadPorts();
  }
});

watch(
  () => props.open,
  (open) => {
    if (props.embedded) {
      return;
    }

    if (open) {
      selectedPort.value = undefined;
      void loadPorts();
      return;
    }

    void releaseSerialPortHold();
  },
);
</script>

<template>
  <UModal
    v-if="!embedded"
    v-model:open="isOpen"
    :title="title"
    :description="slots.description ? undefined : description"
    :class="panelClass ?? 'max-w-lg'"
  >
    <template v-if="slots.description" #description>
      <slot name="description" />
    </template>
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
      <slot name="review" :selected-port="selectedPort" />
      <UAlert
        v-if="setupAlert"
        :color="setupAlert.color"
        variant="subtle"
        :icon="setupAlert.icon"
        :title="setupAlert.title"
        class="mb-4"
      >
        <template #description>
          <p class="whitespace-pre-line">{{ setupAlert.body }}</p>
        </template>
      </UAlert>
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
    </template>

    <template #footer="{ close }">
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" label="Cancel" @click="close" />
        <UButton
          :color="confirmColor"
          :icon="confirmIcon"
          :label="confirmLabel"
          :disabled="!canSubmit || confirmDisabled || confirmLoading"
          :loading="confirmLoading"
          @click="confirm"
        />
      </div>
    </template>
  </UModal>
  <div v-else class="flex flex-col gap-3">
    <UFormField label="Programming port">
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
