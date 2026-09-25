<script setup lang="ts">
import type { RadioChannel } from '@springfield/ham-radio-api';
import type { TableColumn, TableRow } from '@nuxt/ui';
import { h, resolveComponent } from 'vue';
import { formatFrequencyMHz, programLibraryChannelsIntoSlots } from '~/utils/channel-edit';
import { formatSavedTone, type RepeaterUse, type SavedChannel } from '~/utils/saved-channels-db';
import { bandNameForFrequency } from '~/utils/transmit-privileges';

useHead({ title: 'Channels' });

const UCheckbox = resolveComponent('UCheckbox');

const {
  filteredChannels,
  isLoading,
  error,
  search,
  refresh,
  createChannel,
  updateChannel,
  removeChannel,
  removeChannels,
  groups,
  activeGroupId,
  activeGroup,
  exportLibraryCsv,
  importLibraryCsv,
  createGroup,
  renameGroup,
  removeGroup,
} = useSavedChannels();
const { addChannels, addTargets } = useRadio();
const { focusedCardId } = useRadioBoard();

const isExporting = ref(false);
const isImporting = ref(false);
const isAddingToRadio = ref(false);
const editorOpen = ref(false);
const editingChannel = ref<SavedChannel | undefined>();
const addToRadioOpen = ref(false);
const rowSelection = ref<Record<string, boolean>>({});
const groupNameOpen = shallowRef(false);
const groupNameMode = shallowRef<'empty' | 'selection' | 'rename'>('empty');
const isSavingGroup = shallowRef(false);
const removeGroupOpen = shallowRef(false);
const isRemovingGroup = shallowRef(false);
const deleteChannelsOpen = shallowRef(false);
const isDeletingChannels = shallowRef(false);

interface DisplaySavedChannel extends SavedChannel {
  band: string;
}

const displayChannels = computed<DisplaySavedChannel[]>(() => {
  return filteredChannels.value.map((channel) => ({
    ...channel,
    band: bandNameForFrequency(channel.transmitFrequency),
  }));
});

const selectedLibraryChannels = computed(() => {
  const selected = new Set(
    Object.entries(rowSelection.value)
      .filter(([, isSelected]) => isSelected)
      .map(([id]) => id),
  );

  return displayChannels.value.filter((channel) => selected.has(String(channel.id)));
});

const selectedCount = computed(() => selectedLibraryChannels.value.length);
const radiosWithRoom = computed(() =>
  addTargets.value.filter((target) => target.ready && target.freeSlotNumbers.length > 0),
);
const canAddToRadio = computed(() => selectedCount.value > 0 && radiosWithRoom.value.length > 0);

const addToRadioTooltip = computed(() => {
  if (selectedCount.value === 0) {
    return 'Select saved channels to add';
  }

  if (addTargets.value.length === 0) {
    return 'Open a radio and load its memory first';
  }

  if (!addTargets.value.some((target) => target.ready)) {
    return 'Open a memory file or import from a radio first';
  }

  if (radiosWithRoom.value.length === 0) {
    return 'All memory slots on open radios are programmed';
  }

  return 'Add selected channels to a radio';
});

const newGroupTooltip = computed(() =>
  selectedCount.value === 0 ? 'Select one or more channels' : 'Create a group from the selected channels',
);
const deleteChannelsTooltip = computed(() =>
  selectedCount.value === 0 ? 'Select channels to delete' : 'Delete the selected channels from the library',
);
const deleteChannelsDescription = computed(() => {
  const count = selectedCount.value;

  if (count === 1) {
    return 'Delete this channel from the library? It is also removed from every group.';
  }

  return `Delete ${count} channels from the library? They are also removed from every group.`;
});
const importTooltip = computed(() =>
  activeGroup.value ? `Import CSV into ${activeGroup.value.name}` : 'Import channel library, RepeaterBook, or CHIRP CSV',
);
const emptyMessage = computed(() =>
  activeGroup.value
    ? 'This group is empty. Add a channel or import a CSV to fill it.'
    : 'No saved channels yet. Add one here, import a RepeaterBook or CHIRP CSV, or save memory channels from the Radio page.',
);
const groupNameTitle = computed(() => {
  if (groupNameMode.value === 'rename') {
    return 'Rename group';
  }

  return groupNameMode.value === 'selection' ? 'New group from selection' : 'New empty group';
});
const groupNameDescription = computed(() => {
  if (groupNameMode.value === 'rename') {
    return 'Change the name shown on this group\'s tab.';
  }

  if (groupNameMode.value === 'selection') {
    const count = selectedCount.value;
    return count === 1 ? 'Create a group containing the selected channel.' : `Create a group containing ${count} selected channels.`;
  }

  return 'Create an empty group, then import a CSV to fill it.';
});
const groupNameConfirmLabel = computed(() => (groupNameMode.value === 'rename' ? 'Rename' : 'Create group'));
const groupNameInitial = computed(() => (groupNameMode.value === 'rename' ? activeGroup.value?.name : undefined));
const groupNameExisting = computed(() => {
  if (groupNameMode.value !== 'rename' || !activeGroup.value) {
    return groups.value.map((group) => group.name);
  }

  return groups.value.filter((group) => group.id !== activeGroup.value?.id).map((group) => group.name);
});
const removeGroupDescription = computed(() =>
  activeGroup.value
    ? `Remove ${activeGroup.value.name}? Its channels stay in All and in any other groups.`
    : 'Remove this group? Its channels stay in All.',
);

