<script setup lang="ts">
import type { StationLogBreakdownRow, StationLogSummary } from '~/utils/station-log-summary';

defineProps<{
  summary: StationLogSummary;
  scopedToSearch: boolean;
}>();

const totals: { key: keyof Pick<StationLogSummary, 'qsoCount' | 'uniqueCalls' | 'potaCount' | 'qrzCount'>; label: string }[] = [
  { key: 'qsoCount', label: 'QSOs' },
  { key: 'uniqueCalls', label: 'Unique Calls' },
  { key: 'potaCount', label: 'POTA' },
  { key: 'qrzCount', label: 'QRZ' },
];
</script>

<template>
  <aside
    class="flex h-full min-h-0 w-44 shrink-0 flex-col gap-4 overflow-auto border-r border-default px-4 py-3"
    aria-label="Log summary"
  >
    <p v-if="scopedToSearch" class="text-xs text-muted">Matching search</p>

    <div class="flex flex-col gap-4">
      <p v-for="total in totals" :key="total.key">
        <span class="block text-2xl font-semibold tabular-nums leading-none text-highlighted">
          {{ summary[total.key] }}
        </span>
        <span class="mt-1 block text-xs text-muted">{{ total.label }}</span>
      </p>
    </div>

    <StationLogSummaryTable title="Bands" label="Band" :rows="summary.bands" />
    <StationLogSummaryTable title="Modes" label="Mode" :rows="summary.modes" />
    <StationLogSummaryTable
      title="Radios"
      label="Radio"
      :rows="summary.radios"
      :empty="summary.qsoCount === 0 ? 'No contacts' : 'None recorded'"
    />
    <StationLogSummaryTable
      title="Antennas"
      label="Antenna"
      :rows="summary.antennas"
      :empty="summary.qsoCount === 0 ? 'No contacts' : 'None recorded'"
    />
  </aside>
</template>
