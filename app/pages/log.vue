<template>
  <div class="flex h-full min-h-0">
    <StationLogSummary :summary="summary" :scoped-to-search="search.trim().length > 0" />
    <div class="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 px-4 py-3">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="text-sm font-semibold text-highlighted">Station log</h2>
        <p class="text-xs text-muted">QSO contacts stored in the app database. Import and export as ADIF.</p>
      </div>
      <div class="flex shrink-0 items-center gap-1.5">
        <UTooltip text="Export ADIF">
          <UButton
            icon="i-lucide-file-down"
            color="neutral"
            variant="outline"
            size="sm"
            aria-label="Export station log to ADIF"
            :loading="isExporting"
            @click="onExportAdif"
          />
        </UTooltip>
        <UTooltip text="Import ADIF">
          <UButton
            icon="i-lucide-file-up"
            color="neutral"
            variant="outline"
            size="sm"
            aria-label="Import station log from ADIF"
            :loading="isImporting"
            @click="onImportAdif"
          />
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
        <UButton
          icon="i-lucide-plus"
          color="primary"
          size="sm"
          label="Add contact"
          @click="openCreate"
        />
      </div>
    </div>

    <UInput
      v-model="search"
      icon="i-lucide-search"
      placeholder="Search by callsign, name, band, radio, antenna, notes, or park"
      size="sm"
      class="w-full max-w-sm"
    />

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Could not load station log"
      :description="error"
    />

    <USplitter
      :key="showMap ? 'map' : 'table'"
      orientation="vertical"
      :items="splitterItems"
      :auto-save-id="showMap ? 'ham-radio-station-log' : undefined"
      class="min-h-0 w-full flex-1"
      :ui="{ handle: 'h-3' }"
    >
      <template #map>
        <StationLogMap class="h-full min-h-0" :qsos="filteredQsos" :stations="stations" @select="openEdit" />
      </template>
      <template #contacts>
        <div class="h-full min-h-0 w-full overflow-auto">
          <UTable
            v-model:sorting="sorting"
            :data="displayQsos"
            :columns="columns"
            :sorting-options="{ enableSortingRemoval: false }"
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
            empty="No contacts yet. Add one here, or import an ADIF file."
            @select="(row) => openEdit(row.original)"
          >
            <template #startedAt-header="{ column }">
              <button
                type="button"
                class="inline-flex items-center gap-0.5 font-medium"
                @click="column.toggleSorting()"
              >
                Local Time
                <UIcon
                  :name="column.getIsSorted() === 'asc' ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                  class="size-3.5 text-muted"
                />
              </button>
            </template>
            <template #qrzStatus-cell="{ row }">
              <UIcon
                v-if="row.original.qrzStatus === 'Y'"
                name="i-lucide-check"
                class="size-3.5 text-success"
                aria-label="Uploaded to QRZ"
              />
              <span v-else-if="row.original.qrzStatus === 'M'" title="Modified since QRZ upload">M</span>
              <span v-else>—</span>
            </template>
            <template #notesLabel-cell="{ row }">
              <span class="block max-w-48 truncate" :title="row.original.comment">
                {{ row.original.notesLabel }}
              </span>
            </template>
            <template #actions-cell="{ row }">
              <div class="flex items-center justify-end gap-0.5" @click.stop>
                <UButton
                  icon="i-lucide-pencil"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  aria-label="Edit contact"
                  @click="openEdit(row.original)"
                />
                <UButton
                  icon="i-lucide-trash-2"
                  color="error"
                  variant="ghost"
                  size="xs"
                  aria-label="Delete contact"
                  @click="removeQso(row.original.id)"
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

    <StationLogEditor v-model:open="editorOpen" :qso="editingQso" :defaults="logDefaults" @save="onSave" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SplitterItem, TableColumn } from '@nuxt/ui';
import { contactAntennaLabel } from '~/utils/antenna-station';
import { formatFrequencyMHz } from '~/utils/channel-edit';
import type { StationLogQso, StationLogQsoInput } from '~/utils/station-log-db';
import { qslTableLabel } from '~/utils/station-log-map';
import {
  formatStationLogLocalTime,
  stationLogBandLabel,
  stationLogPotaRef,
  stationLogQrzStatus,
  summarizeStationLog,
} from '~/utils/station-log-summary';

useHead({ title: 'Log' });

const {
  filteredQsos,
  isLoading,
  error,
  search,
  refresh,
  createQso,
  updateQso,
  removeQso,
  exportAdif,
  importAdif,
} = useStationLog();

const { antennas, stations, selected: selectedAntenna } = useStationAntennas();
const { radios } = useSavedRadios();

const isExporting = ref(false);
const isImporting = ref(false);
const showMap = ref(true);

const mapPanes: SplitterItem[] = [
  { id: 'map', slot: 'map', defaultSize: 42, minSize: 18, maxSize: 85, class: 'h-full min-h-0 w-full flex-col overflow-hidden' },
  { id: 'contacts', slot: 'contacts', defaultSize: 58, minSize: 15, class: 'h-full min-h-0 w-full flex-col' },
];

const tablePanes: SplitterItem[] = [
  { id: 'contacts', slot: 'contacts', defaultSize: 100, class: 'h-full min-h-0 w-full flex-col' },
];

