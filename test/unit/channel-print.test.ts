import { describe, expect, it, vi } from 'vitest';
import { Frequency, RadioToneType } from '@springfield/ham-radio-api';
import {
  buildLibraryPrintDocument,
  buildRadioPrintDocument,
  channelsForLibraryPrint,
  formatPrintOffset,
  formatPrintTone,
  libraryColumnIsVisible,
  libraryPrintColumnIds,
  libraryRowCells,
} from '../../app/utils/channel-print.ts';
import {
  CHANNEL_PRINT_STORAGE_KEY,
  clearChannelPrintDocument,
  readChannelPrintDocument,
  storeChannelPrintDocument,
} from '../../app/utils/channel-print-window.ts';
import type { ChannelPrintLibraryRow, ChannelPrintRadioRow } from '../../app/utils/channel-print.ts';

const radioRows: ChannelPrintRadioRow[] = [
  {
    channelNumber: 2,
    name: 'W5KA',
    band: '2 Meter',
    transmit: '146.3400',
    receive: '146.9400',
    txTone: '88.5',
    rxTone: '88.5',
    toneType: 'CTCSS',
    transmitFrequencyHz: 146_340_000,
    receiveFrequencyHz: 146_940_000,
    settings: { duplex: '-' },
    extras: { power: 'High' },
  },
  {
    channelNumber: 12,
    name: '<script>',
    band: '2 Meter',
    transmit: '146.5200',
    receive: '146.5200',
    txTone: '',
    rxTone: '',
    toneType: '',
    transmitFrequencyHz: 146_520_000,
    receiveFrequencyHz: 146_520_000,
    extras: {},
  },
];

