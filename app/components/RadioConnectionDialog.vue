<script setup lang="ts">
import {
  useRadioConnectionForm,
  type RadioConnectionFilter,
  type RadioConnectionSelection,
} from '~/composables/useRadioConnectionForm';

const props = defineProps<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmLoading?: boolean;
  filter?: RadioConnectionFilter;
  unavailablePorts?: string[];
  omitUnavailablePorts?: boolean;
}>();

const emit = defineEmits<{
  'update:open': [open: boolean];
  confirm: [selection: RadioConnectionSelection];
}>();

const isOpen = computed({
  get: () => props.open,
  set: (open: boolean) => {
    emit('update:open', open);
  },
});

const {
  isLoading,
  error,
  selectedManufacturer,
  selectedRadio,
  selectedPort,
  selectedBaudRate,
  ports,
  loadingPorts,
  availableManufacturers,
  models,
  baudRateItems,
  showBaudRate,
  canSubmit,
  openModulesInstall,
  loadPorts,
  takeSelection,
} = useRadioConnectionForm({
  isOpen: () => props.open,
  filter: props.filter,
  unavailablePorts: () => props.unavailablePorts ?? [],
  omitUnavailablePorts: () => props.omitUnavailablePorts ?? false,
});

async function confirm(): Promise<void> {
  const selection = await takeSelection();

  if (!selection) {
    return;
  }

  isOpen.value = false;
  emit('confirm', selection);
}
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
              :items="availableManufacturers"
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
