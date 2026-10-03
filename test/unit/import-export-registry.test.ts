import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Frequency, RadioChannelId, RadioToneType } from '@springfield/ham-radio-api';
import { IMPORT_EXPORT_IDS } from '~/importExport/ids';
import { registerBuiltinImportExport } from '~/importExport/builtins';
import {
  channelImportExport,
  createImportExportRegistry,
  importExportAvailability,
  importExportContext,
  importExportDataHandler,
} from '~/importExport/registry';
import type { ImportExportDefinition } from '~/importExport/types';
import type { SavedChannel } from '~/utils/saved-channels-db';

const sample: SavedChannel = {
  id: RadioChannelId('11111111-1111-1111-1111-111111111111'),
  name: 'Local RPT',
  kind: 'channel',
  transmitFrequency: Frequency(146_520_000),
  receiveFrequency: Frequency(146_520_000),
  transmitTone: { tone: 885, type: RadioToneType.CTCSS },
  receiveTone: { tone: 23, type: RadioToneType.DCS },
  notes: 'Club, "main" repeater',
  createdAt: 1_000,
  updatedAt: 2_000,
};

const chirpCsv = `Location,Name,Frequency,Duplex,Offset,Tone,rToneFreq,cToneFreq,DtcsCode,DtcsPolarity,Mode,TStep,Skip,Comment
1,W1AW,146.640000,-,0.600000,Tone,88.5,88.5,023,NN,FM,5.00,,Newington
`;

const menuAccelerators: Array<{ id: string; shortcut: string; accelerator: string }> = [
  { id: IMPORT_EXPORT_IDS.openMemory, shortcut: 'meta_o', accelerator: 'CmdOrCtrl+O' },
  { id: IMPORT_EXPORT_IDS.saveMemory, shortcut: 'meta_s', accelerator: 'CmdOrCtrl+S' },
  { id: IMPORT_EXPORT_IDS.saveMemoryAs, shortcut: 'meta_shift_s', accelerator: 'CmdOrCtrl+Shift+S' },
  { id: IMPORT_EXPORT_IDS.readFromRadio, shortcut: 'meta_shift_d', accelerator: 'CmdOrCtrl+Shift+D' },
  { id: IMPORT_EXPORT_IDS.writeToRadio, shortcut: 'meta_shift_u', accelerator: 'CmdOrCtrl+Shift+U' },
];

function definition(overrides: Partial<ImportExportDefinition> & Pick<ImportExportDefinition, 'id'>): ImportExportDefinition {
  return {
    label: overrides.id,
    icon: 'i-lucide-file',
    kind: 'source',
    category: 'file',
    handler: () => ({}),
    ...overrides,
  };
}

