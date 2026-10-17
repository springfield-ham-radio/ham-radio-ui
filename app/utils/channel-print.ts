import type { RadioSettings } from '@springfield/ham-radio-api';
import { extraChannelTableFields } from '~/utils/channel-table';
import { duplexFromFrequencies, formatFrequencyMHz } from '~/utils/channel-edit';
import { formatChannelLocation } from '~/utils/channel-location';
import { linkedNodeBadges } from '~/utils/linked-nodes';
import { formatSavedTone, type RepeaterUse, type SavedChannel } from '~/utils/saved-channels-db';

export type ChannelPrintLayout = 'full' | 'wallet';

export type LibraryPrintRowScope = 'visible' | 'whole-tab';

export interface ChannelPrintColumn {
  id: string;
  header: string;
}

export interface ChannelPrintWalletLine {
  slot?: string;
  name: string;
  rx: string;
  offset: string;
  tone: string;
  notes?: string;
}

export interface ChannelPrintDocument {
  layout: ChannelPrintLayout;
  title: string;
  headerLines: Array<{ label: string; value: string }>;
  columns: ChannelPrintColumn[];
  rows: Array<Record<string, string>>;
  walletLines: ChannelPrintWalletLine[];
}

export interface ChannelPrintRadioRow {
  channelNumber: number;
  name: string;
  band: string;
  transmit: string;
  receive: string;
  txTone: string;
  rxTone: string;
  toneType: string;
  transmitFrequencyHz?: number;
  receiveFrequencyHz?: number;
  settings?: RadioSettings;
  extras: Record<string, string>;
}

export interface ChannelPrintLibraryRow extends SavedChannel {
  band: string;
  distanceLabel?: string;
}

export interface BuildRadioPrintDocumentInput {
  layout: ChannelPrintLayout;
  cardName: string;
  manufacturer: string;
  model: string;
  callSign?: string;
  printedOn: string;
  channels: ChannelPrintRadioRow[];
  extraFields: Array<{ fieldId: string; label: string }>;
}

export interface BuildLibraryPrintDocumentInput {
  layout: ChannelPrintLayout;
  groupLabel: string;
  callSign?: string;
  printedOn: string;
  rows: ChannelPrintLibraryRow[];
  visibleColumnIds: string[];
  matchVisibleColumns: boolean;
}

const RADIO_CORE_COLUMNS: ChannelPrintColumn[] = [
  { id: 'channelNumber', header: '#' },
  { id: 'name', header: 'Name' },
  { id: 'band', header: 'Band' },
  { id: 'transmit', header: 'TX' },
  { id: 'receive', header: 'RX' },
  { id: 'txTone', header: 'TX Tone' },
  { id: 'rxTone', header: 'RX Tone' },
  { id: 'toneType', header: 'Type' },
];

const LIBRARY_COLUMN_HEADERS: Record<string, string> = {
  name: 'Name',
  callsign: 'Call sign',
  location: 'Location',
  band: 'Band',
  transmit: 'TX',
  receive: 'RX',
  txTone: 'TX Tone',
  rxTone: 'RX Tone',
  distance: 'Distance',
  use: 'Use',
  onAir: 'On-air',
  linked: 'Linked',
};

const LIBRARY_PRINT_COLUMN_ORDER = [
  'name',
  'callsign',
  'location',
  'band',
  'transmit',
  'receive',
  'txTone',
  'rxTone',
  'distance',
  'use',
  'onAir',
  'linked',
] as const;

export function libraryColumnIsVisible(columnId: string, visibility: Record<string, boolean>): boolean {
  if (columnId in visibility) {
    return visibility[columnId] !== false;
  }

  return true;
}

export function libraryPrintColumnIds(
  visibility: Record<string, boolean>,
  includeDistance: boolean,
  matchVisibleColumns: boolean,
): string[] {
  const ordered = LIBRARY_PRINT_COLUMN_ORDER.filter((id) => includeDistance || id !== 'distance');

  if (!matchVisibleColumns) {
    return [...ordered];
  }

  return ordered.filter((id) => libraryColumnIsVisible(id, visibility));
}

