<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import type { TableColumn } from '@nuxt/ui';
import type { ChannelRow } from '~/composables/useRadio';

const { channels, memory } = useRadio();

const items = computed<TabsItem[]>(() => [
  { label: 'Channels', icon: 'i-lucide-list', slot: 'channels' as const, value: 'channels' },
  { label: 'Settings', icon: 'i-lucide-sliders-horizontal', slot: 'settings' as const, value: 'settings' },
  { label: 'Hex Dump', icon: 'i-lucide-binary', slot: 'hex' as const, value: 'hex' },
]);

const columns: TableColumn<ChannelRow>[] = [
  { accessorKey: 'channelNumber', header: '#' },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'transmit', header: 'TX' },
  { accessorKey: 'receive', header: 'RX' },
  { accessorKey: 'txTone', header: 'TX Tone' },
  { accessorKey: 'rxTone', header: 'RX Tone' },
  { accessorKey: 'toneType', header: 'Type' },
];

const hexMemory = computed(() => {
  if (!memory.value) {
    return undefined;
  }

  return {
    radioModel: 'baofeng-uv5r' as const,
    contents: memory.value,
  };
});
</script>

<template>
  <div class="flex h-full flex-col px-4 pb-4 pt-1">
    <UTabs
      color="primary"
      variant="link"
      default-value="channels"
      :items="items"
      class="flex min-h-0 flex-1 flex-col"
      :unmount-on-hide="false"
      :ui="{
        list: 'w-full gap-0.5 border-b border-default',
        trigger: 'grow-0 px-3 data-[state=inactive]:text-muted data-[state=active]:text-primary',
        leadingIcon: 'text-current',
        indicator: 'bg-primary h-0.5 rounded-full',
        content: 'min-h-0 flex-1 focus-visible:outline-none',
      }"
    >
      <template #channels>
        <div class="min-h-0 flex-1 overflow-auto pt-2">
          <UTable
            :data="channels"
            :columns="columns"
            sticky
            class="channel-table max-h-[calc(100vh-8rem)]"
            :ui="{
              thead: 'bg-default',
              th: 'h-8 px-2 py-0 text-sm font-medium bg-default',
              td: 'h-7 px-2 py-0 text-xs tabular-nums align-middle',
              tbody: 'divide-y-0',
              empty: 'py-4 text-center text-xs text-muted',
            }"
          />
        </div>
      </template>
      <template #settings>
        <p class="pt-4 text-sm text-muted">Radio settings will appear here after a radio is imported.</p>
      </template>
      <template #hex>
        <div class="min-h-0 flex-1 pt-4">
          <HexDump v-if="hexMemory" :memory="hexMemory" />
          <p v-else class="text-sm text-muted">No radio data</p>
        </div>
      </template>
    </UTabs>
  </div>
</template>