describe('import/export registry', () => {
  it('registers, looks up, and rejects a duplicate id', () => {
    const registry = createImportExportRegistry();
    registry.register(definition({ id: 'alpha' }));

    expect(registry.get('alpha')?.label).toBe('alpha');
    expect(registry.require('alpha').kind).toBe('source');
    expect(registry.get('missing')).toBeUndefined();
    expect(() => registry.require('missing')).toThrow(/Unknown import\/export id "missing"/);
    expect(() => registry.register(definition({ id: 'alpha', kind: 'target' }))).toThrow(/already registered/);
    expect(() => registry.register(definition({ id: '  ' }))).toThrow(/empty/);
    expect(() => registry.register(definition({ id: 'bad-kind', kind: 'sideways' as 'source' }))).toThrow(/unknown kind/);
  });

  it('filters by kind, category, and availability', () => {
    const registry = createImportExportRegistry();
    registry.register(definition({ id: 'file-source', kind: 'source', category: 'file' }));
    registry.register(
      definition({
        id: 'needs-radio',
        kind: 'target',
        category: 'radio',
        available: (context) => context.radioOpen || 'Open a radio first',
      }),
    );
    registry.register(
      definition({
        id: 'repeaterbook-api',
        kind: 'source',
        category: 'online',
        available: (context) => (context.token ? true : 'Add a RepeaterBook token'),
        handler: (input) => {
          if (!input.token) {
            throw new Error('token required');
          }

          return {};
        },
      }),
    );

    expect(registry.list({ kind: 'source' }).map((entry) => entry.id)).toEqual(['file-source', 'repeaterbook-api']);
    expect(registry.list({ category: 'radio' }).map((entry) => entry.id)).toEqual(['needs-radio']);

    const closed = importExportContext();
    expect(registry.list({ context: closed }).map((entry) => entry.id)).toEqual(['file-source']);
    expect(registry.list({ context: closed, availableOnly: false }).map((entry) => entry.id)).toEqual([
      'file-source',
      'needs-radio',
      'repeaterbook-api',
    ]);
    expect(importExportAvailability(registry.require('needs-radio'), closed)).toEqual({
      available: false,
      reason: 'Open a radio first',
    });

    const withToken = importExportContext({ token: 'user-token', radioOpen: true });
    expect(registry.list({ kind: 'source', category: 'online', context: withToken }).map((entry) => entry.id)).toEqual([
      'repeaterbook-api',
    ]);
    expect(registry.list({ context: importExportContext({ radioOpen: true }) }).map((entry) => entry.id)).toEqual([
      'file-source',
      'needs-radio',
    ]);

    const listed = registry.list();
    listed.pop();
    expect(registry.list()).toHaveLength(3);
  });

  it('matches file extensions and MIME types', () => {
    const registry = createImportExportRegistry();
    registerBuiltinImportExport(registry);
    registry.register(
      definition({
        id: 'chirp-img',
        label: 'CHIRP image',
        kind: 'source',
        category: 'file',
        fileTypes: [{ extensions: ['img'], mimeTypes: ['application/octet-stream'] }],
      }),
    );

    expect(registry.matching({ fileName: 'library.CSV', kind: 'source' }).map((entry) => entry.id)).toEqual([
      IMPORT_EXPORT_IDS.importChannelsCsv,
    ]);
    expect(registry.matching({ fileName: 'C:\\radios\\memory.JSON', kind: 'target' }).map((entry) => entry.id)).toEqual([
      IMPORT_EXPORT_IDS.saveMemory,
      IMPORT_EXPORT_IDS.saveMemoryAs,
    ]);
    expect(registry.matching({ fileName: 'backup.img', kind: 'source' }).map((entry) => entry.id)).toEqual([
      IMPORT_EXPORT_IDS.restoreRadioImage,
      'chirp-img',
    ]);
    expect(registry.matching({ fileName: 'log.adi' })).toEqual([]);
    expect(registry.matching({ mimeType: 'text/csv; charset=utf-8', kind: 'target' }).map((entry) => entry.id)).toEqual([
      IMPORT_EXPORT_IDS.exportChannelsCsv,
    ]);
    expect(registry.matching({ fileName: 'notes.txt', mimeType: 'text/csv' })).toEqual([]);
  });

  it('lists the built-in catalog and keeps menu shortcuts aligned', () => {
    const ids = channelImportExport.list().map((entry) => entry.id);
    expect(ids).toEqual(Object.values(IMPORT_EXPORT_IDS));
    expect(new Set(ids).size).toBe(ids.length);

    const rust = readFileSync(resolve(process.cwd(), 'src-tauri/src/lib.rs'), 'utf8');

    for (const menu of menuAccelerators) {
      const entry = channelImportExport.require(menu.id);
      expect(entry.shortcut).toBe(menu.shortcut);
      expect(rust).toContain(`"${menu.id}"`);
      expect(rust).toContain(`"${menu.accelerator}"`);
    }

    expect(channelImportExport.require(IMPORT_EXPORT_IDS.readFromRadio).icon).toBe('i-hambench-radio-read');
    expect(channelImportExport.require(IMPORT_EXPORT_IDS.writeToRadio).icon).toBe('i-hambench-radio-write');

    const idle = importExportContext();
    expect(importExportAvailability(channelImportExport.require(IMPORT_EXPORT_IDS.writeToRadio), idle).available).toBe(
      false,
    );
    expect(
      importExportAvailability(
        channelImportExport.require(IMPORT_EXPORT_IDS.writeToRadio),
        importExportContext({ memoryLoaded: true, writeSupported: false }),
      ).available,
    ).toBe(false);
    expect(
      importExportAvailability(
        channelImportExport.require(IMPORT_EXPORT_IDS.writeToRadio),
        importExportContext({ memoryLoaded: true, writeSupported: true }),
      ).available,
    ).toBe(true);
    expect(
      importExportAvailability(
        channelImportExport.require(IMPORT_EXPORT_IDS.importChannelsCsv),
        importExportContext({ libraryLocked: true }),
      ).available,
    ).toBe(false);
    expect(
      importExportAvailability(channelImportExport.require(IMPORT_EXPORT_IDS.restoreRadioImage), importExportContext({ tauri: true }))
        .available,
    ).toBe(true);
    expect(() => channelImportExport.require(IMPORT_EXPORT_IDS.openMemory).handler({})).toThrow(/not available/);
  });

  it('round-trips library channels through the CSV registry handlers', async () => {
    const exported = await importExportDataHandler(IMPORT_EXPORT_IDS.exportChannelsCsv)({
      savedChannels: [sample, { ...sample, id: RadioChannelId('22222222-2222-2222-2222-222222222222'), kind: 'repeater', use: 'closed', onAir: false, callsign: 'W1AW' }],
    });
    const imported = await importExportDataHandler(IMPORT_EXPORT_IDS.importChannelsCsv)({
      file: { name: 'channel-library.csv', text: exported.text },
    });

    expect(exported.document?.source).toBe('library');
    expect(imported.document?.source).toBe('library');
    expect(imported.document?.channels[0]?.name).toBe('Local RPT');
    expect(imported.document?.channels[0]?.transmitFrequency).toBe(Frequency(146_520_000));
    expect(imported.document?.channels[0]?.receiveFrequency).toBe(Frequency(146_520_000));
    expect(imported.document?.channels[0]?.transmitTone).toEqual({ tone: 885, type: RadioToneType.CTCSS });
    expect(imported.document?.channels[0]?.receiveTone).toEqual({ tone: 23, type: RadioToneType.DCS });
    expect(imported.document?.notes[0]).toBe('Club, "main" repeater');
    expect(imported.document?.kinds[1]).toBe('repeater');
    expect(imported.document?.uses[1]).toBe('closed');
    expect(imported.document?.onAir[1]).toBe(false);
    expect(imported.document?.callsigns[1]).toBe('W1AW');
  });

  it('imports CHIRP CSV through the channel CSV source', async () => {
    const imported = await importExportDataHandler(IMPORT_EXPORT_IDS.importChannelsCsv)({
      file: { name: 'chirp.csv', text: chirpCsv },
    });

    expect(imported.document?.source).toBe('chirp');
    expect(imported.document?.kinds).toEqual(['repeater']);
    expect(imported.document?.channels[0]?.name).toBe('W1AW');
    expect(imported.document?.channels[0]?.receiveFrequency).toBe(Frequency(146_640_000));
    expect(imported.document?.channels[0]?.transmitFrequency).toBe(Frequency(146_040_000));
  });

  it('rejects CSV that the handler cannot parse', () => {
    const read = importExportDataHandler(IMPORT_EXPORT_IDS.importChannelsCsv);
    expect(() => read({})).toThrow(/file text/);
    expect(() => read({ file: { text: 'name,tx_mhz\nA,146.52\n' } })).toThrow(/missing required column/);
    expect(() => importExportDataHandler(IMPORT_EXPORT_IDS.exportChannelsCsv)({})).toThrow(/saved channels/);
  });
});
