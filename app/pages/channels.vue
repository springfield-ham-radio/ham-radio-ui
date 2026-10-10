<script setup lang="ts">
import type { RadioChannel } from '@springfield/ham-radio-api';
import type { TableColumn, TableRow } from '@nuxt/ui';
import { h, resolveComponent } from 'vue';
import { IMPORT_EXPORT_IDS } from '~/importExport/ids';
import { useImportExportRunner } from '~/importExport/runner';
import { formatStationSummary, hasStationLocation } from '~/utils/antenna-station';
import { formatFrequencyMHz, programLibraryChannelsIntoSlots } from '~/utils/channel-edit';
import { isTripChannelGroup } from '~/utils/channel-groups';
import { isPredefinedChannelId } from '~/utils/predefined-channel-groups';
import { channelHasLinkedNode, linkedNodeBadges } from '~/utils/linked-nodes';
import { formatSavedTone, type RepeaterUse, type SavedChannel } from '~/utils/saved-channels-db';
import { bandNameForFrequency } from '~/utils/transmit-privileges';
import {
  formatTripDistance,
  orderTripChannels,
  parseTypedTripCoordinates,
  stationStartPoint,
  trimTripChannels,
  tripDistanceKm,
  TRIP_START_COORDINATES,
  TRIP_START_NONE,
  typedCoordinateError,
  uniqueTripBands,
} from '~/utils/trip-channels';

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
  createGroup,
  renameGroup,
  removeGroup,
} = useSavedChannels();
const { addTargets } = useRadio();
const { entry, run } = useImportExportRunner();
const importChannels = entry(IMPORT_EXPORT_IDS.importChannelsCsv);
const exportChannels = entry(IMPORT_EXPORT_IDS.exportChannelsCsv);
const addToRadio = entry(IMPORT_EXPORT_IDS.addToRadio);
const { focusedCardId } = useRadioBoard();
const { stations } = useStationAntennas();

const isExporting = ref(false);
const isImporting = ref(false);
const isAddingToRadio = ref(false);
const editorOpen = ref(false);
const editingChannel = ref<SavedChannel | undefined>();
const addToRadioOpen = ref(false);
const rowSelection = ref<Record<string, boolean>>({});
const groupNameOpen = shallowRef(false);
const groupNameMode = shallowRef<'empty' | 'selection' | 'rename' | 'trip'>('empty');
const tripStartId = ref(TRIP_START_NONE);
const tripLatitudeText = ref('');
const tripLongitudeText = ref('');
const tripBand = ref('all');
const tripOpenOnly = ref(false);
const tripOnAirOnly = ref(false);
const isSavingGroup = shallowRef(false);
const removeGroupOpen = shallowRef(false);
const isRemovingGroup = shallowRef(false);
const deleteChannelsOpen = shallowRef(false);
const isDeletingChannels = shallowRef(false);
const linkedOnly = ref(false);

interface DisplaySavedChannel extends SavedChannel {
  band: string;
  distanceLabel: string;
}

const isTripGroup = computed(() => isTripChannelGroup(activeGroup.value));
const tripStartPoint = computed(() => {
  if (tripStartId.value === TRIP_START_COORDINATES) {
    return parseTypedTripCoordinates(tripLatitudeText.value, tripLongitudeText.value);
  }

  const station = stations.value.find((entry) => entry.id === tripStartId.value);
  return station ? stationStartPoint(station) : undefined;
});
const tripStartItems = computed(() => [
  { label: 'None', value: TRIP_START_NONE },
  ...stations.value.filter((station) => hasStationLocation(station)).map((station) => ({
    label: formatStationSummary(station),
    value: station.id,
  })),
  { label: 'Type coordinates', value: TRIP_START_COORDINATES },
]);
const tripBandItems = computed(() => [
  { label: 'All bands', value: 'all' },
  ...uniqueTripBands(filteredChannels.value).map((band) => ({ label: band, value: band })),
]);
const tripLatitudeError = computed(() =>
  tripStartId.value === TRIP_START_COORDINATES ? typedCoordinateError(tripLatitudeText.value, 'latitude') : undefined,
);
const tripLongitudeError = computed(() =>
  tripStartId.value === TRIP_START_COORDINATES ? typedCoordinateError(tripLongitudeText.value, 'longitude') : undefined,
);

