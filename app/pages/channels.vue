<script setup lang="ts">
import type { RadioChannel } from '@springfield/ham-radio-api';
import type { DropdownMenuItem, SplitterItem, TableColumn, TableRow } from '@nuxt/ui';
import { h, resolveComponent } from 'vue';
import { IMPORT_EXPORT_IDS } from '~/importExport/ids';
import { useImportExportRunner } from '~/importExport/runner';
import { HOME_STATION_ID } from '~/utils/antenna-station';
import { formatChannelLocation, sortChannelsByLocation } from '~/utils/channel-location';
import { addToRadioDevFixture } from '~/utils/add-to-radio-dev-fixture';
import { addToRadioRowsWithoutErrors, addToRadioValidationRows } from '~/utils/channel-validation';
import { formatFrequencyMHz, programLibraryChannelsIntoSlots } from '~/utils/channel-edit';
import { isTripChannelGroup } from '~/utils/channel-groups';
import { isPredefinedChannelId } from '~/utils/predefined-channel-groups';
import { channelHasLinkedNode, linkedNodeBadges } from '~/utils/linked-nodes';
import { formatSavedTone, type RepeaterUse, type SavedChannel } from '~/utils/saved-channels-db';
import { bandNameForFrequency } from '~/utils/transmit-privileges';
import {
  channelMapRangeRadiusKm,
  formatChannelMapRangeDisplay,
  parseChannelMapRangeRadius,
} from '~/utils/channel-map';
import {
  libraryBandFilterItems,
  matchesLibraryBandFilter,
  matchesLibraryOnAirFilter,
  selectionVisibleOnly,
  type ChannelOnAirFilter,
  uniqueLibraryBandTokens,
} from '~/utils/channel-library-filters';
import {
  readChannelLibraryFilterSettings,
  writeChannelLibraryFilterSettings,
} from '~/utils/channel-library-filter-settings';
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
} from '~/utils/trip-channels';

useHead({ title: 'Channels' });

const UCheckbox = resolveComponent('UCheckbox');

const {
  filteredChannels,
  channelsForGroup,
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

  if (addToRadioFixtureActive.value) {
    void seedAddToRadioDevFixture();
  }
});

const route = useRoute();
const { addTargets, seedAddToRadioDevFixture } = useRadio();
const { radios } = useSavedRadios();
const { choiceForRadio, assessmentFor } = useOperatorLicense();
const addToRadioFixtureActive = computed(() => import.meta.dev && route.query.fixture === 'add-to-radio');

watch(addToRadioFixtureActive, (active) => {
  if (active) {
    void seedAddToRadioDevFixture();
  }
});
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
const tripOpenOnly = ref(false);
const isSavingGroup = shallowRef(false);
const removeGroupOpen = shallowRef(false);
const isRemovingGroup = shallowRef(false);
const deleteChannelsOpen = shallowRef(false);
const isDeletingChannels = shallowRef(false);
type ChannelLibraryCreateAction = 'add-channel' | 'empty-group' | 'trip-group';

const channelCreateAction = useState<ChannelLibraryCreateAction>('channel-library-create-action', () => 'add-channel');
const libraryFilterSettings = ref(readChannelLibraryFilterSettings());
const selectedBandTokens = computed({
  get: () => libraryFilterSettings.value.bands,
  set: (bands: string[]) => {
    libraryFilterSettings.value = { ...libraryFilterSettings.value, bands };
    writeChannelLibraryFilterSettings(libraryFilterSettings.value);
  },
});
const onAirFilter = computed({
  get: () => libraryFilterSettings.value.onAir,
  set: (onAir: ChannelOnAirFilter) => {
    libraryFilterSettings.value = { ...libraryFilterSettings.value, onAir };
    writeChannelLibraryFilterSettings(libraryFilterSettings.value);
  },
});
const onAirFilterItems = [
  { label: 'All', value: 'all' as const },
  { label: 'On air', value: 'on-air' as const },
  { label: 'Off air', value: 'off-air' as const },
];
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
  channelMapSettings.value.rangeRadiusKm !== undefined
    ? formatChannelMapRangeDisplay(channelMapSettings.value.rangeRadiusKm, distanceUnit.value)
    : '',
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

