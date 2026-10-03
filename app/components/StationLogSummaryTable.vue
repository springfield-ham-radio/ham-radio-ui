<script setup lang="ts">
import type { StationLogBreakdownRow } from '~/utils/station-log-summary';

defineProps<{
  title: string;
  label: string;
  rows: StationLogBreakdownRow[];
}>();
</script>

<template>
  <section class="border-t border-default pt-3">
    <h3 class="text-sm font-semibold text-highlighted">{{ title }}</h3>
    <table class="mt-2 w-full text-xs">
      <thead>
        <tr class="text-muted">
          <th class="pb-1 text-left font-medium">{{ label }}</th>
          <th class="pb-1 text-right font-medium">QSOs</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.label">
          <td class="py-0.5 text-default">{{ row.label }}</td>
          <td class="py-0.5 text-right font-medium tabular-nums text-highlighted">{{ row.count }}</td>
        </tr>
        <tr v-if="rows.length === 0">
          <td colspan="2" class="py-1 text-muted">No contacts</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
