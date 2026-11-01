<script setup lang="ts">
import { snifferPacketToHex, type SnifferPacket } from '~/utils/sniffer-api';
import { useFixedVirtualRows } from '~/composables/useFixedVirtualRows';

const props = defineProps<{
  packets: SnifferPacket[];
  empty: string;
}>();

/** Matches `h-6` / `leading-6`. */
const ROW_HEIGHT_PX = 24;

const scroller = useTemplateRef<HTMLElement>('scroller');
const packetCount = computed(() => props.packets.length);

const { virtualRows, paddingTop, paddingBottom } = useFixedVirtualRows(packetCount, scroller, ROW_HEIGHT_PX, 12);

const contentMinWidth = computed(() => {
  let maxBytes = 0;

  for (const packet of props.packets) {
    if (packet.data.length > maxBytes) {
      maxBytes = packet.data.length;
    }
  }

  // Timestamp, direction, and `XX ` per byte. Keeps the horizontal range stable
  // while only the visible rows are mounted.
  return `${maxBytes * 3 + 36}ch`;
});
</script>

<template>
  <div ref="scroller" class="min-h-0 flex-1 overflow-auto px-4 font-mono text-xs leading-6">
    <p v-if="packets.length === 0" class="py-3 text-muted">{{ empty }}</p>
    <div
      v-else
      class="w-max min-w-full"
      :style="{
        paddingTop: `${paddingTop}px`,
        paddingBottom: `${paddingBottom}px`,
        minWidth: contentMinWidth,
      }"
    >
      <div
        v-for="virtualRow in virtualRows"
        :key="virtualRow.key"
        class="flex h-6 gap-3 whitespace-nowrap"
        :data-packet-index="virtualRow.index"
      >
        <template v-if="packets[virtualRow.index]">
          <span class="text-muted">{{ packets[virtualRow.index]!.timestamp }}</span>
          <span :class="packets[virtualRow.index]!.direction === 'COMPUTER->RADIO' ? 'text-warning' : 'text-success'">
            {{ packets[virtualRow.index]!.direction }}
          </span>
          <span class="text-highlighted">{{ snifferPacketToHex(packets[virtualRow.index]!.data) }}</span>
          <span v-if="packets[virtualRow.index]!.description" class="text-muted">
            {{ packets[virtualRow.index]!.description }}
          </span>
        </template>
      </div>
    </div>
  </div>
</template>