const displayChannels = computed<DisplaySavedChannel[]>(() => {
  let rows = filteredChannels.value.filter((channel) => !linkedOnly.value || channelHasLinkedNode(channel));

  if (isTripGroup.value) {
    rows = orderTripChannels(
      trimTripChannels(rows, {
        band: tripBand.value === 'all' ? '' : tripBand.value,
        openOnly: tripOpenOnly.value,
        onAirOnly: tripOnAirOnly.value,
      }),
      tripStartPoint.value,
    );
  }

  return rows.map((channel) => ({
    ...channel,
    band: bandNameForFrequency(channel.transmitFrequency),
    distanceLabel: formatTripDistance(tripDistanceKm(channel, tripStartPoint.value)),
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
    return 'Open a memory file or read from a radio first';
  }

  if (radiosWithRoom.value.length === 0) {
    return 'All memory slots on open radios are programmed';
  }

  return 'Add selected channels to a radio';
});

const builtinGroup = computed(() => activeGroup.value?.builtin === true);
const newGroupTooltip = computed(() => {
  if (builtinGroup.value) {
    return 'Built-in groups cannot be changed';
  }

  return selectedCount.value === 0 ? 'Select one or more channels' : 'Create a group from the selected channels';
});
const deleteChannelsTooltip = computed(() => {
  if (builtinGroup.value) {
    return 'Built-in channels cannot be deleted';
  }

  return selectedCount.value === 0 ? 'Select channels to delete' : 'Delete the selected channels from the library';
});
const deleteChannelsDescription = computed(() => {
  const count = selectedCount.value;

  if (count === 1) {
    return 'Delete this channel from the library? It is also removed from every group.';
  }

  return `Delete ${count} channels from the library? They are also removed from every group.`;
});
const importTooltip = computed(() => {
  if (builtinGroup.value) {
    return 'Built-in groups cannot be changed';
  }

  return activeGroup.value ? `Import CSV into ${activeGroup.value.name}` : 'Import channel library, RepeaterBook, or CHIRP CSV';
});
const addChannelTooltip = computed(() =>
  builtinGroup.value ? 'Add a channel from All or a group you created' : 'Add a channel',
);
const emptyMessage = computed(() => {
  if (linkedOnly.value) {
    return 'No linked repeaters match. Turn off Linked only to see every channel.';
  }

  if (builtinGroup.value) {
    return 'Select rows and choose Add to radio to copy these channels.';
  }

  if (isTripGroup.value) {
    return 'This trip is empty. Import the route CSV you exported, then order it from a start point.';
  }

  return activeGroup.value
    ? 'This group is empty. Add a channel or import a CSV to fill it.'
    : 'No saved channels yet. Add one here, import a RepeaterBook or CHIRP CSV, or save memory channels from the Radio page.';
});
const groupNameTitle = computed(() => {
  if (groupNameMode.value === 'rename') {
    return 'Rename group';
  }

  if (groupNameMode.value === 'trip') {
    return 'New trip group';
  }

  return groupNameMode.value === 'selection' ? 'New group from selection' : 'New empty group';
});
const groupNameDescription = computed(() => {
  if (groupNameMode.value === 'rename') {
    return 'Change the name shown on this group\'s tab.';
  }

  if (groupNameMode.value === 'trip') {
    return 'Name the trip. HamBench creates the group, then opens Import CSV for a route export you already made.';
  }

  if (groupNameMode.value === 'selection') {
    const count = selectedCount.value;
    return count === 1 ? 'Create a group containing the selected channel.' : `Create a group containing ${count} selected channels.`;
  }

  return 'Create an empty group, then import a CSV to fill it.';
});
const groupNameConfirmLabel = computed(() => {
  if (groupNameMode.value === 'rename') {
    return 'Rename';
  }

  return groupNameMode.value === 'trip' ? 'Create trip group' : 'Create group';
});
const groupNamePlaceholder = computed(() => (groupNameMode.value === 'trip' ? 'I-70 to Denver' : 'Travel'));
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
  ...(isTripGroup.value && tripStartPoint.value
    ? [
        {
          id: 'distance',
          header: 'Distance',
          cell: ({ row }: { row: { original: DisplaySavedChannel } }) => row.original.distanceLabel,
        },
      ]
    : []),
  {
    id: 'use',
    header: 'Use',
  },
  {
    id: 'onAir',
    header: 'On-air',
  },
  {
    id: 'linked',
    header: 'Linked',
    meta: {
      class: {
        th: 'min-w-36 whitespace-nowrap',
        td: 'min-w-36 whitespace-nowrap',
      },
    },
  },
  {
    id: 'actions',
    header: '',
  },
]);

