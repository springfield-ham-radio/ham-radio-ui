<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import type { TableColumn, TableRow } from '@nuxt/ui';
import type { RadioChannel, RadioSettingValue } from '@springfield/ham-radio-api';
import {
  collectChannelMemoryMapUiFields,
  formatMemoryMapFieldValue,
  type RadioMemoryMapUiField,
} from '@springfield/ham-radio-utils';
import { h, resolveComponent } from 'vue';
import type { ChannelRow } from '~/composables/useRadio';
import { snifferPacketToHex } from '~/utils/sniffer-api';
import { snifferPacketsFromSerialLog } from '~/utils/sniffer-capture';
import { bandNameForFrequency } from '~/utils/transmit-privileges';

const UCheckbox = resolveComponent('UCheckbox');

const { channels, memory, program, settingsMemoryMap, activeRadioId, serialLog, updateSettings, updateChannel, saveSerialLog } =
  useRadio();
const { getTransmitPrivilegeWarning, privilegeLicenseLabel, hasPrivilegeContext } = useOperatorLicense();
const { saveChannels } = useSavedChannels();

interface DisplayChannelRow extends ChannelRow {
  privilegeWarning?: ReturnType<typeof getTransmitPrivilegeWarning>;
  band: string;
  /** Formatted memory-map channel extras keyed by field id. */
  extras: Record<string, string>;
}

const items = computed<TabsItem[]>(() => [
  { label: 'Channels', icon: 'i-lucide-list', slot: 'channels' as const, value: 'channels' },
  { label: 'Settings', icon: 'i-lucide-sliders-horizontal', slot: 'settings' as const, value: 'settings' },
  { label: 'Driver', icon: 'i-lucide-cable', slot: 'driver' as const, value: 'driver' },
  { label: 'Hex Dump', icon: 'i-lucide-binary', slot: 'hex' as const, value: 'hex' },
  { label: 'Debug', icon: 'i-lucide-bug', slot: 'debug' as const, value: 'debug' },
  { label: 'Sniffer', icon: 'i-lucide-audio-lines', slot: 'sniffer' as const, value: 'sniffer' },
]);

const activeTab = ref('channels');

const channelUiFields = computed<RadioMemoryMapUiField[]>(() => {
  if (!settingsMemoryMap.value) {
    return [];
  }

  return collectChannelMemoryMapUiFields(settingsMemoryMap.value);
});

const displayChannels = computed<DisplayChannelRow[]>(() => {
  return channels.value.map((channel) => {
    const extras: Record<string, string> = {};

    for (const field of channelUiFields.value) {
      const raw = channel.settings?.[field.fieldId] as RadioSettingValue | undefined;
      extras[field.fieldId] = formatMemoryMapFieldValue(raw, field);
    }

    return {
      ...channel,
      privilegeWarning: getTransmitPrivilegeWarning(channel.transmitFrequencyHz),
      band: bandNameForFrequency(channel.transmitFrequencyHz),
      extras,
    };
  });
});

const rowSelection = ref<Record<string, boolean>>({});
const isSavingToLibrary = ref(false);

const selectedChannelNumbers = computed(() => {
  return Object.entries(rowSelection.value)
    .filter(([, selected]) => selected)
    .map(([key]) => Number(key))
    .filter((channelNumber) => Number.isFinite(channelNumber));
});

const selectedCount = computed(() => selectedChannelNumbers.value.length);

