<script setup lang="ts">
import { formatHexDiffAddress, memoryHexDiff, type MemoryHexCell } from '~/utils/driver-debug';

const props = defineProps<{
  before: Uint8Array;
  after: Uint8Array;
}>();

const diff = computed(() => memoryHexDiff(props.before, props.after));
const rows = computed(() => diff.value.lines.filter((line) => line.kind === 'row'));

function cellClass(cell: MemoryHexCell): string {
  return cell.changed ? 'rounded-sm bg-primary/30 text-primary' : 'text-muted';
}
</script>

<template>
  <div class="overflow-auto rounded-lg bg-default ring-1 ring-default">
    <table class="w-max border-separate border-spacing-0 font-mono text-xs">
      <thead>
        <tr class="text-left text-muted">
          <th class="sticky top-0 bg-elevated px-3 py-2 font-medium">Address</th>
          <th class="sticky top-0 bg-elevated px-3 py-2 font-medium">First clone</th>
          <th class="sticky top-0 bg-elevated px-3 py-2 font-medium">Second clone</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="line in diff.lines" :key="`${line.kind}-${line.address}`">
          <template v-if="line.kind === 'gap'">
            <td class="px-3 py-1 text-muted" colspan="3">···</td>
          </template>
          <template v-else>
            <td class="px-3 py-0.5 align-top text-toned">{{ formatHexDiffAddress(line.address) }}</td>
            <td class="px-3 py-0.5 align-top whitespace-nowrap">
              <span v-for="(cell, index) in line.before" :key="`b-${index}`" class="mr-1 inline-block w-[2ch] text-center" :class="cellClass(cell)">{{ cell.text }}</span>
              <span class="ml-2">
                <span v-for="(cell, index) in line.before" :key="`ba-${index}`" :class="cellClass(cell)">{{ cell.ascii }}</span>
              </span>
            </td>
            <td class="px-3 py-0.5 align-top whitespace-nowrap">
              <span v-for="(cell, index) in line.after" :key="`a-${index}`" class="mr-1 inline-block w-[2ch] text-center" :class="cellClass(cell)">{{ cell.text }}</span>
              <span class="ml-2">
                <span v-for="(cell, index) in line.after" :key="`aa-${index}`" :class="cellClass(cell)">{{ cell.ascii }}</span>
              </span>
            </td>
          </template>
        </tr>
      </tbody>
    </table>
  </div>
  <p v-if="diff.omittedRows > 0" class="text-sm text-muted">
    Showing the first {{ rows.length }} changed rows. {{ diff.omittedRows }} more
    {{ diff.omittedRows === 1 ? 'row is' : 'rows are' }} omitted.
  </p>
</template>
