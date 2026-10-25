<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import type { TableColumn, TableRow } from '@nuxt/ui';
import type { RadioChannel, RadioProgrammedChannel, RadioSettingValue } from '@springfield/ham-radio-api';
import type { SavedChannel } from '~/utils/saved-channels-db';
import {
  collectChannelMemoryMapUiFields,
  formatMemoryMapFieldValue,
  type RadioMemoryMapUiField,
} from '@springfield/ham-radio-utils';
import { insertNodeAt, removeNode, useSortable } from '@vueuse/integrations/useSortable';
import { h, resolveComponent } from 'vue';
import { channelRowsFromProgram, type ChannelRow } from '~/composables/useRadio';
import { radioCardIdKey } from '~/composables/radio-card-context';
import { IMPORT_EXPORT_IDS } from '~/importExport/ids';
import { useImportExportRunner } from '~/importExport/runner';
import { extraChannelTableFields } from '~/utils/channel-table';
import { applyMacRowSelection, pruneRowSelection, type MacSelectionModifiers } from '~/utils/mac-row-selection';
import { writeToRadioTooltip } from '~/utils/cat-memory-transfer';
import { channelCapacity, channelSlotsAfterLastOccupied, nextAvailableChannelNumber, programLibraryChannelsIntoSlots } from '~/utils/channel-edit';
import {
  addToRadioRowsWithoutErrors,
  addToRadioValidationRows,
  channelSchemaFromSettingsSchema,
  type ChannelValidationRadio,
} from '~/utils/channel-validation';
import { channelTableTbodyFromRoot } from '~/utils/channel-table-sortable';
import { snifferPacketToHex } from '~/utils/sniffer-api';
import { snifferPacketsFromSerialLog } from '~/utils/sniffer-capture';
import { privilegeValue } from '~/utils/license-people';
import {
  buildRadioPrintDocument,
  emptyPrintReason,
  formatChannelPrintDate,
  printScopeSummary,
  resolvePrintRows,
  type ChannelPrintRadioRow,
} from '~/utils/channel-print';
import { bandNameForFrequency } from '~/utils/transmit-privileges';
import { radioSupportsLiveCat } from '~/utils/cat-capability';
import { savedRadioModelLabel } from '~/utils/saved-radios';
import {
  diffPendingRadioState,
  emptyPendingRadioDiff,
  pendingChangeCount,
  summarizePendingChanges,
  type PendingChannelDiff,
} from '~/utils/radio-pending-diff';

const UCheckbox = resolveComponent('UCheckbox');

const injectedCardId = inject(radioCardIdKey);
const { focusedCardId } = useRadioBoard();
const { openPrintDialog, registerRadioProvider, unregisterRadioProvider } = useChannelPrint();

const {
  channels,
  configurations,
  memory,
  program,
  settingsMemoryMap,
  activeRadioId,
  serialLog,
  updateSettings,
  updateChannel,
  addChannel,
  reorderChannels,
  moveChannel,
  removeChannels,
  saveSerialLog,
  savedRadio,
  cardRadio,
  isLoading,
  catalogLoaded,
  canUndoMemory,
  canRedoMemory,
  memoryUndoLabel,
  memoryRedoLabel,
  undoMemoryEdit,
  redoMemoryEdit,
  comparisonBaseline,
  comparisonSource,
} = useRadio();
const { cards } = useRadioBoard();
const { radioById } = useSavedRadios();
const {
  privilegeGroups,
  privilegeChoices,
  choiceForRadio,
  amateurCallSignOptions,
  identityFor,
  setRadioPrivilege,
  assessmentFor,
  getTransmitPrivilegeWarning,
} = useOperatorLicense();
const { entry, run } = useImportExportRunner();
const openMemory = entry(IMPORT_EXPORT_IDS.openMemory);
const saveMemory = entry(IMPORT_EXPORT_IDS.saveMemory);
const readFromRadio = entry(IMPORT_EXPORT_IDS.readFromRadio);
const writeToRadio = entry(IMPORT_EXPORT_IDS.writeToRadio);
const addFromLibrary = entry(IMPORT_EXPORT_IDS.addFromLibrary);
const saveToLibrary = entry(IMPORT_EXPORT_IDS.saveToLibrary);

interface DisplayChannelRow extends ChannelRow {
  privilegeWarning?: ReturnType<typeof getTransmitPrivilegeWarning>;
  band: string;
  /** Formatted memory-map channel extras keyed by field id. */
  extras: Record<string, string>;
  pendingKind?: PendingChannelDiff['kind'];
  changedColumnIds: string[];
  /** Filled in the baseline and empty in the editor. Shown so a clear or move-out stays visible. */
  baselineOnly: boolean;
}

