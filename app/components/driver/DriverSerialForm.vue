<script setup lang="ts">
import { driverFieldError } from '~/utils/driver-compile';
import type { DriverDraft, DriverLineLevel } from '~/utils/driver-draft';

const { draft, compiled, patch } = useDriverDraft();

const dataBitItems = [
  { label: '8', value: 8 },
  { label: '7', value: 7 },
  { label: '6', value: 6 },
  { label: '5', value: 5 },
];

const stopBitItems = [
  { label: '1', value: 1 },
  { label: '1.5', value: 1.5 },
  { label: '2', value: 2 },
];

const parityItems = [
  { label: 'None', value: 'none' },
  { label: 'Even', value: 'even' },
  { label: 'Odd', value: 'odd' },
];

const lineItems = [
  { label: 'Default (asserted)', value: 'omit' },
  { label: 'Asserted', value: 'on' },
  { label: 'Cleared', value: 'off' },
];

const baudRate = computed({
  get: () => draft.value.baudRate,
  set: (value: string) => patch({ baudRate: value }),
});
const baudRates = computed({
  get: () => draft.value.baudRates,
  set: (value: string) => patch({ baudRates: value }),
});

function errorAt(path: string): string | undefined {
  return driverFieldError(compiled.value.issues, path);
}

function onDataBits(value: unknown): void {
  if (value === 5 || value === 6 || value === 7 || value === 8) {
    patch({ dataBits: value });
  }
}

function onStopBits(value: unknown): void {
  if (value === 1 || value === 1.5 || value === 2) {
    patch({ stopBits: value });
  }
}

function onParity(value: unknown): void {
  if (value === 'none' || value === 'even' || value === 'odd') {
    patch({ parity: value });
  }
}

function onLine(field: 'rts' | 'dtr', value: unknown): void {
  if (value === 'omit' || value === 'on' || value === 'off') {
    patch({ [field]: value satisfies DriverLineLevel });
  }
}

function setRtscts(value: boolean | 'indeterminate'): void {
  if (value !== 'indeterminate') {
    patch({ rtscts: value } satisfies Partial<DriverDraft>);
  }
}
</script>

<template>
  <div class="flex max-w-3xl flex-col gap-4">
    <div class="grid gap-3 sm:grid-cols-2">
      <UFormField label="Baud rate" required :error="errorAt('serial.baudRate')" description="Speed used to open the programming port.">
        <UInput v-model="baudRate" class="w-full font-mono" inputmode="numeric" placeholder="9600" />
      </UFormField>
      <UFormField
        label="Other baud rates"
        hint="Optional"
        :error="errorAt('serial.baudRates')"
        description="Comma-separated. Include the default when the radio accepts more than one speed."
      >
        <UInput v-model="baudRates" class="w-full font-mono" placeholder="9600, 57600" />
      </UFormField>
      <UFormField label="Data bits">
        <USelect :model-value="draft.dataBits" :items="dataBitItems" value-key="value" class="w-full" @update:model-value="onDataBits" />
      </UFormField>
      <UFormField label="Stop bits">
        <USelect :model-value="draft.stopBits" :items="stopBitItems" value-key="value" class="w-full" @update:model-value="onStopBits" />
      </UFormField>
      <UFormField label="Parity">
        <USelect :model-value="draft.parity" :items="parityItems" value-key="value" class="w-full" @update:model-value="onParity" />
      </UFormField>
    </div>
    <UCheckbox
      :model-value="draft.rtscts"
      label="Hardware RTS/CTS"
      description="Some Kenwood clone modes need this on macOS."
      @update:model-value="setRtscts"
    />
    <div class="grid gap-3 sm:grid-cols-2">
      <UFormField label="RTS" description="Default leaves the line asserted after open.">
        <USelect :model-value="draft.rts" :items="lineItems" value-key="value" class="w-full" @update:model-value="onLine('rts', $event)" />
      </UFormField>
      <UFormField label="DTR" description="Default leaves the line asserted after open.">
        <USelect :model-value="draft.dtr" :items="lineItems" value-key="value" class="w-full" @update:model-value="onLine('dtr', $event)" />
      </UFormField>
    </div>
  </div>
</template>
