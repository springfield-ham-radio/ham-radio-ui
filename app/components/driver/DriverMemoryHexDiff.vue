<script setup lang="ts">
import {
  formatHexDiffAddress,
  listMemoryHexDiffItems,
  memoryHexDiffCells,
  type MemoryHexCell,
} from '~/utils/driver-debug';
import { useFixedVirtualRows } from '~/composables/useFixedVirtualRows';

const props = withDefaults(
  defineProps<{
    before: Uint8Array;
    after: Uint8Array;
    beforeLabel?: string;
    afterLabel?: string;
  }>(),
  {
    beforeLabel: 'First clone',
    afterLabel: 'Second clone',
  },
);

const ROW_HEIGHT_PX = 20;

const items = computed(() => listMemoryHexDiffItems(props.before, props.after));
const scroller = useTemplateRef<HTMLElement>('scroller');
const { virtualRows, paddingTop, paddingBottom } = useFixedVirtualRows(
  computed(() => items.value.length),
  scroller,
  ROW_HEIGHT_PX,
);

const paintedRows = computed(() => {
  return virtualRows.value.map((virtualRow) => {
    const item = items.value[virtualRow.index];

    if (!item || item.kind === 'gap') {
      return { key: virtualRow.key, kind: 'gap' as const, address: item?.address ?? 0, before: [], after: [] };
    }

    const cells = memoryHexDiffCells(props.before, props.after, item.address);

    return { key: virtualRow.key, kind: 'row' as const, address: item.address, ...cells };
  });
});

function cellClass(cell: MemoryHexCell): string {
  return cell.changed ? 'rounded-sm bg-primary/30 text-primary' : 'text-muted';
}
</script>

<template>
  <div class="overflow-hidden rounded-lg bg-default ring-1 ring-default">
    <div class="flex border-b border-default bg-elevated px-3 py-2 font-mono text-xs text-muted">
      <div class="w-20 shrink-0 font-medium">Address</div>
      <div class="min-w-0 flex-1 font-medium">{{ beforeLabel }}</div>
      <div class="min-w-0 flex-1 font-medium">{{ afterLabel }}</div>
    </div>
    <div ref="scroller" class="max-h-[min(30rem,65vh)] overflow-auto font-mono text-xs">
      <div :style="{ paddingTop: `${paddingTop}px`, paddingBottom: `${paddingBottom}px` }">
        <div v-for="row in paintedRows" :key="row.key" class="flex h-5 items-center px-3">
          <template v-if="row.kind === 'gap'">
            <span class="text-muted">···</span>
          </template>
          <template v-else>
            <div class="w-20 shrink-0 text-toned">{{ formatHexDiffAddress(row.address) }}</div>
            <div class="min-w-0 flex-1 whitespace-nowrap">
              <span
                v-for="(cell, index) in row.before"
                :key="`b-${index}`"
                class="mr-1 inline-block w-[2ch] text-center"
                :class="cellClass(cell)"
              >{{ cell.text }}</span>
              <span class="ml-2">
                <span v-for="(cell, index) in row.before" :key="`ba-${index}`" :class="cellClass(cell)">{{
                  cell.ascii
                }}</span>
              </span>
            </div>
            <div class="min-w-0 flex-1 whitespace-nowrap">
              <span
                v-for="(cell, index) in row.after"
                :key="`a-${index}`"
                class="mr-1 inline-block w-[2ch] text-center"
                :class="cellClass(cell)"
              >{{ cell.text }}</span>
              <span class="ml-2">
                <span v-for="(cell, index) in row.after" :key="`aa-${index}`" :class="cellClass(cell)">{{
                  cell.ascii
                }}</span>
              </span>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
