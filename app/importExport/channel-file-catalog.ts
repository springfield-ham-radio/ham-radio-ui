import { IMPORT_EXPORT_IDS, type ImportExportId } from '~/importExport/ids';
import { channelImportExport, importExportAvailability } from '~/importExport/registry';
import type { ImportExportAvailabilityContext, ImportExportDefinition } from '~/importExport/types';

/** File transfers listed on the Channels Import / Export dialog. */
export const CHANNEL_LIBRARY_FILE_IMPORT_EXPORT_IDS: readonly ImportExportId[] = [
  IMPORT_EXPORT_IDS.importChannelsCsv,
  IMPORT_EXPORT_IDS.importChannelsPack,
  IMPORT_EXPORT_IDS.exportChannelsCsv,
  IMPORT_EXPORT_IDS.exportChannelsChirpCsv,
  IMPORT_EXPORT_IDS.exportChannelsPack,
];

export interface ChannelFileImportExportRow {
  id: ImportExportId;
  label: string;
  icon: string;
  description: string;
  available: boolean;
  reason?: string;
}

function rowForEntry(entry: ImportExportDefinition, context: ImportExportAvailabilityContext): ChannelFileImportExportRow {
  const availability = importExportAvailability(entry, context);

  return {
    id: entry.id as ImportExportId,
    label: entry.label,
    icon: entry.icon,
    description: entry.description ?? '',
    available: availability.available,
    reason: availability.available ? undefined : availability.reason,
  };
}

export function channelLibraryFileImportRows(
  context: ImportExportAvailabilityContext,
): ChannelFileImportExportRow[] {
  return CHANNEL_LIBRARY_FILE_IMPORT_EXPORT_IDS.map((id) =>
    rowForEntry(channelImportExport.require(id), context),
  );
}

const CHANNEL_LIBRARY_FILE_EXPORT_IDS: readonly ImportExportId[] = [
  IMPORT_EXPORT_IDS.exportChannelsCsv,
  IMPORT_EXPORT_IDS.exportChannelsChirpCsv,
  IMPORT_EXPORT_IDS.exportChannelsPack,
];

export function channelLibraryFileExportRows(
  context: ImportExportAvailabilityContext,
): ChannelFileImportExportRow[] {
  return CHANNEL_LIBRARY_FILE_EXPORT_IDS.map((id) => rowForEntry(channelImportExport.require(id), context));
}

export function channelLibraryFileImportSources(
  context: ImportExportAvailabilityContext,
): ChannelFileImportExportRow[] {
  return channelLibraryFileImportRows(context).filter(
    (row) => row.id === IMPORT_EXPORT_IDS.importChannelsCsv || row.id === IMPORT_EXPORT_IDS.importChannelsPack,
  );
}
