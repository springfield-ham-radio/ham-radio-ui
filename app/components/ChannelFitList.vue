<script setup lang="ts">
import { formatFrequencyMHz } from '~/utils/channel-edit';
import type { AddToRadioValidationRow, ChannelValidationFinding } from '~/utils/channel-validation';

defineProps<{
  rows: AddToRadioValidationRow[];
}>();

function findingBadgeColor(level: ChannelValidationFinding['level']): 'error' | 'warning' {
  return level === 'error' ? 'error' : 'warning';
}

function rowSummary(row: AddToRadioValidationRow): string {
  const name = row.channel.name?.trim() || 'Unnamed';
  const tx = row.channel.transmitFrequency;
  const freq = tx !== undefined ? formatFrequencyMHz(tx) : '—';
  return `Slot ${row.slotNumber} · ${name} · ${freq}`;
}
</script>

<template>
  <ul class="max-h-64 space-y-2 overflow-y-auto rounded-md border border-default p-2">
    <li v-for="(row, index) in rows" :key="index" class="space-y-1.5 text-sm">
      <p class="font-medium text-highlighted">{{ rowSummary(row) }}</p>
      <ul v-if="row.findings.length > 0" class="flex flex-col gap-1">
        <li v-for="(finding, findingIndex) in row.findings" :key="findingIndex" class="flex items-start gap-2">
          <UBadge
            :color="findingBadgeColor(finding.level)"
            variant="subtle"
            size="xs"
            class="mt-0.5 shrink-0 uppercase"
          >
            {{ finding.level }}
          </UBadge>
          <span class="text-muted">{{ finding.message }}</span>
        </li>
      </ul>
      <p v-else class="text-xs text-muted">No issues found for this radio.</p>
    </li>
  </ul>
</template>
