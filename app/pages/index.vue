<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import type { TableColumn, TableRow } from '@nuxt/ui';
import type { RadioChannel, RadioProgrammedChannel, RadioSettingValue } from '@springfield/ham-radio-api';
import {
  collectChannelMemoryMapUiFields,
  formatMemoryMapFieldValue,
  type RadioMemoryMapUiField,
} from '@springfield/ham-radio-utils';
import { insertNodeAt, removeNode, useSortable } from '@vueuse/integrations/useSortable';
import { h, resolveComponent } from 'vue';
import type { ChannelRow } from '~/composables/useRadio';
import { extraChannelTableFields } from '~/utils/channel-table';
import { channelCapacity, nextAvailableChannelNumber } from '~/utils/channel-edit';
import { snifferPacketToHex } from '~/utils/sniffer-api';
import { snifferPacketsFromSerialLog } from '~/utils/sniffer-capture';
import { bandNameForFrequency } from '~/utils/transmit-privileges';

const UCheckbox = resolveComponent('UCheckbox');

const {
  channels,
  configurations,
  memory,
  program,
  settingsMemoryMap,
  activeRadioId,
  serialLog,
  importOpen,
  updateSettings,
  updateChannel,
  addChannel,
  reorderChannels,
  removeChannels,
  saveSerialLog,
  openWriteToRadio,
  openMemoryFile,
  saveMemoryFile,
} = useRadio();
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
      id: 'drag',
      header: '',
      meta: {
        class: {
          th: 'w-6 px-1',
          td: 'w-6 px-1',
        },
      },
    },
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
    { id: 'bandName', accessorKey: 'band', header: 'Band' },
    { accessorKey: 'transmit', header: 'TX' },
    { accessorKey: 'receive', header: 'RX' },
    { accessorKey: 'txTone', header: 'TX Tone' },
    { accessorKey: 'rxTone', header: 'RX Tone' },
    { accessorKey: 'toneType', header: 'Type' },
  ];

  const dynamic: TableColumn<DisplayChannelRow>[] = extraChannelTableFields(channelUiFields.value).map((field) => ({
    id: field.fieldId,
    header: field.ui.label,
    accessorFn: (row) => row.extras[field.fieldId] ?? '',
  }));

  return [
    ...core,
    ...dynamic,
    {
      id: 'actions',
      header: '',
    },
  ];
});

const editorOpen = ref(false);
const editingChannelNumber = ref<number | undefined>();
const removeOpen = ref(false);
const pendingRemoveNumbers = ref<number[]>([]);
const isReorderingChannels = ref(false);
const sortableRows = ref<DisplayChannelRow[]>([]);

const occupiedChannelNumbers = computed(() => program.value?.channels.map((channel) => channel.channelNumber) ?? []);
const radioChannelCapacity = computed(() => channelCapacity(settingsMemoryMap.value));
const nextFreeChannelNumber = computed(() =>
  nextAvailableChannelNumber(occupiedChannelNumbers.value, radioChannelCapacity.value),
);
const canAddChannel = computed(() => {
  return Boolean(program.value && memory.value && activeRadioId.value && nextFreeChannelNumber.value !== undefined);
});
const hasLoadedMemory = computed(() => Boolean(memory.value && activeRadioId.value));
const canWriteMemory = computed(() => {
  if (!hasLoadedMemory.value || !activeRadioId.value) {
    return false;
  }

  const config = configurations.value.find((item) => item.id.model === activeRadioId.value?.model);
  return Boolean(config?.writeMemory);
});
const writeMemoryTooltip = computed(() => {
  if (!hasLoadedMemory.value) {
    return 'Open a memory file or import from a radio first';
  }

  if (!canWriteMemory.value) {
    return `${activeRadioId.value?.name ?? 'This radio'} does not support writing memory`;
  }

  return 'Write to Radio';
});
const saveMemoryTooltip = computed(() => {
  return hasLoadedMemory.value ? 'Save' : 'Open a memory file or import from a radio first';
});
const addChannelTooltip = computed(() => {
  if (!program.value || !memory.value) {
    return 'Open a memory file or import from a radio first';
  }

  if (nextFreeChannelNumber.value === undefined) {
    return 'All memory slots are programmed';
  }

  return 'Add a memory channel';
});

const editingChannel = computed(() => {
  if (editingChannelNumber.value === undefined) {
    return undefined;
  }

  return program.value?.channels.find((channel) => channel.channelNumber === editingChannelNumber.value);
});