const PLAIN_CHANNEL_COLUMNS = new Set(['drag', 'select', 'privilege', 'pending', 'actions']);

function modelSupportsCat(model: string | undefined): boolean {
  if (!model) {
    return false;
  }

  const config = configurations.value.find((item) => String(item.id.model) === model);
  return config ? radioSupportsLiveCat(config) : false;
}

const supportsCat = computed(() => modelSupportsCat(cardRadio.value?.model));
const anyOpenCardSupportsCat = computed(() =>
  cards.value.some((card) => modelSupportsCat(radioById(card.savedRadioId)?.model ?? card.guest?.model)),
);

const items = computed<TabsItem[]>(() => {
  const tabs: TabsItem[] = [
    { label: 'Channels', icon: 'i-lucide-list', slot: 'channels' as const, value: 'channels' },
  ];

  if (supportsCat.value) {
    tabs.push({ label: 'CAT', icon: 'i-lucide-antenna', slot: 'cat' as const, value: 'cat' });
  }

  tabs.push(
    { label: 'Settings', icon: 'i-lucide-sliders-horizontal', slot: 'settings' as const, value: 'settings' },
    { label: 'Driver', icon: 'i-lucide-cable', slot: 'driver' as const, value: 'driver' },
    { label: 'Hex Dump', icon: 'i-lucide-binary', slot: 'hex' as const, value: 'hex' },
    { label: 'Debug', icon: 'i-lucide-bug', slot: 'debug' as const, value: 'debug' },
    { label: 'Sniffer', icon: 'i-lucide-audio-lines', slot: 'sniffer' as const, value: 'sniffer' },
  );

  return tabs;
});

const route = useRoute();
const router = useRouter();

const activeTab = shallowRef('channels');

function catalogResolved(): boolean {
  return !isLoading.value && (catalogLoaded.value || configurations.value.length > 0);
}

function replaceCatQuery(showCat: boolean): void {
  if (route.path !== '/') {
    return;
  }

  const query = { ...route.query };

  if (showCat) {
    if (query.tab === 'cat') {
      return;
    }

    query.tab = 'cat';
  } else if (query.tab === 'cat') {
    delete query.tab;
  } else {
    return;
  }

  void router.replace({ path: '/', query });
}

watch(activeTab, (tab) => {
  if (!supportsCat.value) {
    return;
  }

  replaceCatQuery(tab === 'cat');
});

watch(
  () => [supportsCat.value, route.query.tab] as const,
  ([supported, tab]) => {
    if (!supported) {
      if (activeTab.value === 'cat') {
        activeTab.value = 'channels';
      }

      if (
        route.path === '/' &&
        tab === 'cat' &&
        catalogResolved() &&
        !anyOpenCardSupportsCat.value
      ) {
        replaceCatQuery(false);
      }

      return;
    }

    if (route.path === '/' && tab === 'cat' && activeTab.value !== 'cat') {
      activeTab.value = 'cat';
    }
  },
  { immediate: true },
);

watch(isLoading, (loading) => {
  if (
    loading ||
    route.path !== '/' ||
    route.query.tab !== 'cat' ||
    !catalogResolved() ||
    anyOpenCardSupportsCat.value
  ) {
    return;
  }

  replaceCatQuery(false);
});

const channelUiFields = computed<RadioMemoryMapUiField[]>(() => {
  if (!settingsMemoryMap.value) {
    return [];
  }

  return collectChannelMemoryMapUiFields(settingsMemoryMap.value);
});

const radioPrivilege = computed(() => choiceForRadio(savedRadio.value));
const privilegeAssessment = computed(() => assessmentFor(radioPrivilege.value));
const selectedPrivilegeValue = computed(() => (radioPrivilege.value ? privilegeValue(radioPrivilege.value) : undefined));

const privilegeSelection = computed({
  get: () => selectedPrivilegeValue.value,
  set: (value: string | undefined) => {
    if (!savedRadio.value || !value) {
      return;
    }

    setRadioPrivilege(savedRadio.value.id, value);
  },
});