const splitterItems = computed(() => (showMap.value ? mapPanes : tablePanes));

const editorOpen = ref(false);
const editingQso = ref<StationLogQso | undefined>();
const sorting = ref([{ id: 'startedAt', desc: true }]);

interface DisplayQso extends StationLogQso {
  startedLabel: string;
  bandLabel: string;
  modeLabel: string;
  frequencyLabel: string;
  rstLabel: string;
  nameLabel: string;
  potaLabel: string;
  qrzStatus?: 'Y' | 'M';
  notesLabel: string;
  radioLabel: string;
  antennaLabel: string;
}

const summary = computed(() => summarizeStationLog(filteredQsos.value));

const displayQsos = computed<DisplayQso[]>(() => {
  return filteredQsos.value.map((qso) => ({
    ...qso,
    startedLabel: formatStationLogLocalTime(qso.startedAt),
    bandLabel: stationLogBandLabel(qso),
    modeLabel: qso.submode ? `${qso.mode}/${qso.submode}` : qso.mode,
    frequencyLabel: qso.frequencyHz !== undefined ? formatFrequencyMHz(qso.frequencyHz) : '—',
    rstLabel: [qso.rstSent, qso.rstReceived].filter(Boolean).join(' / ') || '—',
    nameLabel: qso.theirName || '—',
    potaLabel: stationLogPotaRef(qso) || '—',
    qrzStatus: stationLogQrzStatus(qso),
    notesLabel: qso.comment || '—',
    radioLabel: qso.myRig || '—',
    antennaLabel: qso.myAntenna || '—',
  }));
});

const logDefaults = computed<Partial<StationLogQsoInput>>(() => {
  const radio = radios.value.length === 1 ? radios.value[0] : undefined;

  return {
    myRig: radio?.name,
    myAntenna: contactAntennaLabel({
      antennas: antennas.value,
      stations: stations.value,
      radio,
      selectedStationAntenna: selectedAntenna.value,
    }),
  };
});

const columns: TableColumn<DisplayQso>[] = [
  {
    accessorKey: 'startedAt',
    header: 'Local Time',
    cell: ({ row }) => row.original.startedLabel,
  },
  {
    accessorKey: 'theirCallsign',
    header: 'Call',
    enableSorting: false,
  },
  {
    accessorKey: 'bandLabel',
    header: 'Band',
    enableSorting: false,
  },
  {
    accessorKey: 'modeLabel',
    header: 'Mode',
    enableSorting: false,
  },
  {
    accessorKey: 'frequencyLabel',
    header: 'Freq',
    enableSorting: false,
  },
  {
    accessorKey: 'rstLabel',
    header: 'RST',
    enableSorting: false,
  },
  {
    accessorKey: 'nameLabel',
    header: 'Name',
    enableSorting: false,
  },
  {
    accessorKey: 'potaLabel',
    header: 'POTA',
    enableSorting: false,
  },
  {
    accessorKey: 'qrzStatus',
    header: 'QRZ',
    enableSorting: false,
  },
  {
    accessorKey: 'notesLabel',
    header: 'Notes',
    enableSorting: false,
  },
  {
    accessorKey: 'radioLabel',
    header: 'Radio',
    enableSorting: false,
  },
  {
    accessorKey: 'antennaLabel',
    header: 'Antenna',
    enableSorting: false,
  },
  {
    id: 'qsl',
    header: 'Card',
    enableSorting: false,
    cell: ({ row }) => qslTableLabel(row.original),
  },
  {
    id: 'actions',
    header: '',
    enableSorting: false,
  },
];

function openCreate(): void {
  editingQso.value = undefined;
  editorOpen.value = true;
}

function openEdit(qso: StationLogQso): void {
  editingQso.value = qso;
  editorOpen.value = true;
}

async function onSave(payload: StationLogQsoInput & { id?: string }): Promise<void> {
  try {
    if (payload.id) {
      await updateQso({
        id: payload.id,
        startedAt: payload.startedAt,
        endedAt: payload.endedAt,
        theirCallsign: payload.theirCallsign,
        frequencyHz: payload.frequencyHz,
        band: payload.band,
        mode: payload.mode,
        submode: payload.submode,
        rstSent: payload.rstSent,
        rstReceived: payload.rstReceived,
        theirName: payload.theirName,
        theirQth: payload.theirQth,
        theirGridsquare: payload.theirGridsquare,
        txPowerWatts: payload.txPowerWatts,
        comment: payload.comment,
        operatorCallsign: payload.operatorCallsign,
        stationCallsign: payload.stationCallsign,
        myGridsquare: payload.myGridsquare,
        myRig: payload.myRig,
        myAntenna: payload.myAntenna,
        qslSent: payload.qslSent === true,
        qslReceived: payload.qslReceived === true,
        adifExtra: payload.adifExtra,
        createdAt: payload.createdAt ?? editingQso.value?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      });
    } else {
      await createQso(payload);
    }

    editorOpen.value = false;
  } catch {
    // Toast is shown by the composable.
  }
}

async function onExportAdif(): Promise<void> {
  isExporting.value = true;

  try {
    await exportAdif();
  } catch {
    // Toast is shown by the composable.
  } finally {
    isExporting.value = false;
  }
}

async function onImportAdif(): Promise<void> {
  isImporting.value = true;

  try {
    await importAdif();
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