describe('channel-print', () => {
  it('sorts radio rows by memory slot and omits blank slots implicitly', () => {
    const document = buildRadioPrintDocument({
      layout: 'full',
      cardName: 'Go-kit',
      manufacturer: 'Yaesu',
      model: 'FT5D',
      callSign: 'KF5UFJ',
      printedOn: 'Oct 17, 2026',
      channels: [...radioRows].reverse(),
      extraFields: [{ fieldId: 'power', label: 'Power' }],
    });

    expect(document.rows.map((row) => row.channelNumber)).toEqual(['2', '12']);
    expect(document.rows[0]?.power).toBe('High');
    expect(document.rows[1]?.name).toBe('<script>');
    expect(document.headerLines).toEqual([
      { label: 'Radio', value: 'Go-kit' },
      { label: 'Model', value: 'Yaesu · FT5D' },
      { label: 'Call sign', value: 'KF5UFJ' },
      { label: 'Printed', value: 'Oct 17, 2026' },
    ]);
  });

  it('builds wallet lines with offset and tone', () => {
    const document = buildRadioPrintDocument({
      layout: 'wallet',
      cardName: 'Go-kit',
      manufacturer: 'Yaesu',
      model: 'FT5D',
      printedOn: 'Oct 17, 2026',
      channels: radioRows,
      extraFields: [],
    });

    expect(document.walletLines[0]).toMatchObject({
      slot: '2',
      offset: '-0.600',
      tone: '88.5',
    });
    expect(document.walletLines[1]?.offset).toBe('simplex');
  });

  it('respects library column visibility when matching the table', () => {
    const ids = libraryPrintColumnIds({ band: false, linked: false }, false, true);
    expect(ids).not.toContain('band');
    expect(ids).not.toContain('linked');
    expect(ids).toContain('name');
    expect(libraryColumnIsVisible('band', { band: false })).toBe(false);
  });

  it('selects library rows for visible, whole-tab, and selected-only scopes', () => {
    const visible = [{ id: 'a' }, { id: 'b' }] as ChannelPrintLibraryRow[];
    const wholeTab = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as ChannelPrintLibraryRow[];
    const selected = [{ id: 'b' }] as ChannelPrintLibraryRow[];

    expect(
      channelsForLibraryPrint({
        scope: 'visible',
        selectedOnly: false,
        selected,
        visible,
        wholeTab,
      }).map((row) => row.id),
    ).toEqual(['a', 'b']);

    expect(
      channelsForLibraryPrint({
        scope: 'whole-tab',
        selectedOnly: false,
        selected,
        visible,
        wholeTab,
      }).map((row) => row.id),
    ).toEqual(['a', 'b', 'c']);

    expect(
      channelsForLibraryPrint({
        scope: 'visible',
        selectedOnly: true,
        selected,
        visible,
        wholeTab,
      }).map((row) => row.id),
    ).toEqual(['b']);
  });

  it('formats library cells and wallet notes without a full-page Notes column', () => {
    const channel: ChannelPrintLibraryRow = {
      id: '1',
      kind: 'repeater',
      name: 'W5KA',
      callsign: 'W5KA',
      transmitFrequency: Frequency(146_340_000),
      receiveFrequency: Frequency(146_940_000),
      transmitTone: { tone: 885, type: RadioToneType.CTCSS },
      receiveTone: { tone: 885, type: RadioToneType.CTCSS },
      band: '2 Meter',
      notes: 'Club net',
      use: 'open',
      onAir: true,
      createdAt: 1,
      updatedAt: 1,
    };

    const cells = libraryRowCells(channel, ['name', 'callsign', 'use', 'onAir']);
    expect(cells.use).toBe('Open');
    expect(cells.onAir).toBe('On-air');
    expect(cells.callsign).toBe('W5KA');

    const hiddenBand = buildLibraryPrintDocument({
      layout: 'full',
      groupLabel: 'Repeaters',
      printedOn: 'Oct 17, 2026',
      rows: [channel],
      columnVisibility: { band: false },
      includeDistance: false,
      matchVisibleColumns: true,
    });
    expect(hiddenBand.columns.map((column) => column.id)).not.toContain('band');
    expect(hiddenBand.columns.map((column) => column.id)).toContain('name');

    const allColumns = buildLibraryPrintDocument({
      layout: 'full',
      groupLabel: 'Repeaters',
      printedOn: 'Oct 17, 2026',
      rows: [channel],
      columnVisibility: { band: false },
      includeDistance: false,
      matchVisibleColumns: false,
    });
    expect(allColumns.columns.map((column) => column.id)).toContain('band');

    const document = buildLibraryPrintDocument({
      layout: 'wallet',
      groupLabel: 'Repeaters',
      printedOn: 'Oct 17, 2026',
      rows: [channel],
      columnVisibility: { name: true },
      includeDistance: false,
      matchVisibleColumns: true,
    });

    expect(document.columns).toEqual([]);
    expect(document.walletLines[0]?.notes).toBe('Club net');
    expect(document.walletLines[0]?.offset).toBe('-0.600');
  });

  it('stores one print payload in localStorage and clears it', () => {
    const memory = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
    });

    storeChannelPrintDocument({
      layout: 'full',
      title: 'HamBench channel card',
      headerLines: [],
      columns: [],
      rows: [{ name: '<b>not html</b>' }],
      walletLines: [],
    });

    expect(memory.get(CHANNEL_PRINT_STORAGE_KEY)).toContain('<b>not html</b>');
    expect(readChannelPrintDocument()?.rows[0]?.name).toBe('<b>not html</b>');

    storeChannelPrintDocument({
      layout: 'wallet',
      title: 'HamBench channel card',
      headerLines: [],
      columns: [],
      rows: [],
      walletLines: [],
    });
    expect([...memory.keys()]).toEqual([CHANNEL_PRINT_STORAGE_KEY]);

    clearChannelPrintDocument();
    expect(memory.has(CHANNEL_PRINT_STORAGE_KEY)).toBe(false);
    vi.unstubAllGlobals();
  });

  it('formats offset and tone helpers', () => {
    expect(
      formatPrintOffset({
        receiveFrequencyHz: 146_940_000,
        transmitFrequencyHz: 146_340_000,
        settings: { duplex: '-' },
      }),
    ).toBe('-0.600');
    expect(formatPrintTone('', '100.0')).toBe('100.0');
  });
});