const pendingDiff = computed(() => {
  const baseline = comparisonBaseline.value;
  const current = program.value;

  if (!baseline || !current || comparisonSource.value === 'editor') {
    return emptyPendingRadioDiff();
  }

  return diffPendingRadioState(baseline, current, settingsMemoryMap.value);
});
const pendingBySlot = computed(() => {
  const marks = new Map<number, PendingChannelDiff>();

  for (const mark of pendingDiff.value.channels) {
    marks.set(mark.channelNumber, mark);
  }

  return marks;
});
const pendingChangeTotal = computed(() => pendingChangeCount(pendingDiff.value));
const pendingChangeSummary = computed(() => {
  const source = comparisonSource.value;

  if (source === 'editor') {
    return '';
  }

  return summarizePendingChanges(pendingDiff.value, source);
});
const workspaceTabs = computed<TabsItem[]>(() => {
  const settingsChanges = pendingDiff.value.settingsPaths.length;

  if (settingsChanges === 0) {
    return items.value;
  }

  return items.value.map((item) => {
    if (item.value !== 'settings') {
      return item;
    }

    return { ...item, badge: settingsChanges };
  });
});

function toDisplayChannel(
  channel: ChannelRow,
  pending?: PendingChannelDiff,
  baselineOnly = false,
): DisplayChannelRow {
  const extras: Record<string, string> = {};

  for (const field of channelUiFields.value) {
    const raw = channel.settings?.[field.fieldId] as RadioSettingValue | undefined;
    extras[field.fieldId] = formatMemoryMapFieldValue(raw, field);
  }

  return {
    ...channel,
    privilegeWarning: baselineOnly
      ? undefined
      : getTransmitPrivilegeWarning(channel.transmitFrequencyHz, radioPrivilege.value),
    band: bandNameForFrequency(channel.transmitFrequencyHz),
    extras,
    pendingKind: pending?.kind,
    changedColumnIds: pending?.changedColumnIds ?? [],
    baselineOnly,
  };
}

const displayChannels = computed<DisplayChannelRow[]>(() => {
  return channels.value.map((channel) => toDisplayChannel(channel, pendingBySlot.value.get(channel.channelNumber)));
});

const tableChannels = computed<DisplayChannelRow[]>(() => {
  const rows = displayChannels.value.map((row) => ({ ...row, baselineOnly: false }));
  const seen = new Set(rows.map((row) => row.channelNumber));
  const baseline = comparisonBaseline.value;

  if (baseline) {
    for (const mark of pendingDiff.value.channels) {
      if (seen.has(mark.channelNumber)) {
        continue;
      }

      const [row] = channelRowsFromProgram({
        channels: baseline.channels.filter((channel) => channel.channelNumber === mark.channelNumber),
        settings: {},
      });

      if (!row) {
        continue;
      }

      rows.push(toDisplayChannel(row, mark, true));
    }
  }

  return rows.sort((left, right) => left.channelNumber - right.channelNumber);
});

const tableSlotKey = computed(() =>
  tableChannels.value
    .map((row) => `${row.channelNumber}:${row.pendingKind ?? ''}:${row.baselineOnly ? 'b' : 'l'}`)
    .join(','),
);

function pendingEdgeClass(row: DisplayChannelRow): string {
  if (row.pendingKind === 'added') {
    return 'shadow-[inset_3px_0_0_0_var(--ui-success)]';
  }

  if (row.pendingKind === 'changed') {
    return 'shadow-[inset_3px_0_0_0_var(--ui-warning)]';
  }

  if (row.pendingKind === 'cleared') {
    return 'shadow-[inset_3px_0_0_0_var(--ui-error)]';
  }

  return '';
}

function pendingColumnClass(columnId: string, row: DisplayChannelRow): string {
  const classes: string[] = [];

  if (row.baselineOnly && !PLAIN_CHANNEL_COLUMNS.has(columnId)) {
    classes.push('text-muted line-through');
  }

  if (row.pendingKind === 'changed' && row.changedColumnIds.includes(columnId)) {
    classes.push('!bg-warning/25');
  }

  return classes.join(' ');
}

function pendingLabel(kind: DisplayChannelRow['pendingKind']): string {
  if (kind === 'added') {
    return 'Added';
  }

  if (kind === 'cleared') {
    return 'Cleared';
  }

  return 'Changed';
}

function pendingBadgeColor(kind: DisplayChannelRow['pendingKind']): 'success' | 'warning' | 'error' {
  if (kind === 'added') {
    return 'success';
  }

  if (kind === 'cleared') {
    return 'error';
  }

  return 'warning';
}

function pendingBadgeIcon(kind: DisplayChannelRow['pendingKind']): string {
  if (kind === 'added') {
    return 'i-lucide-plus';
  }

  if (kind === 'cleared') {
    return 'i-lucide-minus';
  }

  return 'i-lucide-pencil';
}

const channelTableMeta = {
  class: {
    tr: (row: { original: DisplayChannelRow }) => (row.original.baselineOnly ? 'channel-row-baseline' : 'channel-row-live'),
  },
};