const columns = computed<TableColumn<DisplaySavedChannel>[]>(() => [
  {
    id: 'select',
    header: ({ table }) =>
      h(UCheckbox, {
        modelValue: table.getIsSomePageRowsSelected() ? 'indeterminate' : table.getIsAllPageRowsSelected(),
        'onUpdate:modelValue': (value: boolean | 'indeterminate') => {
          table.toggleAllPageRowsSelected(!!value);
        },
        'aria-label': 'Select all saved channels',
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
        'aria-label': `Select ${row.original.name || 'saved channel'}`,
        onClick: (event: Event) => {
          event.stopPropagation();
        },
      }),
  },
  {
    id: 'name',
    header: 'Name',
  },
  {
    id: 'callsign',
    header: 'Call sign',
    cell: ({ row }) => (row.original.kind === 'repeater' ? row.original.callsign ?? '' : ''),
  },
  { accessorKey: 'band', header: 'Band' },
  {
    id: 'transmit',
    header: 'TX',
    cell: ({ row }) => formatFrequencyMHz(row.original.transmitFrequency),
  },
  {
    id: 'receive',
    header: 'RX',
    cell: ({ row }) => formatFrequencyMHz(row.original.receiveFrequency),
  },
  {
    id: 'txTone',
    header: 'TX Tone',
    cell: ({ row }) => formatSavedTone(row.original.transmitTone),
  },
  {
    id: 'rxTone',
    header: 'RX Tone',
    cell: ({ row }) => formatSavedTone(row.original.receiveTone),
  },
  {
    id: 'use',
    header: 'Use',
  },
  {
    id: 'onAir',
    header: 'On-air',
  },
  {
    id: 'actions',
    header: '',
  },
]);

watch(activeGroupId, () => {
  rowSelection.value = {};
});

function openEmptyGroup(): void {
  groupNameMode.value = 'empty';
  groupNameOpen.value = true;
}

function openGroupFromSelection(): void {
  if (selectedCount.value === 0) {
    return;
  }

  groupNameMode.value = 'selection';
  groupNameOpen.value = true;
}

function openRenameGroup(): void {
  if (!activeGroup.value) {
    return;
  }

  groupNameMode.value = 'rename';
  groupNameOpen.value = true;
}

async function confirmGroupName(name: string): Promise<void> {
  isSavingGroup.value = true;

  try {
    if (groupNameMode.value === 'rename' && activeGroup.value) {
      await renameGroup(activeGroup.value.id, name);
    } else {
      const channelIds = groupNameMode.value === 'selection' ? selectedLibraryChannels.value.map((channel) => channel.id) : [];
      await createGroup(name, channelIds);
      rowSelection.value = {};
    }

    groupNameOpen.value = false;
  } catch {
    // Toast is shown by the composable.
  } finally {
    isSavingGroup.value = false;
  }
}

async function confirmRemoveGroup(): Promise<void> {
  if (!activeGroup.value) {
    return;
  }

  isRemovingGroup.value = true;

  try {
    await removeGroup(activeGroup.value.id);
    removeGroupOpen.value = false;
  } catch {
    // Toast is shown by the composable.
  } finally {
    isRemovingGroup.value = false;
  }
}

async function confirmDeleteChannels(): Promise<void> {
  const ids = selectedLibraryChannels.value.map((channel) => channel.id);

  if (ids.length === 0) {
    return;
  }

  isDeletingChannels.value = true;

  try {
    await removeChannels(ids);
    rowSelection.value = {};
    deleteChannelsOpen.value = false;
  } catch {
    // Toast is shown by the composable.
  } finally {
    isDeletingChannels.value = false;
  }
}

function openCreate(): void {
  editingChannel.value = undefined;
  editorOpen.value = true;
}

