<script setup lang="ts">
import type { LoadedRadioConfig } from '~/utils/radio-catalog-db';
import { radioTransferTargetDisplay, type RadioTransferTarget } from '~/utils/radio-transfer-target';

const props = defineProps<{
  radio?: RadioTransferTarget | null;
  configurations: readonly LoadedRadioConfig[];
  /** Guest clone opened from Read from Radio, not saved under Preferences. */
  guest?: boolean;
}>();

const display = computed(() => (props.radio ? radioTransferTargetDisplay(props.radio, props.configurations) : undefined));
</script>

<template>
  <UCard v-if="display" variant="subtle" class="mb-4" :ui="{ body: 'p-3 sm:p-4' }">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="min-w-0">
        <p class="text-base font-semibold text-highlighted">{{ display.cardName }}</p>
        <p class="mt-0.5 text-sm text-muted">{{ display.manufacturer }} · {{ display.modelLabel }}</p>
      </div>
      <UBadge v-if="guest" color="neutral" variant="subtle" class="shrink-0">Guest</UBadge>
    </div>
  </UCard>
</template>