const removeTitle = computed(() =>
  pendingRemoveNumbers.value.length === 1 ? 'Remove channel' : 'Remove channels',
);

const removeDescription = computed(() => {
  const numbers = pendingRemoveNumbers.value;

  if (numbers.length === 1) {
    const programmed = program.value?.channels.find((channel) => channel.channelNumber === numbers[0]);
    const label =
      programmed && typeof programmed.radioChannel === 'object' && programmed.radioChannel.name
        ? `${numbers[0]} (${programmed.radioChannel.name})`
        : String(numbers[0]);
    return `Clear memory slot ${label} from the loaded image? Write to the radio to apply the change on the device.`;
  }

  return `Clear ${numbers.length} selected memory slots from the loaded image? Write to the radio to apply the change on the device.`;
});

function openChannelEditor(channelNumber: number): void {
  editingChannelNumber.value = channelNumber;
  editorOpen.value = true;
}

function openAddChannel(): void {
  editingChannelNumber.value = undefined;
  editorOpen.value = true;
}

function isChannelTableRow(value: unknown): value is TableRow<DisplayChannelRow> {
  return typeof value === 'object' && value !== null && 'original' in value && typeof (value as TableRow<DisplayChannelRow>).original?.channelNumber === 'number';
}

function onSelectChannel(first: unknown, second?: unknown): void {
  if (isReorderingChannels.value) {
    return;
  }

  const row = [first, second].find(isChannelTableRow);
  const event = [first, second].find((value): value is Event => value instanceof Event);
  const target = event?.target;

  if (target instanceof Element && target.closest('button, input, [role="checkbox"], .channel-drag-handle')) {
    return;
  }

  if (row) {
    openChannelEditor(row.original.channelNumber);
  }
}

async function applyChannelReorder(fromIndex: number, toIndex: number): Promise<void> {
  const mapping = await reorderChannels(fromIndex, toIndex);
  const previous = editingChannelNumber.value;

  if (previous !== undefined) {
    editingChannelNumber.value = mapping.get(previous) ?? previous;
  }
}

const { start: startChannelSortable, stop: stopChannelSortable } = useSortable('.channel-table-tbody', sortableRows, {
  animation: 150,
  draggable: 'tr',
  handle: '.channel-drag-handle',
  ghostClass: 'channel-row-ghost',
  chosenClass: 'channel-row-chosen',
  forceFallback: true,
  onStart() {
    isReorderingChannels.value = true;
  },
  onUpdate(event) {
    const fromIndex = event.oldIndex;
    const toIndex = event.newIndex;

    if (fromIndex === undefined || toIndex === undefined || fromIndex === toIndex) {
      return;
    }

    if (event.item && event.from) {
      removeNode(event.item);
      insertNodeAt(event.from, event.item, fromIndex);
    }

    void applyChannelReorder(fromIndex, toIndex);
  },
  onEnd() {
    window.setTimeout(() => {
      isReorderingChannels.value = false;
    }, 0);
  },
});

watch(
  () => [activeRadioId.value, displayChannels.value.length] as const,
  async () => {
    stopChannelSortable();
    await nextTick();
    startChannelSortable();
  },
);

function onChannelPatch(patch: Parameters<typeof updateChannel>[1]): void {
  if (editingChannelNumber.value === undefined) {
    return;
  }

  void updateChannel(editingChannelNumber.value, patch);
}

function onCreateChannel(programmed: RadioProgrammedChannel): void {
  void addChannel(programmed);
}

function requestRemoveChannel(channelNumber: number): void {
  pendingRemoveNumbers.value = [channelNumber];
  removeOpen.value = true;
}

function requestRemoveSelected(): void {
  pendingRemoveNumbers.value = selectedChannelNumbers.value;
  removeOpen.value = true;
}