export function channelsForLibraryPrint(input: {
  scope: LibraryPrintRowScope;
  selectedOnly: boolean;
  selected: readonly ChannelPrintLibraryRow[];
  visible: readonly ChannelPrintLibraryRow[];
  wholeTab: readonly ChannelPrintLibraryRow[];
}): ChannelPrintLibraryRow[] {
  if (input.selectedOnly) {
    return [...input.selected];
  }

  if (input.scope === 'whole-tab') {
    return [...input.wholeTab];
  }

  return [...input.visible];
}

export function formatPrintOffset(input: {
  receiveFrequencyHz?: number;
  transmitFrequencyHz?: number;
  settings?: RadioSettings;
}): string {
  const receiveHz = input.receiveFrequencyHz;
  const transmitHz = input.transmitFrequencyHz;

  if (receiveHz === undefined || transmitHz === undefined) {
    return '';
  }

  const duplex = duplexFromFrequencies(receiveHz, transmitHz, input.settings);

  if (duplex === 'split') {
    return `split ${formatFrequencyMHz(transmitHz)}`;
  }

  if (duplex === '') {
    return 'simplex';
  }

  const offsetMHz = Math.abs(transmitHz - receiveHz) / 1_000_000;
  return `${duplex}${offsetMHz.toFixed(3)}`;
}

export function formatPrintTone(txTone: string, rxTone: string): string {
  const tone = txTone.trim() || rxTone.trim();
  return tone || '—';
}

function formatRepeaterUse(use?: RepeaterUse): string {
  if (use === 'open') {
    return 'Open';
  }

  if (use === 'closed') {
    return 'Closed';
  }

  return '';
}

function formatOnAir(onAir?: boolean): string {
  if (onAir === true) {
    return 'On-air';
  }

  if (onAir === false) {
    return 'Off-air';
  }

  return '';
}

function formatLinkedColumn(channel: SavedChannel): string {
  return linkedNodeBadges(channel.kind === 'repeater' ? channel : undefined)
    .map((badge) => badge.label)
    .join(', ');
}

export function libraryRowCells(channel: ChannelPrintLibraryRow, columnIds: readonly string[]): Record<string, string> {
  const cells: Record<string, string> = {};

  for (const id of columnIds) {
    switch (id) {
      case 'name':
        cells[id] = channel.name ?? '';
        break;
      case 'callsign':
        cells[id] = channel.kind === 'repeater' ? channel.callsign ?? '' : '';
        break;
      case 'location':
        cells[id] = formatChannelLocation(channel);
        break;
      case 'band':
        cells[id] = channel.band;
        break;
      case 'transmit':
        cells[id] = formatFrequencyMHz(channel.transmitFrequency);
        break;
      case 'receive':
        cells[id] = formatFrequencyMHz(channel.receiveFrequency);
        break;
      case 'txTone':
        cells[id] = formatSavedTone(channel.transmitTone);
        break;
      case 'rxTone':
        cells[id] = formatSavedTone(channel.receiveTone);
        break;
      case 'distance':
        cells[id] = channel.distanceLabel ?? '—';
        break;
      case 'use':
        cells[id] = channel.kind === 'repeater' ? formatRepeaterUse(channel.use) : '';
        break;
      case 'onAir':
        cells[id] = channel.kind === 'repeater' ? formatOnAir(channel.onAir) : '';
        break;
      case 'linked':
        cells[id] = channel.kind === 'repeater' ? formatLinkedColumn(channel) : '';
        break;
      default:
        cells[id] = '';
    }
  }

  return cells;
}

function radioRowCells(channel: ChannelPrintRadioRow, columnIds: readonly string[]): Record<string, string> {
  const cells: Record<string, string> = {
    channelNumber: String(channel.channelNumber),
    name: channel.name,
    band: channel.band,
    transmit: channel.transmit,
    receive: channel.receive,
    txTone: channel.txTone || '—',
    rxTone: channel.rxTone || '—',
    toneType: channel.toneType || '—',
  };

  for (const id of columnIds) {
    if (id in cells) {
      continue;
    }

    cells[id] = channel.extras[id] ?? '';
  }

  return cells;
}