function canSelectChannelRow(row: { original: DisplayChannelRow }): boolean {
  return !row.original.baselineOnly;
}

const displayChannelSlotKey = computed(() =>
  displayChannels.value.map((channel) => channel.channelNumber).join(','),
);

const rowSelection = ref<Record<string, boolean>>({});
const selectionAnchorId = shallowRef<string | undefined>();
const isSavingToLibrary = ref(false);
let ignoreNextCheckboxToggle = false;

function clearRowSelection(): void {
  rowSelection.value = {};
  selectionAnchorId.value = undefined;
}

function commitMacSelection(channelNumber: number, modifiers: MacSelectionModifiers): void {
  const next = applyMacRowSelection(
    tableChannels.value.filter((channel) => !channel.baselineOnly).map((channel) => String(channel.channelNumber)),
    {
      selected: rowSelection.value,
      anchorId: selectionAnchorId.value,
    },
    String(channelNumber),
    modifiers,
  );

  rowSelection.value = next.selected;
  selectionAnchorId.value = next.anchorId;
}

function onChannelCheckboxClick(event: Event, channelNumber: number): void {
  event.stopPropagation();

  if (event instanceof MouseEvent && event.shiftKey) {
    ignoreNextCheckboxToggle = true;
    commitMacSelection(channelNumber, { shiftKey: true, metaKey: event.metaKey });
    queueMicrotask(() => {
      ignoreNextCheckboxToggle = false;
    });
    return;
  }

  selectionAnchorId.value = String(channelNumber);
}

function onChannelCheckboxUpdate(row: TableRow<DisplayChannelRow>, value: boolean | 'indeterminate'): void {
  if (ignoreNextCheckboxToggle) {
    ignoreNextCheckboxToggle = false;
    return;
  }

  row.toggleSelected(value === true);
}

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
          td: ({ row }) => ['w-6 px-1', pendingEdgeClass(row.original)].filter(Boolean).join(' '),
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
      cell: ({ row }) => {
        if (row.original.baselineOnly) {
          return null;
        }

        return h(UCheckbox, {
          modelValue: row.getIsSelected(),
          'onUpdate:modelValue': (value: boolean | 'indeterminate') => {
            onChannelCheckboxUpdate(row, value);
          },
          'aria-label': `Select channel ${row.original.channelNumber}`,
          onClick: (event: Event) => {
            onChannelCheckboxClick(event, row.original.channelNumber);
          },
        });
      },
    },
    {
      id: 'privilege',
      header: '',
    },
    ...(pendingDiff.value.channels.length > 0
      ? [
          {
            id: 'pending',
            header: '',
            meta: {
              class: {
                th: 'w-8 px-1',
                td: 'w-8 px-1',
              },
            },
          } satisfies TableColumn<DisplayChannelRow>,
        ]
      : []),
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

  const withCellMark = (column: TableColumn<DisplayChannelRow>): TableColumn<DisplayChannelRow> => {
    const columnId = column.id ?? ('accessorKey' in column ? String(column.accessorKey) : '');

    if (!columnId || PLAIN_CHANNEL_COLUMNS.has(columnId)) {
      return column;
    }

    return {
      ...column,
      meta: {
        class: {
          td: ({ row }) => pendingColumnClass(columnId, row.original),
        },
      },
    };
  };

  return [
    ...core.map(withCellMark),
    ...dynamic.map(withCellMark),
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
const writeSupported = computed(() => {
  if (!activeRadioId.value) {
    return false;
  }

  const config = configurations.value.find((item) => item.id.model === activeRadioId.value?.model);
  return Boolean(config?.writeMemory);
});
const canWriteMemory = computed(() => {
  return hasLoadedMemory.value && writeSupported.value;
});
const writeMemoryTooltip = computed(() => {
  return writeToRadioTooltip({
    hasLoadedMemory: hasLoadedMemory.value,
    writeSupported: writeSupported.value,
    radioName: activeRadioId.value?.name,
  });
});
const saveMemoryTooltip = computed(() => {
  return hasLoadedMemory.value ? 'Save' : 'Open a memory file or read from a radio first';
});
const addChannelTooltip = computed(() => {
  if (!program.value || !memory.value) {
    return 'Open a memory file or read from a radio first';
  }

  if (nextFreeChannelNumber.value === undefined) {
    return 'All memory slots are programmed';
  }

  return 'Add a memory channel';
});
const freeSlotNumbers = computed(() =>
  channelSlotsAfterLastOccupied(occupiedChannelNumbers.value, radioChannelCapacity.value),
);
const libraryRadioName = computed(() => cardRadio.value?.name ?? activeRadioId.value?.name ?? 'this radio');
const addFromLibraryTooltip = computed(() => {
  if (!program.value || !memory.value) {
    return 'Open a memory file or read from a radio first';
  }

  if (freeSlotNumbers.value.length === 0) {
    return 'All memory slots are programmed';
  }

  return 'Add saved channels into unused memory slots';
});
const libraryAddOpen = shallowRef(false);

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

  if (!row || row.original.baselineOnly) {
    return;
  }

  if (event instanceof MouseEvent && (event.shiftKey || event.metaKey)) {
    commitMacSelection(row.original.channelNumber, {
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
    });
    return;
  }

  selectionAnchorId.value = String(row.original.channelNumber);
  openChannelEditor(row.original.channelNumber);
}