const columns = computed<TableColumn<DisplayChannelRow>[]>(() => {
  const core: TableColumn<DisplayChannelRow>[] = [
    {
      id: 'select',
      header: ({ table }) =>
        h(UCheckbox, {
          modelValue: table.getIsSomePageRowsSelected() ? 'indeterminate' : table.getIsAllPageRowsSelected(),
          'onUpdate:modelValue': (value: boolean | 'indeterminate') => {
            table.toggleAllPageRowsSelected(!!value);
          },
          'aria-label': 'Select all channels',
          onClick: (event: Event) => {
            event.stopPropagation();
          },
        }),
      cell: ({ row }) =>
        h(UCheckbox, {
          modelValue: row.getIsSelected(),
          'onUpdate:modelValue': (value: boolean | 'indeterminate') => {
            row.toggleSelected(!!value);
          },
          'aria-label': `Select channel ${row.original.channelNumber}`,
          onClick: (event: Event) => {
            event.stopPropagation();
          },
        }),
    },
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

  const dynamic: TableColumn<DisplayChannelRow>[] = channelUiFields.value.map((field) => ({
    id: field.fieldId,
    header: field.ui.label,
    accessorFn: (row) => row.extras[field.fieldId] ?? '',
  }));

  return [
    ...core,
    ...dynamic,
    {
      id: 'edit',
      header: '',
    },
  ];
});

const editorOpen = ref(false);
const editingChannelNumber = ref<number | undefined>();

const editingChannel = computed(() => {
  return program.value?.channels.find((channel) => channel.channelNumber === editingChannelNumber.value);
});

function openChannelEditor(channelNumber: number): void {
  editingChannelNumber.value = channelNumber;
  editorOpen.value = true;
}

function onSelectChannel(event: Event, row: TableRow<DisplayChannelRow>): void {
  const target = event.target;

  if (target instanceof Element && target.closest('button, input, [role="checkbox"]')) {
    return;
  }

  openChannelEditor(row.original.channelNumber);
}

function onChannelPatch(patch: Parameters<typeof updateChannel>[1]): void {
  if (editingChannelNumber.value === undefined) {
    return;
  }

  void updateChannel(editingChannelNumber.value, patch);
}

function portableChannelFromMemory(channelNumber: number): RadioChannel | undefined {
  const programmed = program.value?.channels.find((channel) => channel.channelNumber === channelNumber);

  if (!programmed || typeof programmed.radioChannel === 'string') {
    return undefined;
  }

  return {
    name: programmed.radioChannel.name,
    transmitFrequency: programmed.radioChannel.transmitFrequency,
    receiveFrequency: programmed.radioChannel.receiveFrequency,
    transmitTone: programmed.radioChannel.transmitTone,
    receiveTone: programmed.radioChannel.receiveTone,
  };
}

async function saveSelectedToLibrary(): Promise<void> {
  const portableChannels = selectedChannelNumbers.value
    .map((channelNumber) => portableChannelFromMemory(channelNumber))
    .filter((channel): channel is RadioChannel => channel !== undefined);

  if (portableChannels.length === 0) {
    return;
  }

  isSavingToLibrary.value = true;

  try {
    await saveChannels(portableChannels);
    rowSelection.value = {};
  } catch {
    // Toast is shown by useSavedChannels.
  } finally {
    isSavingToLibrary.value = false;
  }
}

const outOfClassCount = computed(() => displayChannels.value.filter((channel) => channel.privilegeWarning).length);

const hexMemory = computed(() => {
  if (!memory.value || !activeRadioId.value) {
    return undefined;
  }

  return {
    radioModel: activeRadioId.value.model,
    contents: memory.value,
  };
});

const debugPackets = computed(() => snifferPacketsFromSerialLog(serialLog.value?.log));

const debugSummary = computed(() => {
  if (!serialLog.value) {
    return 'Serial traffic from the last import or write appears here.';
  }

  const label = serialLog.value.operation === 'write' ? 'Wrote to radio' : 'Imported from radio';
  const frames = serialLog.value.entryCount;
  return `${label} · ${frames} frame${frames === 1 ? '' : 's'}`;
});

const savingSerialLog = ref(false);

async function onSaveSerialLog(): Promise<void> {
  savingSerialLog.value = true;

  try {
    await saveSerialLog();
  } finally {
    savingSerialLog.value = false;
  }
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden px-4 pb-4 pt-1">
    <UTabs
      v-model="activeTab"
      color="primary"
      variant="link"
      :items="items"
      class="flex min-h-0 flex-1 flex-col overflow-hidden"
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
        <RadioMemoryEmpty v-if="!activeRadioId" />
        <div v-else class="flex min-h-0 flex-1 flex-col overflow-hidden pt-2">
          <div class="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
            <div class="min-w-0">
              <p v-if="hasPrivilegeContext && outOfClassCount > 0" class="text-xs text-warning">
                {{ outOfClassCount }} channel{{ outOfClassCount === 1 ? '' : 's' }} have transmit frequencies outside your
                {{ privilegeLicenseLabel }} privileges.
              </p>
              <p v-else-if="!hasPrivilegeContext && channels.length > 0" class="text-xs text-muted">
                Set your amateur or GMRS call sign in Preferences to flag channels outside your license privileges.
              </p>
            </div>
            <UButton
              icon="i-lucide-bookmark"
              color="primary"
              variant="soft"
              size="sm"
              label="Save to library"
              :disabled="selectedCount === 0 || isSavingToLibrary"
              :loading="isSavingToLibrary"
              @click="saveSelectedToLibrary"
            />
          </div>
          <div class="min-h-0 flex-1 overflow-hidden">
            <UTable
              v-model:row-selection="rowSelection"
              :data="displayChannels"
              :columns="columns"
              :get-row-id="(row) => String(row.channelNumber)"
              sticky
              class="channel-table h-full"
              :ui="{
                thead: 'bg-default',
                th: 'h-8 px-2 py-0 text-sm font-medium bg-default',
                td: 'h-7 px-2 py-0 text-xs tabular-nums align-middle',
                tbody: 'divide-y-0',
                empty: 'py-4 text-center text-xs text-muted',
              }"
              empty="No channels in this memory."
              @select="onSelectChannel"
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
              <template #edit-cell="{ row }">
                <UButton
                  icon="i-lucide-pencil"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  aria-label="Edit channel"
                  @click.stop="openChannelEditor(row.original.channelNumber)"
                />
              </template>
            </UTable>
          </div>
          <p class="mt-2 shrink-0 text-xs text-muted">
            Select channels and choose Save to library to store portable name, frequencies, and tones. Click a row to edit
            the loaded memory.
          </p>
        </div>
      </template>
      <template #settings>
        <RadioMemoryEmpty v-if="!activeRadioId" />
        <div v-else class="min-h-0 flex-1 overflow-y-auto pt-2">
          <RadioSettingsForm
            v-if="settingsMemoryMap && program"
            :memory-map="settingsMemoryMap"
            :settings="program.settings"
            @update:settings="updateSettings"
          />
          <p v-else class="pt-2 text-sm text-muted">This radio has no settings to display.</p>
        </div>
      </template>
      <template #driver>
        <RadioDriver />
      </template>
      <template #hex>
        <RadioMemoryEmpty v-if="!activeRadioId" />
        <div v-else class="flex min-h-0 flex-1 flex-col overflow-hidden">
          <RadioHexDump v-if="hexMemory && activeTab === 'hex'" :memory="hexMemory" />
          <p v-else-if="!hexMemory" class="pt-2 text-sm text-muted">No radio data</p>
        </div>
      </template>
      <template #debug>
        <RadioMemoryEmpty v-if="!activeRadioId && debugPackets.length === 0" />
        <div v-else class="flex min-h-0 flex-1 flex-col overflow-hidden pt-2">
          <div class="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
            <p class="min-w-0 text-xs text-muted">{{ debugSummary }}</p>
            <UButton
              icon="i-lucide-file-text"
              color="neutral"
              variant="outline"
              size="sm"
              label="Save serial log"
              :disabled="!serialLog || savingSerialLog"
              :loading="savingSerialLog"
              @click="onSaveSerialLog"
            />
          </div>
          <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
            <div class="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-xs leading-6">
              <p v-if="debugPackets.length === 0" class="text-muted">
                Import from or write to a radio to capture serial traffic.
              </p>
              <div v-for="packet in debugPackets" :key="packet.id" class="flex gap-3 whitespace-nowrap">
                <span class="text-muted">{{ packet.timestamp }}</span>
                <span :class="packet.direction === 'COMPUTER->RADIO' ? 'text-warning' : 'text-success'">
                  {{ packet.direction }}
                </span>
                <span class="text-highlighted">{{ snifferPacketToHex(packet.data) }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
      <template #sniffer>
        <RadioSniffer v-if="activeTab === 'sniffer'" />
      </template>
    </UTabs>
    <RadioChannelEditor
      v-model:open="editorOpen"
      :channel="editingChannel"
      :memory-map="settingsMemoryMap"
      @update:channel="onChannelPatch"
    />
  </div>
</template>
