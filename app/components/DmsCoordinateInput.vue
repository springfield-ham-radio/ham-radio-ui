<script setup lang="ts">
import { type CoordinateAxis, type DmsInput } from '~/utils/maidenhead';

const props = defineProps<{
  axis: CoordinateAxis;
  modelValue: DmsInput;
  label: string;
  error?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: DmsInput];
  change: [];
}>();

const hemisphereItems = computed(() => (props.axis === 'latitude' ? ['N', 'S'] : ['E', 'W']));
const degreesPlaceholder = computed(() => (props.axis === 'latitude' ? '38' : '90'));
const minutesPlaceholder = '37';
const secondsPlaceholder = computed(() => (props.axis === 'latitude' ? '37.2' : '57.8'));

function patch(partial: Partial<DmsInput>): void {
  emit('update:modelValue', { ...props.modelValue, ...partial });
  emit('change');
}

function onDegrees(value: string | number): void {
  patch({ degrees: String(value) });
}

function onMinutes(value: string | number): void {
  patch({ minutes: String(value) });
}

function onSeconds(value: string | number): void {
  patch({ seconds: String(value) });
}

function onHemisphere(value: string | number): void {
  const hemisphere = String(value);

  if (props.axis === 'latitude' && (hemisphere === 'N' || hemisphere === 'S')) {
    patch({ hemisphere });
    return;
  }

  if (props.axis === 'longitude' && (hemisphere === 'E' || hemisphere === 'W')) {
    patch({ hemisphere });
  }
}

</script>

<template>
  <UFormField :label="label" hint="Optional" :error="error">
    <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_4.5rem] gap-1.5">
      <div>
        <p class="mb-1 text-[11px] leading-none text-muted">Degrees</p>
        <UInput
          :model-value="modelValue.degrees"
          type="text"
          inputmode="numeric"
          class="w-full tabular-nums"
          :placeholder="degreesPlaceholder"
          aria-label="Degrees"
          @update:model-value="onDegrees"
        >
          <template #trailing>
            <span class="text-xs text-muted">°</span>
          </template>
        </UInput>
      </div>
      <div>
        <p class="mb-1 text-[11px] leading-none text-muted">Minutes</p>
        <UInput
          :model-value="modelValue.minutes"
          type="text"
          inputmode="numeric"
          class="w-full tabular-nums"
          :placeholder="minutesPlaceholder"
          aria-label="Minutes"
          @update:model-value="onMinutes"
        >
          <template #trailing>
            <span class="text-xs text-muted">′</span>
          </template>
        </UInput>
      </div>
      <div>
        <p class="mb-1 text-[11px] leading-none text-muted">Seconds</p>
        <UInput
          :model-value="modelValue.seconds"
          type="text"
          inputmode="decimal"
          class="w-full tabular-nums"
          :placeholder="secondsPlaceholder"
          aria-label="Seconds"
          @update:model-value="onSeconds"
        >
          <template #trailing>
            <span class="text-xs text-muted">″</span>
          </template>
        </UInput>
      </div>
      <div>
        <p class="mb-1 text-[11px] leading-none text-muted">{{ axis === 'latitude' ? 'N / S' : 'E / W' }}</p>
        <USelect
          :model-value="modelValue.hemisphere"
          :items="hemisphereItems"
          class="w-full"
          :aria-label="axis === 'latitude' ? 'North or south' : 'East or west'"
          @update:model-value="onHemisphere"
        />
      </div>
    </div>
  </UFormField>
</template>
