<script setup lang="ts">
import { driverFieldError } from '~/utils/driver-compile';
import {
  DRIVER_BAUD_RATES,
  formatDriverBaudRates,
  parseDriverBaudRates,
  type DriverDraft,
  type DriverLineLevel,
} from '~/utils/driver-draft';

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

const selectedBaudRates = computed(() => new Set(parseDriverBaudRates(draft.value.baudRates)));
const baudChoices = computed(() => {
  const extra = parseDriverBaudRates(draft.value.baudRates).filter(
    (rate) => !(DRIVER_BAUD_RATES as readonly number[]).includes(rate),
  );

  return [...DRIVER_BAUD_RATES, ...extra];
});

const supportedBaudRates = computed(() => parseDriverBaudRates(draft.value.baudRates));
const defaultBaudItems = computed(() => {
  return supportedBaudRates.value.map((rate) => ({ label: String(rate), value: String(rate) }));
});
const defaultBaudValue = computed(() => {
  const value = draft.value.baudRate;
  return defaultBaudItems.value.some((item) => item.value === value) ? value : undefined;
});

watch(supportedBaudRates, (rates) => {
  if (rates.length === 1 && draft.value.baudRate !== String(rates[0])) {
    patch({ baudRate: String(rates[0]) });
  }
});

function setBaudRate(rate: number, value: boolean | 'indeterminate'): void {
  if (value === 'indeterminate') {
    return;
  }

  const selected = parseDriverBaudRates(draft.value.baudRates);
  const next = value ? [...selected, rate] : selected.filter((item) => item !== rate);
  patch({ baudRates: formatDriverBaudRates(next) });
}

function onDefaultBaud(value: unknown): void {
  if (typeof value === 'string' || typeof value === 'number') {
    patch({ baudRate: String(value) });
  }
}

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
  <div class="flex w-full flex-col gap-4">
    <UFormField label="Supported baud rates" required :error="errorAt('serial.baudRates')">
      <template #hint>
        <HelpTooltip text="Every speed the programming port accepts." />
      </template>
      <div class="flex flex-wrap gap-x-4 gap-y-2" role="group" aria-label="Supported baud rates">
        <UCheckbox
          v-for="rate in baudChoices"
          :key="rate"
          :model-value="selectedBaudRates.has(rate)"
          :label="String(rate)"
          @update:model-value="setBaudRate(rate, $event)"
        />
      </div>
    </UFormField>
    <UFormField label="Default baud rate" required :error="errorAt('serial.baudRate')">
      <template #hint>
        <HelpTooltip text="Speed used to open the programming port. Choose one of the supported speeds. Filled in when only one is selected." />
      </template>
      <USelect
        :model-value="defaultBaudValue"
        :items="defaultBaudItems"
        value-key="value"
        placeholder="Select a speed"
        class="w-full font-mono sm:max-w-xs"
        @update:model-value="onDefaultBaud"
      />
    </UFormField>
    <div class="grid gap-3 sm:grid-cols-2">
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
    <div class="flex items-center gap-1">
      <UCheckbox :model-value="draft.rtscts" label="Hardware RTS/CTS" @update:model-value="setRtscts" />
      <HelpTooltip text="Some Kenwood clone modes need this on macOS." />
    </div>
    <div class="grid gap-3 sm:grid-cols-2">
      <UFormField label="RTS">
        <template #hint>
          <HelpTooltip text="Default leaves the line asserted after open." />
        </template>
        <USelect :model-value="draft.rts" :items="lineItems" value-key="value" class="w-full" @update:model-value="onLine('rts', $event)" />
      </UFormField>
      <UFormField label="DTR">
        <template #hint>
          <HelpTooltip text="Default leaves the line asserted after open." />
        </template>
        <USelect :model-value="draft.dtr" :items="lineItems" value-key="value" class="w-full" @update:model-value="onLine('dtr', $event)" />
      </UFormField>
    </div>
  </div>
</template>