watch(activeGroupId, () => {
  rowSelection.value = {};
});

watch(tripBandItems, (items) => {
  if (!items.some((item) => item.value === tripBand.value)) {
    tripBand.value = 'all';
  }
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

function openTripGroup(): void {
  groupNameMode.value = 'trip';
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
  const mode = groupNameMode.value;
  let importRoute = false;

  try {
    if (mode === 'rename' && activeGroup.value) {
      await renameGroup(activeGroup.value.id, name);
    } else if (mode === 'trip') {
      await createGroup(name, [], 'trip');
      importRoute = true;
    } else {
      const channelIds = mode === 'selection' ? selectedLibraryChannels.value.map((channel) => channel.id) : [];
      await createGroup(name, channelIds);
      rowSelection.value = {};
    }

    groupNameOpen.value = false;
  } catch {
    // Toast is shown by the composable.
  } finally {
    isSavingGroup.value = false;
  }

  if (importRoute) {
    await onImportCsv();
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

  if (isPredefinedChannelId(row.original.id)) {
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
    const added = await run(addToRadio.id, {
      programmedChannels: assignment.programmed,
      sessionId: target.id,
    });

    if ((added.count ?? 0) > 0) {
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
  allstarNode?: string;
  echolinkNode?: string;
  irlpNode?: string;
  wiresNode?: string;
  allstar?: boolean;
  echolink?: boolean;
  irlp?: boolean;
  wires?: boolean;
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
        latitude: editingChannel.value?.latitude,
        longitude: editingChannel.value?.longitude,
        allstar: kind === 'repeater' ? payload.allstar : undefined,
        echolink: kind === 'repeater' ? payload.echolink : undefined,
        irlp: kind === 'repeater' ? payload.irlp : undefined,
        wires: kind === 'repeater' ? payload.wires : undefined,
        allstarNode: kind === 'repeater' ? payload.allstarNode : undefined,
        echolinkNode: kind === 'repeater' ? payload.echolinkNode : undefined,
        irlpNode: kind === 'repeater' ? payload.irlpNode : undefined,
        wiresNode: kind === 'repeater' ? payload.wiresNode : undefined,
        createdAt: editingChannel.value?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      });
    } else {
      await createChannel(payload.channel, payload.notes, kind, {
        use: payload.use,
        onAir: payload.onAir,
        callsign: payload.callsign,
        allstar: payload.allstar,
        echolink: payload.echolink,
        irlp: payload.irlp,
        wires: payload.wires,
        allstarNode: payload.allstarNode,
        echolinkNode: payload.echolinkNode,
        irlpNode: payload.irlpNode,
        wiresNode: payload.wiresNode,
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
    await run(exportChannels.id);
  } catch {
    // Toast is shown by the composable.
  } finally {
    isExporting.value = false;
  }
}

async function onImportCsv(): Promise<void> {
  isImporting.value = true;

  try {
    await run(importChannels.id);
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
          Portable channels and imported repeaters. Weather, FRS, and GMRS are built-in groups. Turn them off in Preferences.
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-1.5">
        <UTooltip :text="exportChannels.label">
          <UButton
            :icon="exportChannels.icon"
            color="neutral"
            variant="outline"
            size="sm"
            aria-label="Export channel library to CSV"
            :loading="isExporting"
            @click="onExportCsv"
          />
        </UTooltip>
        <UTooltip text="Create a trip group, then import a route CSV you exported">
          <UButton
            icon="i-lucide-route"
            color="neutral"
            variant="outline"
            size="sm"
            label="New trip group"
            @click="openTripGroup"
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
              :disabled="builtinGroup || selectedCount === 0"
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
              :disabled="builtinGroup || selectedCount === 0 || isDeletingChannels"
              @click="deleteChannelsOpen = true"
            />
          </span>
        </UTooltip>
        <UTooltip :text="importTooltip">
          <UButton
            :icon="importChannels.icon"
            color="neutral"
            variant="outline"
            size="sm"
            :aria-label="importTooltip"
            :disabled="builtinGroup"
            :loading="isImporting"
            @click="onImportCsv"
          />
        </UTooltip>
        <UTooltip :text="addToRadioTooltip">
          <span class="inline-flex">
            <UButton
              :icon="addToRadio.icon"
              color="primary"
              variant="soft"
              size="sm"
              :label="addToRadio.label"
              :disabled="!canAddToRadio || isAddingToRadio"
              :loading="isAddingToRadio"
              @click="requestAddToRadio"
            />
          </span>
        </UTooltip>
        <UTooltip :text="addChannelTooltip">
          <span class="inline-flex">
            <UButton
              icon="i-lucide-plus"
              color="primary"
              size="sm"
              label="Add channel"
              :disabled="builtinGroup"
              @click="openCreate"
            />
          </span>
        </UTooltip>
      </div>
    </div>

    <ChannelGroupTabs
      v-model:active-id="activeGroupId"
      :groups="groups"
      @create-empty="openEmptyGroup"
      @rename="openRenameGroup"
      @remove="removeGroupOpen = true"
    />

    <div class="flex flex-wrap items-center gap-3">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Search by name, frequency, node, or repeater"
        size="sm"
        class="w-full max-w-sm"
      />
      <UCheckbox v-model="linkedOnly" label="Linked only" />
    </div>

    <div v-if="isTripGroup" class="flex flex-wrap items-end gap-x-3 gap-y-2">
      <UFormField label="Distance from" class="w-64">
        <USelect
          v-model="tripStartId"
          :items="tripStartItems"
          value-key="value"
          color="neutral"
          size="sm"
          class="w-full"
        />
      </UFormField>
      <UFormField v-if="tripStartId === TRIP_START_COORDINATES" label="Latitude" :error="tripLatitudeError" class="w-32">
        <UInput v-model="tripLatitudeText" placeholder="39.0997" size="sm" class="w-full" aria-label="Start latitude" />
      </UFormField>
      <UFormField v-if="tripStartId === TRIP_START_COORDINATES" label="Longitude" :error="tripLongitudeError" class="w-32">
        <UInput v-model="tripLongitudeText" placeholder="-94.5786" size="sm" class="w-full" aria-label="Start longitude" />
      </UFormField>
      <UFormField label="Band" class="w-36">
        <USelect v-model="tripBand" :items="tripBandItems" value-key="value" color="neutral" size="sm" class="w-full" />
      </UFormField>
      <UCheckbox v-model="tripOpenOnly" label="Open use" />
      <UCheckbox v-model="tripOnAirOnly" label="On-air" />
      <p v-if="tripStartPoint" class="basis-full text-xs text-muted">
        Sorted by straight-line distance. Rows without coordinates stay last.
      </p>
    </div>

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
          tr: builtinGroup ? '' : 'cursor-pointer',
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
        <template #linked-cell="{ row }">
          <div v-if="linkedNodeBadges(row.original).length > 0" class="flex flex-nowrap items-center gap-1">
            <UTooltip
              v-for="badge in linkedNodeBadges(row.original)"
              :key="badge.label"
              :text="badge.text"
            >
              <UBadge
                :color="badge.color"
                variant="subtle"
                size="sm"
                :label="badge.label"
                class="shrink-0"
                :ui="{ label: 'whitespace-nowrap' }"
              />
            </UTooltip>
          </div>
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
          <div v-if="!isPredefinedChannelId(row.original.id)" class="flex items-center justify-end gap-0.5" @click.stop>
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
      :placeholder="groupNamePlaceholder"
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
