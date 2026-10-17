import { describe, expect, it } from 'vitest';
import { IMPORT_EXPORT_IDS } from '~/importExport/ids';
import {
  CHANNEL_LIBRARY_FILE_IMPORT_EXPORT_IDS,
  channelLibraryFileExportRows,
  channelLibraryFileImportSources,
} from '~/importExport/channel-file-catalog';
import { importExportContext } from '~/importExport/registry';

describe('channel file import/export catalog', () => {
  it('lists only the channel library CSV formats', () => {
    expect(CHANNEL_LIBRARY_FILE_IMPORT_EXPORT_IDS).toEqual([
      IMPORT_EXPORT_IDS.importChannelsCsv,
      IMPORT_EXPORT_IDS.exportChannelsCsv,
      IMPORT_EXPORT_IDS.exportChannelsChirpCsv,
    ]);
  });

  it('includes descriptions and availability for import and export rows', () => {
    const open = importExportContext({ libraryLocked: false });
    const locked = importExportContext({ libraryLocked: true });

    const importRow = channelLibraryFileImportSources(open)[0]!;
    const exportRows = channelLibraryFileExportRows(open);

    expect(importRow.id).toBe(IMPORT_EXPORT_IDS.importChannelsCsv);
    expect(importRow.description).toContain('HamBench');
    expect(importRow.available).toBe(true);

    expect(exportRows.map((row) => row.id)).toEqual([
      IMPORT_EXPORT_IDS.exportChannelsCsv,
      IMPORT_EXPORT_IDS.exportChannelsChirpCsv,
    ]);
    expect(exportRows[0]?.description).toContain('HamBench');
    expect(exportRows[1]?.description).toContain('CHIRP');

    const lockedImport = channelLibraryFileImportSources(locked)[0]!;
    expect(lockedImport.available).toBe(false);
    expect(lockedImport.reason).toMatch(/Built-in/);
    expect(channelLibraryFileExportRows(locked).every((row) => row.available)).toBe(true);
  });
});