const tableMeta = computed(() => {
  void highlightedChannelId.value;

  return {
    class: {
      tr: (row: TableRow<DisplaySavedChannel>) =>
        String(row.original.id) === highlightedChannelId.value ? 'bg-primary/15 dark:bg-primary/25' : '',
    },
  };
});

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
const scopedChannels = computed(() => channelsForGroup(activeGroupId.value));
const libraryBandFilterOptions = computed(() =>
  libraryBandFilterItems(uniqueLibraryBandTokens(scopedChannels.value)),
);
const displayChannels = computed<DisplaySavedChannel[]>(() => {
  let rows = filteredChannels.value.filter((channel) => !linkedOnly.value || channelHasLinkedNode(channel));
  rows = rows.filter((channel) => matchesLibraryBandFilter(channel, selectedBandTokens.value));
  rows = rows.filter((channel) => matchesLibraryOnAirFilter(channel, onAirFilter.value));

  if (addToRadioFixtureActive.value) {
    rows = [...addToRadioDevFixture(), ...rows];
  }

  if (isTripGroup.value) {
    rows = trimTripChannels(rows, {
      band: '',
      openOnly: tripOpenOnly.value,
      onAirOnly: false,
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
  const visible = selectionVisibleOnly(
    rowSelection.value,
    displayChannels.value.map((channel) => String(channel.id)),
  );

  return displayChannels.value.filter((channel) => visible[String(channel.id)] === true);
});

const selectedCount = computed(() => selectedLibraryChannels.value.length);
const hasBulkSelection = computed(() => selectedCount.value > 0);
const selectedCountLabel = computed(() =>
  selectedCount.value === 1 ? '1 selected' : `${selectedCount.value} selected`,
);
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
const channelCreatePrimaryLabel = computed(() => {
  switch (channelCreateAction.value) {
    case 'empty-group':
      return 'New empty group';
    case 'trip-group':
      return 'New trip group';
    default:
      return 'Add channel';
  }
});
const channelCreatePrimaryIcon = computed(() => {
  switch (channelCreateAction.value) {
    case 'empty-group':
      return 'i-lucide-folder-plus';
    case 'trip-group':
      return 'i-lucide-route';
    default:
      return 'i-lucide-plus';
  }
});
const channelCreatePrimaryTooltip = computed(() => {
  switch (channelCreateAction.value) {
    case 'empty-group':
      return 'Create an empty group, then import a CSV to fill it.';
    case 'trip-group':
      return 'Create a trip group, then import a route CSV you exported';
    default:
      return addChannelTooltip.value;
  }
});
const channelCreatePrimaryDisabled = computed(
  () => channelCreateAction.value === 'add-channel' && builtinGroup.value,
);
const channelCreateMenuItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: 'Add channel',
      icon: 'i-lucide-plus',
      disabled: builtinGroup.value,
      description: builtinGroup.value
        ? 'Built-in groups cannot be changed'
        : channelCreateAction.value === 'add-channel'
          ? 'Current'
          : undefined,
      onSelect() {
        runChannelCreateAction('add-channel');
      },
    },
    {
      label: 'New empty group',
      icon: 'i-lucide-folder-plus',
      description: channelCreateAction.value === 'empty-group' ? 'Current' : undefined,
      onSelect() {
        runChannelCreateAction('empty-group');
      },
    },
    {
      label: 'New trip group',
      icon: 'i-lucide-route',
      description: channelCreateAction.value === 'trip-group' ? 'Current' : undefined,
      onSelect() {
        runChannelCreateAction('trip-group');
      },
    },
  ],
]);
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
      h(
        'span',
        { 'data-channel-row-id': String(row.original.id) },
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
      ),
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

