<script setup lang="ts">
import type { RadioChannel } from '@springfield/ham-radio-api';
import type { SplitterItem, TableColumn, TableRow } from '@nuxt/ui';
import { h, resolveComponent } from 'vue';
import { IMPORT_EXPORT_IDS } from '~/importExport/ids';
import { useImportExportRunner } from '~/importExport/runner';
import { HOME_STATION_ID } from '~/utils/antenna-station';
import { formatChannelLocation, sortChannelsByLocation } from '~/utils/channel-location';
import { formatFrequencyMHz, programLibraryChannelsIntoSlots } from '~/utils/channel-edit';
import { isTripChannelGroup } from '~/utils/channel-groups';
import { isPredefinedChannelId } from '~/utils/predefined-channel-groups';
import { channelHasLinkedNode, linkedNodeBadges } from '~/utils/linked-nodes';
import { formatSavedTone, type RepeaterUse, type SavedChannel } from '~/utils/saved-channels-db';
import { bandNameForFrequency } from '~/utils/transmit-privileges';
import {
  channelMapRangeRadiusKm,
  parseChannelMapRangeRadius,
} from '~/utils/channel-map';
import {
  readChannelMapSettings,
  writeChannelMapSettings,
} from '~/utils/channel-map-settings';
import {
  defaultDistanceStartId,
  formatTripDistance,
  orderTripChannels,
  parseTypedTripCoordinates,
  stationStartPoint,
  trimTripChannels,
  tripDistanceKm,
  TRIP_START_COORDINATES,
  TRIP_START_NONE,
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

onMounted(() => {
  void refresh();
});

const { addTargets } = useRadio();
const { entry, run } = useImportExportRunner();
const importChannels = entry(IMPORT_EXPORT_IDS.importChannelsCsv);
const exportChannels = entry(IMPORT_EXPORT_IDS.exportChannelsCsv);
const addToRadio = entry(IMPORT_EXPORT_IDS.addToRadio);
const { focusedCardId } = useRadioBoard();
const { stations, selectedStationId } = useStationAntennas();
const { unit: distanceUnit } = useDistanceUnit();

const isExporting = ref(false);
const isImporting = ref(false);
const isAddingToRadio = ref(false);
const editorOpen = ref(false);
const editingChannel = ref<SavedChannel | undefined>();
const addToRadioOpen = ref(false);
const rowSelection = ref<Record<string, boolean>>({});
const groupNameOpen = shallowRef(false);
const groupNameMode = shallowRef<'empty' | 'selection' | 'rename' | 'trip'>('empty');
const distanceStartId = ref(TRIP_START_NONE);
const distanceStartChosen = ref(false);
const distanceLatitudeText = ref('');
const distanceLongitudeText = ref('');
const sorting = ref<{ id: string; desc: boolean }[]>([]);
const columnVisibility = ref<Record<string, boolean>>({});
const table = useTemplateRef<{
  tableApi: {
    getAllColumns: () => Array<{
      id: string;
      columnDef: { header?: unknown };
      getCanHide: () => boolean;
      getIsVisible: () => boolean;
    }>;
    getColumn: (id: string) => { toggleVisibility: (visible: boolean) => void } | undefined;
  };
}>('table');
const tripBand = ref('all');
const tripOpenOnly = ref(false);
const tripOnAirOnly = ref(false);
const isSavingGroup = shallowRef(false);
const removeGroupOpen = shallowRef(false);
const isRemovingGroup = shallowRef(false);
const deleteChannelsOpen = shallowRef(false);
const isDeletingChannels = shallowRef(false);
const linkedOnly = ref(false);
const channelMapSettings = ref(readChannelMapSettings());
const showMap = computed({
  get: () => channelMapSettings.value.open,
  set(open: boolean) {
    channelMapSettings.value = { ...channelMapSettings.value, open };
    writeChannelMapSettings(channelMapSettings.value);
  },
});
const mapRangeText = ref(
  channelMapSettings.value.rangeRadius !== undefined ? String(channelMapSettings.value.rangeRadius) : '',
);
const highlightedChannelId = ref<string>();
const hoveredChannelId = ref<string>();

const mapRangeRadiusKm = computed(() =>
  channelMapRangeRadiusKm(parseChannelMapRangeRadius(mapRangeText.value), distanceUnit.value),
);

const mapPanes: SplitterItem[] = [
  {
    id: 'map',
    slot: 'map',
    defaultSize: 42,
    minSize: 18,
    maxSize: 85,
    class: 'h-full min-h-0 w-full flex-col overflow-hidden',
  },
  {
    id: 'channels',
    slot: 'channels',
    defaultSize: 58,
    minSize: 15,
    class: 'h-full min-h-0 w-full flex-col',
  },
];

const tablePanes: SplitterItem[] = [
  { id: 'channels', slot: 'channels', defaultSize: 100, class: 'h-full min-h-0 w-full flex-col' },
];

const splitterItems = computed(() => (showMap.value ? mapPanes : tablePanes));

interface DisplaySavedChannel extends SavedChannel {
  band: string;
  distanceKm?: number;
  distanceLabel: string;
}

const isTripGroup = computed(() => isTripChannelGroup(activeGroup.value));
const distanceStartPoint = computed(() => {
  if (distanceStartId.value === TRIP_START_COORDINATES) {
    return parseTypedTripCoordinates(distanceLatitudeText.value, distanceLongitudeText.value);
  }

  const station = stations.value.find((entry) => entry.id === distanceStartId.value);
  return station ? stationStartPoint(station) : undefined;
});
const tripBandItems = computed(() => [
  { label: 'All bands', value: 'all' },
  ...uniqueTripBands(filteredChannels.value).map((band) => ({ label: band, value: band })),
]);
const displayChannels = computed<DisplaySavedChannel[]>(() => {
  let rows = filteredChannels.value.filter((channel) => !linkedOnly.value || channelHasLinkedNode(channel));

  if (isTripGroup.value) {
    rows = trimTripChannels(rows, {
      band: tripBand.value === 'all' ? '' : tripBand.value,
      openOnly: tripOpenOnly.value,
      onAirOnly: tripOnAirOnly.value,
    });
  }

  const primarySort = sorting.value[0];

  if (primarySort?.id === 'distance' && distanceStartPoint.value) {
    rows = orderTripChannels(rows, distanceStartPoint.value, primarySort.desc ? 'desc' : 'asc');
  } else if (primarySort?.id === 'location') {
    rows = sortChannelsByLocation(rows, primarySort.desc ? 'desc' : 'asc');
  }

  return rows.map((channel) => {
    const distanceKm = tripDistanceKm(channel, distanceStartPoint.value);

    return {
      ...channel,
      band: bandNameForFrequency(channel.transmitFrequency),
      distanceKm,
      distanceLabel: formatTripDistance(distanceKm, distanceUnit.value),
    };
  });
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
    enableHiding: false,
    enableSorting: false,
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
  {
    id: 'location',
    accessorFn: (row: DisplaySavedChannel) => formatChannelLocation(row),
    header: 'Location',
    enableSorting: true,
    cell: ({ row }) => formatChannelLocation(row.original),
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
  ...(distanceStartPoint.value
    ? [
        {
          id: 'distance',
          accessorFn: (row: DisplaySavedChannel) => row.distanceKm,
          header: 'Distance',
          enableSorting: true,
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
    enableHiding: false,
    enableSorting: false,
  },
]);

const columnMenuItems = computed(() => {
  const api = table.value?.tableApi;
  void columnVisibility.value;
  void columns.value;
  void distanceStartPoint.value;

  if (!api) {
    return [];
  }

  return api
    .getAllColumns()
    .filter((column) => column.getCanHide())
    .map((column) => ({
      label: typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id,
      type: 'checkbox' as const,
      checked: column.getIsVisible(),
      onUpdateChecked(checked: boolean) {
        api.getColumn(column.id)?.toggleVisibility(checked);
      },
      onSelect(event: Event) {
        event.preventDefault();
      },
    }));
});

watch(activeGroupId, () => {
  rowSelection.value = {};
});

watch(
  [stations, selectedStationId],
  () => {
    const current = distanceStartId.value;
    const missingStation =
      current !== TRIP_START_NONE &&
      current !== TRIP_START_COORDINATES &&
      !stations.value.some((station) => station.id === current);

    if (missingStation) {
      distanceStartChosen.value = false;
    }

    if (distanceStartChosen.value) {
      return;
    }

    distanceStartId.value = defaultDistanceStartId(stations.value, {
      selectedStationId: selectedStationId.value,
      homeStationId: HOME_STATION_ID,
    });
  },
  { immediate: true },
);

watch(
  distanceStartPoint,
  (point) => {
    if (!point) {
      sorting.value = sorting.value.filter((entry) => entry.id !== 'distance');

      if (columnVisibility.value.distance !== undefined) {
        const next = { ...columnVisibility.value };
        delete next.distance;
        columnVisibility.value = next;
      }

      return;
    }

    if (!sorting.value.some((entry) => entry.id === 'distance')) {
      sorting.value = [{ id: 'distance', desc: false }];
    }
  },
  { immediate: true },
);

watch(tripBandItems, (items) => {
  if (!items.some((item) => item.value === tripBand.value)) {
    tripBand.value = 'all';
  }
});

watch(mapRangeText, () => {
  const rangeRadius = parseChannelMapRangeRadius(mapRangeText.value);
  channelMapSettings.value = { ...channelMapSettings.value, rangeRadius };
  writeChannelMapSettings(channelMapSettings.value);
});

function onMapHighlight(channelId: string): void {
  highlightedChannelId.value = channelId;

  nextTick(() => {
    const row = document.querySelector(`[data-channel-row-id="${channelId}"]`);
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

function onChannelTableHover(event: MouseEvent): void {
  const row = (event.target as Element).closest('tbody tr[data-index]');

  if (!row) {
    hoveredChannelId.value = undefined;
    return;
  }

  const index = row.getAttribute('data-index');

  if (index === null) {
    hoveredChannelId.value = undefined;
    return;
  }

  const channel = displayChannels.value[Number(index)];
  hoveredChannelId.value = channel ? String(channel.id) : undefined;
}

function onChannelTableLeave(): void {
  hoveredChannelId.value = undefined;
}

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
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  landmark?: string;
  modes?: string;
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
        sourceKey: editingChannel.value?.sourceKey,
        sourceFormat: editingChannel.value?.sourceFormat,
        lastUpdate: editingChannel.value?.lastUpdate,
        city: kind === 'repeater' ? payload.city : undefined,
        county: kind === 'repeater' ? payload.county : undefined,
        state: kind === 'repeater' ? payload.state : undefined,
        country: kind === 'repeater' ? payload.country : undefined,
        landmark: kind === 'repeater' ? payload.landmark : undefined,
        modes: kind === 'repeater' ? payload.modes : undefined,
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
        city: payload.city,
        county: payload.county,
        state: payload.state,
        country: payload.country,
        landmark: payload.landmark,
        modes: payload.modes,
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
        <UButton
          icon="i-lucide-map"
          color="neutral"
          :variant="showMap ? 'soft' : 'outline'"
          size="sm"
          label="Map"
          :aria-pressed="showMap"
          @click="showMap = !showMap"
        />
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

    <div class="flex flex-wrap items-end gap-x-3 gap-y-2">
      <ChannelDistanceFrom
        v-model:start-id="distanceStartId"
        v-model:latitude-text="distanceLatitudeText"
        v-model:longitude-text="distanceLongitudeText"
        :stations="stations"
        @update:start-id="distanceStartChosen = true"
      />
      <UFormField
        v-if="distanceStartPoint"
        :label="distanceUnit === 'km' ? 'Range (km)' : 'Range (mi)'"
        class="w-28"
      >
        <UInput
          v-model="mapRangeText"
          placeholder="Off"
          size="sm"
          class="w-full"
          inputmode="decimal"
          aria-label="Map range ring radius"
        />
      </UFormField>
      <UFormField v-if="isTripGroup" label="Band" class="w-36">
        <USelect v-model="tripBand" :items="tripBandItems" value-key="value" color="neutral" size="sm" class="w-full" />
      </UFormField>
      <UCheckbox v-if="isTripGroup" v-model="tripOpenOnly" label="Open use" />
      <UCheckbox v-if="isTripGroup" v-model="tripOnAirOnly" label="On-air" />
      <UDropdownMenu :items="columnMenuItems" :content="{ align: 'end' }" class="ml-auto">
        <UButton
          label="Columns"
          color="neutral"
          variant="outline"
          size="sm"
          trailing-icon="i-lucide-chevron-down"
          aria-label="Choose visible columns"
        />
      </UDropdownMenu>
      <p v-if="distanceStartPoint" class="basis-full text-xs text-muted">
        Straight-line distance. Rows without coordinates show — and stay last when this column is sorted.
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

    <USplitter
      :key="showMap ? 'map' : 'table'"
      orientation="vertical"
      :items="splitterItems"
      :auto-save-id="showMap ? 'ham-radio-channels' : undefined"
      class="min-h-0 w-full flex-1"
      :ui="{ handle: 'h-3' }"
    >
      <template #map>
        <ChannelMap
          class="h-full min-h-0"
          :channels="displayChannels"
          :highlighted-channel-id="highlightedChannelId"
          :hovered-channel-id="hoveredChannelId"
          :distance-start-point="distanceStartPoint"
          :range-radius-km="mapRangeRadiusKm"
          :distance-unit="distanceUnit"
          @highlight="onMapHighlight"
        />
      </template>
      <template #channels>
        <div
          class="h-full min-h-0 w-full overflow-auto"
          @mouseover="onChannelTableHover"
          @mouseleave="onChannelTableLeave"
        >
          <UTable
            ref="table"
            v-model:row-selection="rowSelection"
            v-model:sorting="sorting"
            v-model:column-visibility="columnVisibility"
            :data="displayChannels"
            :columns="columns"
            :get-row-id="(row) => String(row.id)"
            :loading="isLoading"
            :sorting-options="{ manualSorting: true, enableSortingRemoval: false }"
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
        <template #distance-header="{ column }">
          <button
            type="button"
            class="inline-flex items-center gap-0.5 font-medium"
            @click="column.toggleSorting(column.getIsSorted() === 'asc')"
          >
            Distance
            <UIcon
              :name="column.getIsSorted() === 'desc' ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
              class="size-3.5 text-muted"
            />
          </button>
        </template>
        <template #name-cell="{ row }">
          <div
            class="flex min-w-0 items-center gap-1.5"
            :data-channel-row-id="String(row.original.id)"
            :class="{ 'rounded-sm bg-primary/10': String(row.original.id) === highlightedChannelId }"
          >
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
      </template>
      <template #resize-handle>
        <div
          class="pointer-events-none absolute inset-x-4 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-accented group-hover:bg-primary group-data-[state=drag]:bg-primary"
        />
        <span class="sr-only">Resize map</span>
      </template>
    </USplitter>

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
