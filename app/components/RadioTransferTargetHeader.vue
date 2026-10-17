<script setup lang="ts">
import { computed } from 'vue';
import type { LoadedRadioConfig } from '~/utils/radio-catalog-db';
import {
  radioTransferManufacturerModelLine,
  radioTransferTargetDisplay,
  type RadioTransferTarget,
} from '~/utils/radio-transfer-target';

const props = defineProps<{
  radio?: RadioTransferTarget | null;
  configurations: readonly LoadedRadioConfig[];
  /** Guest clone opened from Read from Radio, not saved under Preferences. */
  guest?: boolean;
}>();

const display = computed(() => (props.radio ? radioTransferTargetDisplay(props.radio, props.configurations) : undefined));
const manufacturerModel = computed(() => (display.value ? radioTransferManufacturerModelLine(display.value) : undefined));
</script>

<template>
  <UCard v-if="display" class="mb-4 bg-default" :ui="{ body: 'p-3 sm:p-4' }">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="min-w-0">
        <p class="text-sm font-medium text-default">Target radio</p>
        <p class="mt-1 text-base font-semibold text-highlighted">{{ display.cardName }}</p>
        <p class="mt-0.5 text-sm font-medium text-default">{{ manufacturerModel }}</p>
      </div>
      <UBadge v-if="guest" color="neutral" variant="outline" class="shrink-0">Guest</UBadge>
    </div>
  </UCard>
</template>