function openEdit(channel: SavedChannel): void {
  editingChannel.value = channel;
  editorOpen.value = true;
}

function onSelectChannel(event: Event, row: TableRow<DisplaySavedChannel>): void {
  const target = event.target;

  if (target instanceof Element && target.closest('button, input, [role="checkbox"]')) {
    return;
  }

  openEdit(row.original);
}

function requestAddToRadio(): void {
  if (!canAddToRadio.value) {
    return;
  }

  addToRadioOpen.value = true;
}

async function confirmAddToRadio(sessionId: string): Promise<void> {
  const target = addTargets.value.find((candidate) => candidate.id === sessionId);

  if (!target?.ready) {
    return;
  }

  const assignment = programLibraryChannelsIntoSlots(
    selectedLibraryChannels.value,
    target.freeSlotNumbers,
    target.settingsMemoryMap,
  );

  isAddingToRadio.value = true;

  try {
    const added = await addChannels(assignment.programmed, target.id);

    if (added > 0) {
      rowSelection.value = {};
      addToRadioOpen.value = false;
    }
  } finally {
    isAddingToRadio.value = false;
  }
}

async function onSave(payload: {
  channel: RadioChannel;
  notes?: string;
  kind?: SavedChannel['kind'];
  use?: RepeaterUse;
  onAir?: boolean;
  callsign?: string;
  id?: SavedChannel['id'];
}): Promise<void> {
  try {
    const kind = payload.kind ?? editingChannel.value?.kind ?? 'channel';

    if (payload.id) {
      await updateChannel({
        id: payload.id,
        name: payload.channel.name,
        kind,
        transmitFrequency: payload.channel.transmitFrequency,
        receiveFrequency: payload.channel.receiveFrequency,
        transmitTone: payload.channel.transmitTone,
        receiveTone: payload.channel.receiveTone,
        notes: payload.notes,
        use: kind === 'repeater' ? payload.use : undefined,
        onAir: kind === 'repeater' ? payload.onAir : undefined,
        callsign: kind === 'repeater' ? payload.callsign : undefined,
        createdAt: editingChannel.value?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      });
    } else {
      await createChannel(payload.channel, payload.notes, kind, {
        use: payload.use,
        onAir: payload.onAir,
        callsign: payload.callsign,
      });
    }

    editorOpen.value = false;
  } catch {
    // Toast is shown by the composable.
  }
}

async function onExportCsv(): Promise<void> {
  isExporting.value = true;

  try {
    await exportLibraryCsv();
  } catch {
    // Toast is shown by the composable.
  } finally {
    isExporting.value = false;
  }
}

async function onImportCsv(): Promise<void> {
  isImporting.value = true;

  try {
    await importLibraryCsv();
  } catch {
    // Toast is shown by the composable.
  } finally {
    isImporting.value = false;
  }
}

onMounted(() => {
  void refresh();
});
</script>

