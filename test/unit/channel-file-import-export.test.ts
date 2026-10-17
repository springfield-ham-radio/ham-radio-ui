import { describe, expect, it } from 'vitest';
import { IMPORT_EXPORT_IDS } from '~/importExport/ids';
import {
  CHANNEL_LIBRARY_FILE_IMPORT_EXPORT_IDS,
  channelLibraryFileExportRows,
  channelLibraryFileImportSources,
} from '~/importExport/channel-file-catalog';
import { importExportContext } from '~/importExport/registry';

describe('channel file import/export catalog', () => {
  it('lists channel library CSV and pack formats', () => {
    expect(CHANNEL_LIBRARY_FILE_IMPORT_EXPORT_IDS).toEqual([
      IMPORT_EXPORT_IDS.importChannelsCsv,
      IMPORT_EXPORT_IDS.importChannelsPack,
      IMPORT_EXPORT_IDS.exportChannelsCsv,
      IMPORT_EXPORT_IDS.exportChannelsChirpCsv,
      IMPORT_EXPORT_IDS.exportChannelsPack,
    ]);
  });

  it('includes descriptions and availability for import and export rows', () => {
    const open = importExportContext({ libraryLocked: false });
    const locked = importExportContext({ libraryLocked: true });

    const importRows = channelLibraryFileImportSources(open);
    const exportRows = channelLibraryFileExportRows(open);

    expect(importRows.map((row) => row.id)).toEqual([
      IMPORT_EXPORT_IDS.importChannelsCsv,
      IMPORT_EXPORT_IDS.importChannelsPack,
    ]);
    expect(importRows[0]?.description).toContain('HamBench');
    expect(importRows.every((row) => row.available)).toBe(true);

    expect(exportRows.map((row) => row.id)).toEqual([
      IMPORT_EXPORT_IDS.exportChannelsCsv,
      IMPORT_EXPORT_IDS.exportChannelsChirpCsv,
      IMPORT_EXPORT_IDS.exportChannelsPack,
    ]);
    expect(exportRows[0]?.description).toContain('HamBench');
    expect(exportRows[1]?.description).toContain('CHIRP');

    const lockedImport = channelLibraryFileImportSources(locked);
    expect(lockedImport[0]?.available).toBe(false);
    expect(lockedImport[0]?.reason).toMatch(/Built-in/);
    expect(lockedImport[1]?.available).toBe(true);
    expect(channelLibraryFileExportRows(locked).every((row) => row.available)).toBe(true);
  });

  it('locks pack export when packExportLocked is set', () => {
    const locked = importExportContext({ packExportLocked: true });
    const packExport = channelLibraryFileExportRows(locked).find(
      (row) => row.id === IMPORT_EXPORT_IDS.exportChannelsPack,
    );
    expect(packExport?.available).toBe(false);
    expect(packExport?.reason).toMatch(/group you created/);
  });
});