async function applyChannelReorder(fromIndex: number, toIndex: number): Promise<void> {
  const mapping = await reorderChannels(fromIndex, toIndex);
  const previous = editingChannelNumber.value;

  if (previous !== undefined) {
    editingChannelNumber.value = mapping.get(previous) ?? previous;
  }
}

async function onChannelMove(toNumber: number): Promise<void> {
  const previous = editingChannelNumber.value;

  if (previous === undefined) {
    return;
  }

  const mapping = await moveChannel(previous, toNumber);
  editingChannelNumber.value = mapping.get(previous) ?? previous;
}

const channelTableRoot = ref<HTMLElement | null>(null);
const channelTableTbody = shallowRef<HTMLElement | null>(null);

const { start: startChannelSortable, stop: stopChannelSortable } = useSortable(channelTableTbody, sortableRows, {
  animation: 150,
  draggable: 'tr.channel-row-live',
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
      stopChannelSortable();
      void nextTick().then(() => {
        syncChannelTableSortableTarget();
        startChannelSortable();
      });
    }, 0);
  },
});

function syncChannelTableSortableTarget(): void {
  channelTableTbody.value = channelTableRoot.value ? channelTableTbodyFromRoot(channelTableRoot.value) : null;
}

watch(
  () => displayChannelSlotKey.value,
  (slotKey) => {
    const visibleIds = slotKey.length > 0 ? slotKey.split(',') : [];
    const pruned = pruneRowSelection(rowSelection.value, visibleIds);

    if (JSON.stringify(pruned) !== JSON.stringify(rowSelection.value)) {
      rowSelection.value = pruned;
    }
  },
);

watch(
  () => [activeRadioId.value, tableSlotKey.value, channelTableRoot.value] as const,
  async () => {
    if (isReorderingChannels.value) {
      return;
    }

    stopChannelSortable();
    await nextTick();
    syncChannelTableSortableTarget();
    startChannelSortable();
  },
);

onUnmounted(() => {
  stopChannelSortable();
});

function onChannelPatch(patch: Parameters<typeof updateChannel>[1]): void {
  if (editingChannelNumber.value === undefined) {
    return;
  }

  void updateChannel(editingChannelNumber.value, patch);
}

function onCreateChannel(programmed: RadioProgrammedChannel): void {
  void addChannel(programmed);
}

const libraryFitOpen = shallowRef(false);
const pendingLibraryAdd = shallowRef<SavedChannel[]>([]);

const loadedValidationRadio = computed<ChannelValidationRadio>(() => {
  const config = configurations.value.find((item) => item.id.model === activeRadioId.value?.model);

  return {
    bands: config?.bands,
    memoryMap: settingsMemoryMap.value,
    channelSchema: channelSchemaFromSettingsSchema(config?.settingsSchema),
  };
});

function commitLibraryAdd(sources: SavedChannel[], slotNumbers: readonly number[]): void {
  const assignment = programLibraryChannelsIntoSlots(sources, slotNumbers, settingsMemoryMap.value);
  void run(addFromLibrary.id, { programmedChannels: assignment.programmed });
}

function onAddFromLibrary(sources: SavedChannel[]): void {
  const rows = addToRadioValidationRows(
    sources,
    freeSlotNumbers.value,
    loadedValidationRadio.value,
    privilegeAssessment.value,
  );

  if (rows.length === 0 || rows.every((row) => row.findings.length === 0)) {
    commitLibraryAdd(
      sources,
      freeSlotNumbers.value,
    );
    return;
  }

  pendingLibraryAdd.value = sources;
  libraryFitOpen.value = true;
}