function walletLineFromRadio(channel: ChannelPrintRadioRow): ChannelPrintWalletLine {
  return {
    slot: String(channel.channelNumber),
    name: channel.name,
    rx: channel.receive,
    offset: formatPrintOffset({
      receiveFrequencyHz: channel.receiveFrequencyHz,
      transmitFrequencyHz: channel.transmitFrequencyHz,
      settings: channel.settings,
    }),
    tone: formatPrintTone(channel.txTone, channel.rxTone),
  };
}

function walletLineFromLibrary(channel: ChannelPrintLibraryRow): ChannelPrintWalletLine {
  const notes = channel.notes?.trim();

  return {
    name: channel.name,
    rx: formatFrequencyMHz(channel.receiveFrequency),
    offset: formatPrintOffset({
      receiveFrequencyHz: channel.receiveFrequency,
      transmitFrequencyHz: channel.transmitFrequency,
    }),
    tone: formatSavedTone(channel.transmitTone) || formatSavedTone(channel.receiveTone) || '—',
    notes: notes || undefined,
  };
}

export function buildRadioPrintDocument(input: BuildRadioPrintDocumentInput): ChannelPrintDocument {
  const extraColumns = extraChannelTableFields(input.extraFields.map((field) => ({ fieldId: field.fieldId }))).map(
    (field) => {
      const label = input.extraFields.find((entry) => entry.fieldId === field.fieldId)?.label ?? field.fieldId;
      return { id: field.fieldId, header: label };
    },
  );
  const columns = [...RADIO_CORE_COLUMNS, ...extraColumns];
  const columnIds = columns.map((column) => column.id);
  const sorted = [...input.channels].sort((left, right) => left.channelNumber - right.channelNumber);

  const headerLines = [
    { label: 'Radio', value: input.cardName },
    { label: 'Model', value: `${input.manufacturer} · ${input.model}` },
  ];

  if (input.callSign) {
    headerLines.push({ label: 'Call sign', value: input.callSign });
  }

  headerLines.push({ label: 'Printed', value: input.printedOn });

  if (input.layout === 'wallet') {
    return {
      layout: 'wallet',
      title: 'HamBench channel card',
      headerLines,
      columns: [],
      rows: [],
      walletLines: sorted.map((channel) => walletLineFromRadio(channel)),
    };
  }

  return {
    layout: 'full',
    title: 'HamBench channel card',
    headerLines,
    columns,
    rows: sorted.map((channel) => radioRowCells(channel, columnIds)),
    walletLines: [],
  };
}

export function buildLibraryPrintDocument(input: BuildLibraryPrintDocumentInput): ChannelPrintDocument {
  const includeDistance = input.visibleColumnIds.includes('distance');
  const columnIds = libraryPrintColumnIds(input.visibleColumnIds, includeDistance, input.matchVisibleColumns);
  const columns = columnIds.map((id) => ({ id, header: LIBRARY_COLUMN_HEADERS[id] ?? id }));

  const headerLines = [{ label: 'Group', value: input.groupLabel }];

  if (input.callSign) {
    headerLines.push({ label: 'Call sign', value: input.callSign });
  }

  headerLines.push({ label: 'Printed', value: input.printedOn });

  if (input.layout === 'wallet') {
    return {
      layout: 'wallet',
      title: 'HamBench channel card',
      headerLines,
      columns: [],
      rows: [],
      walletLines: input.rows.map((channel) => walletLineFromLibrary(channel)),
    };
  }

  return {
    layout: 'full',
    title: 'HamBench channel card',
    headerLines,
    columns,
    rows: input.rows.map((channel) => libraryRowCells(channel, columnIds)),
    walletLines: [],
  };
}

export function formatChannelPrintDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function emptyPrintReason(rowCount: number): string | undefined {
  if (rowCount === 0) {
    return 'There are no channels to print.';
  }

  return undefined;
}