<template>
  <div class="flex h-full flex-col gap-3 px-4 py-3">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="text-sm font-semibold text-highlighted">Channel library</h2>
        <p class="text-xs text-muted">
          Portable channels and imported repeaters. Group them with the tabs below, or select rows and choose Add to radio.
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-1.5">
        <UTooltip text="Export CSV">
          <UButton
            icon="i-lucide-file-down"
            color="neutral"
            variant="outline"
            size="sm"
            aria-label="Export channel library to CSV"
            :loading="isExporting"
            @click="onExportCsv"
          />
        </UTooltip>
        <UTooltip :text="newGroupTooltip">
          <span class="inline-flex">
            <UButton
              icon="i-lucide-folder-plus"
              color="neutral"
              variant="outline"
              size="sm"
              label="New group"
              :disabled="selectedCount === 0"
              @click="openGroupFromSelection"
            />
          </span>
        </UTooltip>
        <UTooltip :text="deleteChannelsTooltip">
          <span class="inline-flex">
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="outline"
              size="sm"
              label="Delete"
              :disabled="selectedCount === 0 || isDeletingChannels"
              @click="deleteChannelsOpen = true"
            />
          </span>
        </UTooltip>
        <UTooltip :text="importTooltip">
          <UButton
            icon="i-lucide-file-up"
            color="neutral"
            variant="outline"
            size="sm"
            :aria-label="importTooltip"
            :loading="isImporting"
            @click="onImportCsv"
          />
        </UTooltip>
        <UTooltip :text="addToRadioTooltip">
          <span class="inline-flex">
            <UButton
              icon="i-lucide-radio"
              color="primary"
              variant="soft"
              size="sm"
              label="Add to radio"
              :disabled="!canAddToRadio || isAddingToRadio"
              :loading="isAddingToRadio"
              @click="requestAddToRadio"
            />
          </span>
        </UTooltip>
        <UButton
          icon="i-lucide-plus"
          color="primary"
          size="sm"
          label="Add channel"
          @click="openCreate"
        />
      </div>
    </div>

    <ChannelGroupTabs
      v-model:active-id="activeGroupId"
      :groups="groups"
      @create-empty="openEmptyGroup"
      @rename="openRenameGroup"
      @remove="removeGroupOpen = true"
    />

    <UInput
      v-model="search"
      icon="i-lucide-search"
      placeholder="Search by name, frequency, or repeater"
      size="sm"
      class="w-full max-w-sm"
    />

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Could not load channel library"
      :description="error"
    />

    <div class="min-h-0 flex-1 overflow-auto">
      <UTable
        v-model:row-selection="rowSelection"
        :data="displayChannels"
        :columns="columns"
        :get-row-id="(row) => String(row.id)"
        :loading="isLoading"
        sticky
        class="max-h-full"
        :ui="{
          thead: 'bg-default',
          th: 'h-8 px-2 py-0 text-sm font-medium bg-default',
          td: 'h-8 px-2 py-0 text-xs tabular-nums align-middle',
          empty: 'py-8 text-center text-sm text-muted',
          tr: 'cursor-pointer',
        }"
        :empty="emptyMessage"
        @select="onSelectChannel"
      >
        <template #use-cell="{ row }">
          <UBadge
            v-if="row.original.kind === 'repeater' && row.original.use"
            :color="row.original.use === 'open' ? 'success' : 'error'"
            variant="subtle"
            size="xs"
            :label="row.original.use === 'open' ? 'Open' : 'Closed'"
          />
        </template>
        <template #onAir-cell="{ row }">
          <UTooltip
            v-if="row.original.kind === 'repeater' && row.original.onAir !== undefined"
            :text="row.original.onAir ? 'On-air' : 'Off-air'"
          >
            <UIcon
              name="i-lucide-antenna"
              class="size-4"
              :class="row.original.onAir ? 'text-success' : 'text-default'"
              :aria-label="row.original.onAir ? 'On-air' : 'Off-air'"
            />
          </UTooltip>
        </template>
        <template #name-cell="{ row }">
          <div class="flex min-w-0 items-center gap-1.5">
            <UTooltip v-if="row.original.kind === 'repeater'" text="Repeater">
              <UBadge
                color="primary"
                variant="subtle"
                size="xs"
                icon="i-lucide-radio-tower"
                label="Repeater"
                class="shrink-0"
              />
            </UTooltip>
            <span class="truncate">{{ row.original.name || '—' }}</span>
          </div>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex items-center justify-end gap-0.5" @click.stop>
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="xs"
              aria-label="Edit saved channel"
              @click="openEdit(row.original)"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="xs"
              aria-label="Delete saved channel"
              @click="removeChannel(row.original.id)"
            />
          </div>
        </template>
      </UTable>
    </div>

    <SavedChannelEditor v-model:open="editorOpen" :channel="editingChannel" @save="onSave" />
    <ChannelGroupNameDialog
      v-model:open="groupNameOpen"
      :title="groupNameTitle"
      :description="groupNameDescription"
      :confirm-label="groupNameConfirmLabel"
      :existing-names="groupNameExisting"
      :initial-name="groupNameInitial"
      :pending="isSavingGroup"
      @confirm="confirmGroupName"
    />
    <UModal
      v-model:open="deleteChannelsOpen"
      :title="selectedCount === 1 ? 'Delete channel' : 'Delete channels'"
      :description="deleteChannelsDescription"
      :ui="{ footer: 'justify-end' }"
    >
      <template #footer="{ close }">
        <UButton color="neutral" variant="outline" label="Cancel" @click="close" />
        <UButton color="error" label="Delete" :loading="isDeletingChannels" @click="confirmDeleteChannels" />
      </template>
    </UModal>
    <UModal
      v-model:open="removeGroupOpen"
      title="Remove group"
      :description="removeGroupDescription"
      :ui="{ footer: 'justify-end' }"
    >
      <template #footer="{ close }">
        <UButton color="neutral" variant="outline" label="Cancel" @click="close" />
        <UButton color="error" label="Remove group" :loading="isRemovingGroup" @click="confirmRemoveGroup" />
      </template>
    </UModal>
    <AddToRadioDialog
      v-model:open="addToRadioOpen"
      :source-count="selectedCount"
      :targets="addTargets"
      :preferred-id="focusedCardId"
      :pending="isAddingToRadio"
      @confirm="confirmAddToRadio"
    />
  </div>
</template>
