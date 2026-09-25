<script setup lang="ts">
import { formatFrequencyMHz, parseFrequencyMHz } from '~/utils/channel-edit';
import type { CatVfo } from '~/utils/kenwood-cat-session';
import type { RadioPrivilegeChoice } from '~/utils/license-people';

const props = defineProps<{
  vfo: CatVfo;
  modes: string[];
  powers: string[];
  isControl: boolean;
  transmitting: boolean;
  disabled: boolean;
  privilege?: RadioPrivilegeChoice;
}>();

const emit = defineEmits<{
  frequency: [frequencyHz: number];
  mode: [mode: string];
  power: [power: string];
  transmit: [transmit: boolean];
  log: [];
}>();

const { getTransmitPrivilegeWarning } = useOperatorLicense();

const frequencyDraft = ref(formatFrequencyMHz(props.vfo.frequencyHz));
const frequencyDirty = ref(false);

const powerItems = computed(() =>
  props.powers.map((power) => ({
    label: power,
    value: power,
  })),
);

const privilegeWarning = computed(() => getTransmitPrivilegeWarning(props.vfo.frequencyHz, props.privilege));

watch(
  () => props.vfo.frequencyHz,
  (frequencyHz) => {
    if (!frequencyDirty.value) {
      frequencyDraft.value = formatFrequencyMHz(frequencyHz);
    }
  },
);

function applyFrequency(): void {
  const frequencyHz = parseFrequencyMHz(frequencyDraft.value);

  if (frequencyHz === undefined) {
    frequencyDraft.value = formatFrequencyMHz(props.vfo.frequencyHz);
    frequencyDirty.value = false;
    return;
  }

  frequencyDirty.value = false;
  emit('frequency', frequencyHz);
}

function onMode(mode: string | undefined): void {
  if (!mode) {
    return;
  }

  emit('mode', mode);
}

function onPower(power: string | undefined): void {
  if (!power) {
    return;
  }

  emit('power', power);
}

function onPttDown(event: PointerEvent): void {
  const target = event.currentTarget;

  if (target instanceof HTMLElement) {
    target.setPointerCapture(event.pointerId);
  }

  emit('transmit', true);
}

function onPttUp(): void {
  emit('transmit', false);
}
</script>

<template>
  <div class="flex flex-col gap-4 overflow-hidden rounded-xl bg-default p-4 shadow-sm ring-1 ring-default">
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-xs font-medium tracking-wide text-muted uppercase">VFO {{ vfo.label }}</p>
        <p class="mt-1 font-mono text-3xl font-semibold tabular-nums text-highlighted">
          {{ formatFrequencyMHz(vfo.frequencyHz) }}
          <span class="text-base font-medium text-muted">MHz</span>
        </p>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-1.5">
        <UBadge
          v-if="isControl"
          label="CTRL"
          color="primary"
          variant="subtle"
          size="sm"
        />
        <UBadge
          :label="vfo.mode"
          color="neutral"
          variant="subtle"
          size="sm"
        />
        <UBadge
          v-if="vfo.power"
          :label="vfo.power"
          color="neutral"
          variant="outline"
          size="sm"
        />
      </div>
    </div>

    <UAlert
      v-if="privilegeWarning"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="privilegeWarning.title"
      :description="privilegeWarning.detail"
    />

    <div class="grid gap-3 sm:grid-cols-3">
      <UFormField label="Frequency (MHz)" class="sm:col-span-1">
        <UInput
          v-model="frequencyDraft"
          inputmode="decimal"
          class="w-full font-mono tabular-nums"
          :disabled="disabled"
          @update:model-value="frequencyDirty = true"
          @blur="applyFrequency"
          @keydown.enter="applyFrequency"
        />
      </UFormField>

      <UFormField label="Mode">
        <USelect
          :model-value="vfo.mode"
          :items="modes"
          :disabled="disabled || modes.length <= 1"
          class="w-full"
          @update:model-value="onMode"
        />
      </UFormField>

      <UFormField label="Power">
        <USelect
          :model-value="vfo.power"
          :items="powerItems"
          value-key="value"
          :disabled="disabled"
          class="w-full"
          @update:model-value="onPower"
        />
      </UFormField>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <UButton
        :color="transmitting && isControl ? 'error' : 'neutral'"
        :variant="transmitting && isControl ? 'solid' : 'outline'"
        :label="transmitting && isControl ? 'Transmitting' : 'Hold to transmit'"
        icon="i-lucide-radio"
        :disabled="disabled"
        @pointerdown="onPttDown"
        @pointerup="onPttUp"
        @pointercancel="onPttUp"
      />
      <UButton
        color="primary"
        variant="outline"
        icon="i-lucide-notebook-pen"
        label="Log contact"
        :disabled="disabled"
        @click="emit('log')"
      />
    </div>
  </div>
</template>