function confirmRemove(): void {
  const numbers = pendingRemoveNumbers.value;

  if (editingChannelNumber.value !== undefined && numbers.includes(editingChannelNumber.value)) {
    editorOpen.value = false;
    editingChannelNumber.value = undefined;
  }

  void removeChannels(numbers);
  rowSelection.value = {};
  removeOpen.value = false;
  pendingRemoveNumbers.value = [];
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
        list: 'w-full shrink-0 items-center gap-0.5 border-b border-default',
        trigger: 'grow-0 px-3 data-[state=inactive]:text-muted data-[state=active]:text-primary',
        leadingIcon: 'text-current',
        indicator: 'bg-primary h-0.5 rounded-full',
        content: 'flex min-h-0 flex-1 flex-col overflow-hidden focus-visible:outline-none',
      }"
    >
      <template #list-trailing>
        <div class="ml-auto flex shrink-0 items-center gap-1.5 ps-2">
          <UTooltip text="Open Memory">
            <UButton
              icon="i-lucide-folder-open"
              color="neutral"
              variant="outline"
              size="sm"
              aria-label="Open Memory"
              @click="openMemoryFile"
            />
          </UTooltip>
          <UTooltip :text="saveMemoryTooltip">
            <span class="inline-flex">
              <UButton
                icon="i-lucide-save"
                color="neutral"
                variant="outline"
                size="sm"
                :disabled="!hasLoadedMemory"
                aria-label="Save"
                @click="saveMemoryFile"
              />
            </span>
          </UTooltip>
          <USeparator orientation="vertical" class="h-5" />
          <UTooltip text="Import from Radio">
            <UButton
              icon="i-lucide-download"
              color="neutral"
              variant="outline"
              size="sm"
              aria-label="Import from Radio"
              @click="importOpen = true"
            />
          </UTooltip>
          <UTooltip :text="writeMemoryTooltip">
            <span class="inline-flex">
              <UButton
                icon="i-lucide-upload"
                color="neutral"
                variant="outline"
                size="sm"
                :disabled="!canWriteMemory"
                aria-label="Write to Radio"
                @click="openWriteToRadio"
              />
            </span>
          </UTooltip>
        </div>
      </template>
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
            <div class="flex shrink-0 items-center gap-1.5">
              <UTooltip :text="addChannelTooltip" :disabled="canAddChannel">
                <span class="inline-flex">
                  <UButton
                    icon="i-lucide-plus"
                    color="primary"
                    size="sm"
                    label="Add channel"
                    :disabled="!canAddChannel"
                    @click="openAddChannel"
                  />
                </span>
              </UTooltip>
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="soft"
                size="sm"
                label="Remove"
                :disabled="selectedCount === 0"
                @click="requestRemoveSelected"
              />
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
                tbody: 'channel-table-tbody divide-y-0',
                empty: 'py-4 text-center text-xs text-muted',
              }"
              empty="No channels in this memory."
              @select="onSelectChannel"
            >
              <template #drag-cell>
                <span
                  class="channel-drag-handle inline-flex text-muted"
                  aria-label="Drag to reorder channel"
                  @click.stop
                >
                  <UIcon name="i-lucide-grip-vertical" class="pointer-events-none size-3.5" />
                </span>
              </template>
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
              <template #actions-cell="{ row }">
                <div class="flex items-center justify-end gap-0.5" @click.stop>
                  <UButton
                    icon="i-lucide-pencil"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    aria-label="Edit channel"
                    @click="openChannelEditor(row.original.channelNumber)"
                  />
                  <UButton
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="ghost"
                    size="xs"
                    aria-label="Remove channel"
                    @click="requestRemoveChannel(row.original.channelNumber)"
                  />
                </div>
              </template>
            </UTable>
          </div>
          <p class="mt-2 shrink-0 text-xs text-muted">
            Drag the handle to move a channel into another occupied memory slot. Empty slots stay empty. Select
            channels to save them to the library or remove them from this radio. Add a channel to the next unused
            memory slot, or select saved channels on the Channels page and choose Add to radio. Click a row to edit
            the loaded memory.
          </p>
        </div>
      </template>
      <template #settings>
        <RadioMemoryEmpty v-if="!activeRadioId" />
        <div v-else class="flex min-h-0 flex-1 flex-col overflow-hidden pt-2">
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
      :occupied-channel-numbers="occupiedChannelNumbers"
      :channel-capacity="radioChannelCapacity"
      @update:channel="onChannelPatch"
      @create="onCreateChannel"
    />
    <UModal
      v-model:open="removeOpen"
      :title="removeTitle"
      :description="removeDescription"
      :ui="{ footer: 'justify-end' }"
    >
      <template #footer="{ close }">
        <UButton color="neutral" variant="outline" label="Cancel" @click="close" />
        <UButton color="error" label="Remove" @click="confirmRemove" />
      </template>
    </UModal>
  </div>
</template>