function confirmLibraryFit(mode: 'all' | 'valid-only'): void {
  const rows = addToRadioValidationRows(
    pendingLibraryAdd.value,
    freeSlotNumbers.value,
    loadedValidationRadio.value,
    privilegeAssessment.value,
  );
  const accepted = mode === 'all' ? rows : addToRadioRowsWithoutErrors(rows);
  libraryFitOpen.value = false;
  pendingLibraryAdd.value = [];
  commitLibraryAdd(
    accepted.map((row) => row.channel as SavedChannel),
    accepted.map((row) => row.slotNumber),
  );
}

function requestRemoveChannel(channelNumber: number): void {
  pendingRemoveNumbers.value = [channelNumber];
  removeOpen.value = true;
}

function requestRemoveSelected(): void {
  pendingRemoveNumbers.value = selectedChannelNumbers.value;
  removeOpen.value = true;
}

async function confirmRemove(): Promise<void> {
  const numbers = pendingRemoveNumbers.value;

  if (editingChannelNumber.value !== undefined && numbers.includes(editingChannelNumber.value)) {
    editorOpen.value = false;
    editingChannelNumber.value = undefined;
  }

  stopChannelSortable();
  removeOpen.value = false;
  pendingRemoveNumbers.value = [];

  await removeChannels(numbers);
  clearRowSelection();

  await nextTick();
  syncChannelTableSortableTarget();
  startChannelSortable();
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
    await run(saveToLibrary.id, { channels: portableChannels });
    clearRowSelection();
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

  const label = serialLog.value.operation === 'write' ? 'Wrote to radio' : 'Read from radio';
  const frames = serialLog.value.entryCount;
  return `${label} · ${frames} frame${frames === 1 ? '' : 's'}`;
});

const savingSerialLog = ref(false);

const radioPrintRows = computed<ChannelPrintRadioRow[]>(() =>
  displayChannels.value.map((channel) => ({
    channelNumber: channel.channelNumber,
    name: channel.name,
    band: channel.band,
    transmit: channel.transmit,
    receive: channel.receive,
    txTone: channel.txTone,
    rxTone: channel.rxTone,
    toneType: channel.toneType,
    transmitFrequencyHz: channel.transmitFrequencyHz,
    receiveFrequencyHz: channel.receiveFrequencyHz,
    settings: channel.settings,
    extras: channel.extras,
  })),
);

function radioPrintSelection() {
  const visible = radioPrintRows.value;
  const selectedNumbers = new Set(selectedChannelNumbers.value);

  return resolvePrintRows({
    selected: visible.filter((row) => selectedNumbers.has(row.channelNumber)),
    visible,
    id: (row) => String(row.channelNumber),
  });
}

function buildRadioPrintContext() {
  const resolved = radioPrintSelection();
  const radioName = cardRadio.value?.name ?? activeRadioId.value?.name ?? 'Radio';
  const manufacturer = String(activeRadioId.value?.manufacturer ?? '');
  const model = String(activeRadioId.value?.model ?? '');
  const identity = identityFor(choiceForRadio(savedRadio.value));

  return {
    surface: 'radio' as const,
    title: 'Print channels',
    subtitle: printScopeSummary(resolved.rows.length, resolved.scope),
    rowCount: resolved.rows.length,
    callSignOptions: amateurCallSignOptions.value,
    defaultCallSign: identity.callSign,
    buildDocument: (options: {
      layout: 'full' | 'wallet';
      matchVisibleColumns: boolean;
      callSign?: string;
    }) => {
      const channels = radioPrintSelection().rows;

      if (emptyPrintReason(channels.length)) {
        return undefined;
      }

      return buildRadioPrintDocument({
        layout: options.layout,
        cardName: radioName,
        manufacturer,
        model,
        callSign: options.callSign,
        printedOn: formatChannelPrintDate(new Date()),
        channels,
        extraFields: channelUiFields.value.map((field) => ({
          fieldId: field.fieldId,
          label: field.ui.label,
        })),
      });
    },
  };
}

function radioPrintProvider() {
  if (route.path !== '/' || injectedCardId?.value !== focusedCardId.value) {
    return null;
  }

  return buildRadioPrintContext();
}

function openRadioPrintDialog(): void {
  const context = buildRadioPrintContext();

  if (!context || emptyPrintReason(context.rowCount)) {
    return;
  }

  openPrintDialog(context);
}

onMounted(() => {
  registerRadioProvider(radioPrintProvider);
});