watch(displayChannels, (rows) => {
  const next = selectionVisibleOnly(
    rowSelection.value,
    rows.map((channel) => String(channel.id)),
  );
  const currentIds = Object.keys(rowSelection.value).filter((id) => rowSelection.value[id]).sort();
  const nextIds = Object.keys(next).sort();

  if (currentIds.length !== nextIds.length || currentIds.some((id, index) => id !== nextIds[index])) {
    rowSelection.value = next;
  }
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

watch(mapRangeText, () => {
  const rangeRadiusKm = channelMapRangeRadiusKm(parseChannelMapRangeRadius(mapRangeText.value), distanceUnit.value);
  channelMapSettings.value = { ...channelMapSettings.value, rangeRadiusKm };
  writeChannelMapSettings(channelMapSettings.value);
});

watch(distanceUnit, (unit) => {
  const storedKm = channelMapSettings.value.rangeRadiusKm;

  if (storedKm === undefined) {
    return;
  }

  mapRangeText.value = formatChannelMapRangeDisplay(storedKm, unit);
});

watch(showMap, (open) => {
  if (!open) {
    highlightedChannelId.value = undefined;
    hoveredChannelId.value = undefined;
  }
});

function onMapHighlight(channelId: string): void {
  highlightedChannelId.value = channelId;

  nextTick(() => {
    const row = document.querySelector(`[data-channel-row-id="${CSS.escape(channelId)}"]`);
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

function onChannelRowHover(_event: Event, row: TableRow<DisplaySavedChannel> | null): void {
  hoveredChannelId.value = row ? String(row.original.id) : undefined;
}

function clearRowSelection(): void {
  rowSelection.value = {};
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

function runChannelCreateAction(action: ChannelLibraryCreateAction): void {
  channelCreateAction.value = action;

  switch (action) {
    case 'add-channel':
      openCreate();
      break;
    case 'empty-group':
      openEmptyGroup();
      break;
    case 'trip-group':
      openTripGroup();
      break;
  }
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

  if (showMap.value) {
    highlightedChannelId.value = String(row.original.id);
  }

  openEdit(row.original);
}

function requestAddToRadio(): void {
  if (!canAddToRadio.value) {
    return;
  }

  addToRadioOpen.value = true;
}

function licenseForAddTarget(targetId: string) {
  const radio = radios.value.find((candidate) => candidate.id === targetId);
  return assessmentFor(choiceForRadio(radio));
}

async function confirmAddToRadio(payload: { sessionId: string; mode: 'all' | 'valid-only' }): Promise<void> {
  const target = addTargets.value.find((candidate) => candidate.id === payload.sessionId);

  if (!target?.ready) {
    return;
  }

  const license = licenseForAddTarget(target.id);
  const rows = addToRadioValidationRows(
    selectedLibraryChannels.value,
    target.freeSlotNumbers,
    {
      bands: target.bands,
      memoryMap: target.settingsMemoryMap,
      channelSchema: target.channelSchema,
    },
    license,
  );
  const accepted = payload.mode === 'all' ? rows : addToRadioRowsWithoutErrors(rows);
  const assignment = programLibraryChannelsIntoSlots(
    accepted.map((row) => row.channel),
    accepted.map((row) => row.slotNumber),
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
        <UFieldGroup size="sm" role="group" aria-label="Create channel or group">
          <UTooltip :text="channelCreatePrimaryTooltip">
            <UButton
              :icon="channelCreatePrimaryIcon"
              color="primary"
              size="sm"
              :label="channelCreatePrimaryLabel"
              :disabled="channelCreatePrimaryDisabled"
              @click="runChannelCreateAction(channelCreateAction)"
            />
          </UTooltip>
          <UDropdownMenu :items="channelCreateMenuItems" :content="{ align: 'end' }">
            <UButton
              color="primary"
              size="sm"
              square
              icon="i-lucide-chevron-down"
              aria-label="Choose create action"
              :ui="{ base: 'border-s border-white/20' }"
            />
          </UDropdownMenu>
        </UFieldGroup>
      </div>
    </div>

    <ChannelGroupTabs
      v-model:active-id="activeGroupId"
      :groups="groups"
      @rename="openRenameGroup"
      @remove="removeGroupOpen = true"
    />

    <div class="flex flex-col gap-1">
      <div class="flex flex-wrap items-end gap-x-3 gap-y-2">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Search by name, frequency, node, or repeater"
          size="sm"
          class="w-full min-w-0 sm:w-72 sm:max-w-sm"
        />
        <UFormField label="Band" class="w-36 shrink-0">
          <USelectMenu
            v-model="selectedBandTokens"
            :items="libraryBandFilterOptions"
            value-key="value"
            multiple
            placeholder="All bands"
            color="neutral"
            size="sm"
            class="w-full"
            :disabled="libraryBandFilterOptions.length === 0"
            :search-input="libraryBandFilterOptions.length > 8"
          />
        </UFormField>
        <UFormField label="On-air" class="w-32 shrink-0">
          <USelect
            v-model="onAirFilter"
            :items="onAirFilterItems"
            value-key="value"
            color="neutral"
            size="sm"
            class="w-full"
          />
        </UFormField>
        <div class="flex flex-wrap items-end gap-x-3 gap-y-2">
          <ChannelDistanceFrom
            v-model:start-id="distanceStartId"
            v-model:latitude-text="distanceLatitudeText"
            v-model:longitude-text="distanceLongitudeText"
            :stations="stations"
            @update:start-id="distanceStartChosen = true"
          />
        </div>
        <UFormField
          v-if="distanceStartPoint"
          :label="distanceUnit === 'km' ? 'Range (km)' : 'Range (mi)'"
          class="w-28 shrink-0"
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
        <UFormField label="Linked only" class="shrink-0">
          <div class="flex h-8 items-center">
            <UCheckbox v-model="linkedOnly" aria-label="Linked only" />
          </div>
        </UFormField>
        <UCheckbox v-if="isTripGroup" v-model="tripOpenOnly" label="Open use" class="shrink-0 pb-2" />
        <div class="ml-auto flex shrink-0 items-center gap-1.5 pb-0.5">
          <UButton
            icon="i-lucide-map"
            color="neutral"
            :variant="showMap ? 'soft' : 'outline'"
            size="sm"
            label="Map"
            :aria-pressed="showMap"
            @click="showMap = !showMap"
          />
          <UDropdownMenu :items="columnMenuItems" :content="{ align: 'end' }">
            <UButton
              label="Columns"
              color="neutral"
              variant="outline"
              size="sm"
              trailing-icon="i-lucide-chevron-down"
              aria-label="Choose visible columns"
            />
          </UDropdownMenu>
        </div>
      </div>
      <p v-if="distanceStartPoint" class="text-xs text-muted">
        Straight-line distance. Rows without coordinates show — and stay last when this column is sorted.
      </p>
      <div
        class="grid transition-[grid-template-rows] duration-200 ease-out"
        :class="hasBulkSelection ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
        :aria-hidden="!hasBulkSelection"
      >
        <div class="min-h-0 overflow-hidden">
          <div
            v-show="hasBulkSelection"
            role="region"
            aria-live="polite"
            aria-label="Bulk channel actions"
            class="mt-1 flex flex-wrap items-center gap-2 rounded-lg border border-default bg-elevated/60 px-3 py-2"
          >
            <span class="text-sm font-medium text-highlighted tabular-nums">{{ selectedCountLabel }}</span>
            <UButton
              color="neutral"
              variant="link"
              size="sm"
              label="Clear selection"
              @click="clearRowSelection"
            />
            <div class="ml-auto flex flex-wrap items-center gap-1.5">
              <UTooltip :text="newGroupTooltip">
                <span class="inline-flex">
                  <UButton
                    v-if="!builtinGroup"
                    icon="i-lucide-folder-plus"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    label="New group"
                    @click="openGroupFromSelection"
                  />
                </span>
              </UTooltip>
              <UTooltip :text="deleteChannelsTooltip">
                <span class="inline-flex">
                  <UButton
                    v-if="!builtinGroup"
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="outline"
                    size="sm"
                    label="Delete"
                    :disabled="isDeletingChannels"
                    @click="deleteChannelsOpen = true"
                  />
                </span>
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
            </div>
          </div>
        </div>
      </div>
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
        <div class="h-full min-h-0 w-full overflow-auto">
          <UTable
            ref="table"
            v-model:row-selection="rowSelection"
            v-model:sorting="sorting"
            v-model:column-visibility="columnVisibility"
            :data="displayChannels"
            :columns="columns"
            :meta="tableMeta"
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
            @hover="onChannelRowHover"
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
      :channels="selectedLibraryChannels"
      :targets="addTargets"
      :preferred-id="focusedCardId"
      :pending="isAddingToRadio"
      :license-for-target="licenseForAddTarget"
      @confirm="confirmAddToRadio"
    />
  </div>
</template>
