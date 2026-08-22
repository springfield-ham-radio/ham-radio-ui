<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import type { TableColumn } from '@nuxt/ui';
import type { ChannelRow } from '~/composables/useRadio';
import { bandNameForFrequency } from '~/utils/transmit-privileges';

const { channels, memory, program, settingsMemoryMap, updateSettings } = useRadio();
const { getTransmitPrivilegeWarning, privilegeLicenseLabel, hasPrivilegeContext } = useOperatorLicense();

interface DisplayChannelRow extends ChannelRow {
  privilegeWarning?: ReturnType<typeof getTransmitPrivilegeWarning>;
  band: string;
}

const items = computed<TabsItem[]>(() => [
  { label: 'Channels', icon: 'i-lucide-list', slot: 'channels' as const, value: 'channels' },
  { label: 'Settings', icon: 'i-lucide-sliders-horizontal', slot: 'settings' as const, value: 'settings' },
  { label: 'Hex Dump', icon: 'i-lucide-binary', slot: 'hex' as const, value: 'hex' },
]);

const displayChannels = computed<DisplayChannelRow[]>(() => {
  return channels.value.map((channel) => ({
    ...channel,
    privilegeWarning: getTransmitPrivilegeWarning(channel.transmitFrequencyHz),
    band: bandNameForFrequency(channel.transmitFrequencyHz),
  }));
});

const columns: TableColumn<DisplayChannelRow>[] = [
  {
    id: 'privilege',
    header: '',
  },
  { accessorKey: 'channelNumber', header: '#' },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'band', header: 'Band' },
  { accessorKey: 'transmit', header: 'TX' },
  { accessorKey: 'receive', header: 'RX' },
  { accessorKey: 'txTone', header: 'TX Tone' },
  { accessorKey: 'rxTone', header: 'RX Tone' },
  { accessorKey: 'toneType', header: 'Type' },
];

const outOfClassCount = computed(() => displayChannels.value.filter((channel) => channel.privilegeWarning).length);

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
        list: 'w-full shrink-0 gap-0.5 border-b border-default',
        trigger: 'grow-0 px-3 data-[state=inactive]:text-muted data-[state=active]:text-primary',
        leadingIcon: 'text-current',
        indicator: 'bg-primary h-0.5 rounded-full',
        content: 'flex min-h-0 flex-1 flex-col overflow-hidden focus-visible:outline-none',
      }"
    >
      <template #channels>
        <div class="min-h-0 flex-1 overflow-auto pt-2">
          <p v-if="hasPrivilegeContext && outOfClassCount > 0" class="mb-2 text-xs text-warning">
            {{ outOfClassCount }} channel{{ outOfClassCount === 1 ? '' : 's' }} have transmit frequencies outside your
            {{ privilegeLicenseLabel }} privileges.
          </p>
          <p v-else-if="!hasPrivilegeContext && channels.length > 0" class="mb-2 text-xs text-muted">
            Set your amateur or GMRS call sign in Preferences to flag channels outside your license privileges.
          </p>
          <UTable
            :data="displayChannels"
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
          >
            <template #privilege-cell="{ row }">
              <UTooltip
                v-if="row.original.privilegeWarning"
                :delay-duration="200"
                :content="{ side: 'right', align: 'center', sideOffset: 10 }"
                :ui="{
                  content:
                    'h-auto max-w-72 flex-col items-start gap-1 bg-elevated px-3 py-2.5 text-xs text-highlighted shadow-lg ring ring-default',
                }"
              >
                <UIcon name="i-lucide-triangle-alert" class="size-3.5 text-warning" />
                <template #content>
                  <p class="font-medium text-highlighted">{{ row.original.privilegeWarning.title }}</p>
                  <p class="text-toned">{{ row.original.privilegeWarning.bandLabel }}</p>
                  <p class="whitespace-normal text-pretty text-highlighted">{{ row.original.privilegeWarning.detail }}</p>
                </template>
              </UTooltip>
            </template>
          </UTable>
        </div>
      </template>
      <template #settings>
        <div class="min-h-0 flex-1 overflow-y-auto pt-2">
          <RadioSettingsForm
            v-if="settingsMemoryMap && program"
            :memory-map="settingsMemoryMap"
            :settings="program.settings"
            @update:settings="updateSettings"
          />
          <p v-else class="pt-2 text-sm text-muted">Radio settings will appear here after a radio is imported.</p>
        </div>
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