onUnmounted(() => {
  unregisterRadioProvider(radioPrintProvider);
});

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
  <div class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-4 pb-4 pt-1">
    <UTabs
      v-model="activeTab"
      color="primary"
      variant="link"
      :items="workspaceTabs"
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
          <UTooltip
            v-if="cardRadio || activeRadioId"
            :text="
              cardRadio
                ? savedRadioModelLabel(cardRadio, configurations)
                : `${activeRadioId?.manufacturer} · ${activeRadioId?.model}`
            "
          >
            <UBadge
              :label="cardRadio?.name ?? activeRadioId?.name"
              color="neutral"
              variant="subtle"
              size="sm"
              icon="i-lucide-radio"
              class="max-w-56 truncate"
            />
          </UTooltip>
          <UTooltip :text="openMemory.label">
            <UButton
              :icon="openMemory.icon"
              color="neutral"
              variant="outline"
              size="sm"
              :aria-label="openMemory.label"
              @click="run(openMemory.id)"
            />
          </UTooltip>
          <UTooltip :text="saveMemoryTooltip">
            <span class="inline-flex">
              <UButton
                :icon="saveMemory.icon"
                color="neutral"
                variant="outline"
                size="sm"
                :disabled="!hasLoadedMemory"
                :aria-label="saveMemory.label"
                @click="run(saveMemory.id)"
              />
            </span>
          </UTooltip>
          <USeparator orientation="vertical" class="h-5" />
          <UTooltip :text="readFromRadio.label">
            <UButton
              :icon="readFromRadio.icon"
              color="neutral"
              variant="outline"
              size="sm"
              :aria-label="readFromRadio.label"
              @click="run(readFromRadio.id)"
            />
          </UTooltip>
          <UTooltip v-if="pendingChangeTotal > 0" :text="pendingChangeSummary">
            <UBadge
              :label="String(pendingChangeTotal)"
              color="warning"
              variant="subtle"
              size="sm"
              class="tabular-nums"
              :aria-label="pendingChangeSummary"
            />
          </UTooltip>
          <UTooltip :text="writeMemoryTooltip">
            <span class="inline-flex">
              <UButton
                :icon="writeToRadio.icon"
                color="neutral"
                variant="outline"
                size="sm"
                :disabled="!canWriteMemory"
                :aria-label="writeToRadio.label"
                @click="run(writeToRadio.id)"
              />
            </span>
          </UTooltip>
        </div>
      </template>
      <template #channels>
        <RadioMemoryEmpty v-if="!activeRadioId" />
        <div v-else class="flex min-h-0 flex-1 flex-col overflow-hidden pt-2">
          <div class="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
            <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <USelectMenu
                v-if="privilegeChoices > 1"
                v-model="privilegeSelection"
                :items="privilegeGroups"
                value-key="value"
                placeholder="Select a license"
                color="neutral"
                :search-input="false"
                class="w-64"
                size="sm"
              />
              <p v-if="privilegeAssessment.active && outOfClassCount > 0" class="text-xs text-warning">
                {{ outOfClassCount }} channel{{ outOfClassCount === 1 ? '' : 's' }} have transmit frequencies outside
                {{ privilegeAssessment.label }} privileges.
              </p>
              <p v-else-if="privilegeAssessment.active && privilegeChoices === 1" class="text-xs text-muted">
                Checking {{ privilegeAssessment.label }} privileges. FRS is allowed for everyone.
              </p>
              <p v-else-if="radioPrivilege && !privilegeAssessment.active && channels.length > 0" class="text-xs text-muted">
                Choose a license class for this grant in Preferences before privilege checks can run.
              </p>
              <p v-else-if="privilegeChoices === 0 && channels.length > 0" class="text-xs text-muted">
                Add a person in Preferences to flag channels. Someone with no license can still use FRS.
              </p>
              <p v-else-if="privilegeChoices > 1 && !radioPrivilege && channels.length > 0" class="text-xs text-muted">
                Select a license to flag channels outside that grant. FRS is allowed for everyone.
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              <UTooltip :text="memoryUndoLabel ? `Undo ${memoryUndoLabel}` : 'Undo'">
                <span class="inline-flex">
                  <UButton
                    icon="i-lucide-undo-2"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    aria-label="Undo memory edit"
                    :disabled="!canUndoMemory"
                    @click="undoMemoryEdit()"
                  />
                </span>
              </UTooltip>
              <UTooltip :text="memoryRedoLabel ? `Redo ${memoryRedoLabel}` : 'Redo'">
                <span class="inline-flex">
                  <UButton
                    icon="i-lucide-redo-2"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    aria-label="Redo memory edit"
                    :disabled="!canRedoMemory"
                    @click="redoMemoryEdit()"
                  />
                </span>
              </UTooltip>
              <USeparator orientation="vertical" class="h-5" />
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
              <UTooltip :text="addFromLibraryTooltip">
                <span class="inline-flex">
                  <UButton
                    :icon="addFromLibrary.icon"
                    color="primary"
                    variant="soft"
                    size="sm"
                    :label="addFromLibrary.label"
                    :disabled="!canAddChannel"
                    @click="libraryAddOpen = true"
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
                :icon="saveToLibrary.icon"
                color="primary"
                variant="soft"
                size="sm"
                :label="saveToLibrary.label"
                :disabled="selectedCount === 0 || isSavingToLibrary"
                :loading="isSavingToLibrary"
                @click="saveSelectedToLibrary"
              />
              <UButton
                icon="i-lucide-printer"
                color="neutral"
                variant="outline"
                size="sm"
                label="Print"
                :disabled="radioPrintRows.length === 0"
                @click="openRadioPrintDialog"
              />
            </div>
          </div>
          <div ref="channelTableRoot" class="min-h-0 flex-1 overflow-hidden">
            <UTable
              :key="tableSlotKey"
              v-model:row-selection="rowSelection"
              :data="tableChannels"
              :columns="columns"
              :meta="channelTableMeta"
              :row-selection-options="{ enableRowSelection: canSelectChannelRow }"
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
              <template #drag-cell="{ row }">
                <span
                  v-if="!row.original.baselineOnly"
                  class="channel-drag-handle inline-flex text-muted"
                  aria-label="Drag to reorder channel"
                  @click.stop
                >
                  <UIcon name="i-lucide-grip-vertical" class="pointer-events-none size-3.5" />
                </span>
              </template>
              <template #pending-cell="{ row }">
                <UTooltip v-if="row.original.pendingKind" :text="pendingLabel(row.original.pendingKind)">
                  <UBadge
                    :color="pendingBadgeColor(row.original.pendingKind)"
                    :icon="pendingBadgeIcon(row.original.pendingKind)"
                    variant="subtle"
                    size="xs"
                    :aria-label="pendingLabel(row.original.pendingKind)"
                  />
                </UTooltip>
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
                <div v-if="!row.original.baselineOnly" class="flex items-center justify-end gap-0.5" @click.stop>
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
            Drag the handle to reorder channels or drop into a gap to take the first empty slot in that gap; dropping
            between adjacent occupied slots reorders those memory positions. Open a channel to set its memory slot
            directly (an empty slot moves it; an occupied slot inserts and shifts later slots to the first gap). Select
            channels to save them to the library or remove them from this radio. Shift-click selects a range, and
            Command-click adds or removes one channel. Add a channel after the last programmed memory slot (wrapping to
            the first free slot when the end is full), or choose Add from library to copy saved channels into unused
            slots in that same order. You can also select saved channels on the Channels
            page and choose Add to radio. Click a row to edit the loaded memory. While editing, Replace from library
            copies a saved channel into that slot.
          </p>
        </div>
      </template>
      <template #cat>
        <RadioCat v-if="supportsCat && activeTab === 'cat'" :saved-radio-id="cardRadio?.id" />
      </template>
      <template #settings>
        <RadioMemoryEmpty v-if="!activeRadioId" />
        <div v-else class="flex min-h-0 flex-1 flex-col overflow-hidden pt-2">
          <RadioSettingsForm
            v-if="settingsMemoryMap && program"
            :memory-map="settingsMemoryMap"
            :settings="program.settings"
            :changed-paths="pendingDiff.settingsPaths"
            @update:settings="updateSettings"
          />
          <p v-else class="pt-2 text-sm text-muted">This radio has no settings to display.</p>
        </div>
      </template>
      <template #driver>
        <RadioDriver :model-id="cardRadio?.model" />
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
                Read from or write to a radio to capture serial traffic.
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
    <ChannelLibraryPicker
      v-model:open="libraryAddOpen"
      mode="add"
      :radio-name="libraryRadioName"
      :free-slot-numbers="freeSlotNumbers"
      @add="onAddFromLibrary"
    />
    <ChannelFitDialog
      v-model:open="libraryFitOpen"
      :channels="pendingLibraryAdd"
      :slot-numbers="freeSlotNumbers"
      :radio="loadedValidationRadio"
      :license="privilegeAssessment"
      title="Add from library"
      @confirm="confirmLibraryFit"
    />
    <RadioChannelEditor
      v-model:open="editorOpen"
      :channel="editingChannel"
      :memory-map="settingsMemoryMap"
      :occupied-channel-numbers="occupiedChannelNumbers"
      :channel-capacity="radioChannelCapacity"
      :privilege="radioPrivilege"
      :validation-radio="loadedValidationRadio"
      :license="privilegeAssessment"
      @update:channel="onChannelPatch"
      @create="onCreateChannel"
      @move="onChannelMove"
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
