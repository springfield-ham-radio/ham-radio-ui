import { IMPORT_EXPORT_IDS } from '~/importExport/ids';
import type { ImportExportRegistry } from '~/importExport/registry';
import type { ImportExportDefinition, ImportExportHandler } from '~/importExport/types';
import {
  buildChannelPackDocument,
  CHANNEL_PACK_FILE_EXTENSION,
  parseChannelPack,
  serializeChannelPack,
} from '~/utils/channel-pack';
import { serializeSavedChannelsChirpCsv } from '~/utils/chirp-csv';
import { parseSavedChannelsCsv, serializeSavedChannelsCsv } from '~/utils/saved-channels-csv';

const CSV_FILE = {
  description: 'CSV',
  extensions: ['csv'],
  mimeTypes: ['text/csv'],
} as const;

const MEMORY_FILE = {
  description: 'Radio Memory',
  extensions: ['json'],
  mimeTypes: ['application/json'],
} as const;

const PACK_FILE = {
  description: 'Channel pack',
  extensions: [CHANNEL_PACK_FILE_EXTENSION],
  mimeTypes: ['application/json'],
} as const;

/**
 * Built-in sources and targets.
 *
 * CSV import is one source. It accepts the HamBench library CSV and the
 * RepeaterBook and CHIRP CSV dialects that `parseSavedChannelsCsv` already detects.
 *
 * TODO(phase-5): register an `online` RepeaterBook source that reads `input.token`
 * and returns a reason from `available` when `context.token` is absent.
 */
export function registerBuiltinImportExport(registry: ImportExportRegistry): void {
  const csvSource: ImportExportDefinition = {
    id: IMPORT_EXPORT_IDS.importChannelsCsv,
    label: 'Import CSV',
    description: 'HamBench library CSV, RepeaterBook export, or CHIRP CSV.',
    icon: 'i-lucide-file-up',
    kind: 'source',
    category: 'file',
    fileTypes: [CSV_FILE],
    available: (context) => (context.libraryLocked ? 'Built-in groups cannot be changed' : true),
    handler: (input) => {
      const text = input.file?.text;

      if (text === undefined) {
        throw new Error('CSV import needs file text');
      }

      return { document: parseSavedChannelsCsv(text), text };
    },
  };

  const csvTarget: ImportExportDefinition = {
    id: IMPORT_EXPORT_IDS.exportChannelsCsv,
    label: 'Export CSV',
    description: 'Portable HamBench library CSV with notes and repeater fields.',
    icon: 'i-lucide-file-down',
    kind: 'target',
    category: 'file',
    fileTypes: [CSV_FILE],
    handler: (input) => {
      if (!input.savedChannels) {
        throw new Error('CSV export needs saved channels');
      }

      const text = serializeSavedChannelsCsv([...input.savedChannels]);
      return { text, document: parseSavedChannelsCsv(text) };
    },
  };

  const packSource: ImportExportDefinition = {
    id: IMPORT_EXPORT_IDS.importChannelsPack,
    label: 'Import pack',
    description: 'HamBench channel pack (.hpack) for one library group.',
    icon: 'i-lucide-package-open',
    kind: 'source',
    category: 'file',
    fileTypes: [PACK_FILE],
    handler: (input) => {
      const text = input.file?.text;

      if (text === undefined) {
        throw new Error('Channel pack import needs file text');
      }

      return { channelPack: parseChannelPack(text), text };
    },
  };

  const packTarget: ImportExportDefinition = {
    id: IMPORT_EXPORT_IDS.exportChannelsPack,
    label: 'Export pack',
    description: 'Versioned HamBench channel pack for one library group.',
    icon: 'i-lucide-package',
    kind: 'target',
    category: 'file',
    fileTypes: [PACK_FILE],
    available: (context) =>
      context.packExportLocked ? 'Open a group you created to export a channel pack' : true,
    handler: (input) => {
      if (!input.savedChannels) {
        throw new Error('Channel pack export needs saved channels');
      }

      const exportInput = input.channelPackExport;

      if (!exportInput) {
        throw new Error('Channel pack export needs metadata');
      }

      const document = buildChannelPackDocument(exportInput.metadata, [...input.savedChannels], {
        includeRepeaterBook: exportInput.includeRepeaterBook,
      });
      const text = serializeChannelPack(document);

      return { text, channelPack: document };
    },
  };

  const chirpCsvTarget: ImportExportDefinition = {
    id: IMPORT_EXPORT_IDS.exportChannelsChirpCsv,
    label: 'Export CHIRP CSV',
    description: 'CHIRP generic CSV for programming software.',
    icon: 'i-lucide-file-down',
    kind: 'target',
    category: 'file',
    fileTypes: [CSV_FILE],
    handler: (input) => {
      if (!input.savedChannels) {
        throw new Error('CHIRP CSV export needs saved channels');
      }

      const text = serializeSavedChannelsChirpCsv([...input.savedChannels]);
      return { text, document: parseSavedChannelsCsv(text) };
    },
  };

  registry.register(csvSource);
  registry.register(packSource);
  registry.register(csvTarget);
  registry.register(chirpCsvTarget);
  registry.register(packTarget);
  registry.register(radioSource(IMPORT_EXPORT_IDS.readFromRadio, 'Read from Radio', 'i-hambench-radio-read', 'meta_shift_d'));
  registry.register({
    id: IMPORT_EXPORT_IDS.writeToRadio,
    label: 'Write to Radio',
    icon: 'i-hambench-radio-write',
    kind: 'target',
    category: 'radio',
    shortcut: 'meta_shift_u',
    available: (context) => {
      if (!context.memoryLoaded) {
        return 'Open a memory file or read from a radio first';
      }

      if (context.writeSupported === false) {
        return 'This radio does not support writing memory';
      }

      return true;
    },
    handler: unboundImportExportAction(IMPORT_EXPORT_IDS.writeToRadio),
  });
  registry.register({
    id: IMPORT_EXPORT_IDS.openMemory,
    label: 'Open Memory',
    icon: 'i-lucide-folder-open',
    kind: 'source',
    category: 'file',
    shortcut: 'meta_o',
    fileTypes: [MEMORY_FILE],
    available: (context) =>
      context.radioOpen || 'Add a radio on the Radio page, then open a memory file into that card.',
    handler: unboundImportExportAction(IMPORT_EXPORT_IDS.openMemory),
  });
  registry.register(memoryTarget(IMPORT_EXPORT_IDS.saveMemory, 'Save', 'meta_s'));
  registry.register(memoryTarget(IMPORT_EXPORT_IDS.saveMemoryAs, 'Save As', 'meta_shift_s'));
  registry.register({
    id: IMPORT_EXPORT_IDS.saveToLibrary,
    label: 'Save to library',
    icon: 'i-lucide-bookmark',
    kind: 'source',
    category: 'radio',
    available: (context) => context.memoryLoaded || 'Open a memory file or read from a radio first',
    handler: unboundImportExportAction(IMPORT_EXPORT_IDS.saveToLibrary),
  });
  registry.register({
    id: IMPORT_EXPORT_IDS.addToRadio,
    label: 'Add to radio',
    icon: 'i-lucide-radio',
    kind: 'target',
    category: 'radio',
    available: (context) => context.memoryLoaded || 'Open a memory file or read from a radio first',
    handler: unboundImportExportAction(IMPORT_EXPORT_IDS.addToRadio),
  });
  registry.register({
    id: IMPORT_EXPORT_IDS.addFromLibrary,
    label: 'Add from library',
    icon: 'i-lucide-library',
    kind: 'target',
    category: 'radio',
    available: (context) => context.memoryLoaded || 'Open a memory file or read from a radio first',
    handler: unboundImportExportAction(IMPORT_EXPORT_IDS.addFromLibrary),
  });
  registry.register({
    id: IMPORT_EXPORT_IDS.restoreRadioImage,
    label: 'Restore',
    icon: 'i-lucide-archive-restore',
    kind: 'source',
    category: 'file',
    fileTypes: [{ description: 'Radio image backup', extensions: ['img'] }],
    available: (context) => context.tauri || 'Radio image backups are stored in the desktop app',
    handler: unboundImportExportAction(IMPORT_EXPORT_IDS.restoreRadioImage),
  });
}

function unboundImportExportAction(id: string): ImportExportHandler {
  return () => {
    throw new Error(`Import/export action "${id}" is not available in this runtime`);
  };
}

function radioSource(id: string, label: string, icon: string, shortcut: string): ImportExportDefinition {
  return {
    id,
    label,
    icon,
    kind: 'source',
    category: 'radio',
    shortcut,
    handler: unboundImportExportAction(id),
  };
}

function memoryTarget(id: string, label: string, shortcut: string): ImportExportDefinition {
  return {
    id,
    label,
    icon: 'i-lucide-save',
    kind: 'target',
    category: 'file',
    shortcut,
    fileTypes: [MEMORY_FILE],
    available: (context) => context.memoryLoaded || 'Open a memory file or read from a radio first',
    handler: unboundImportExportAction(id),
  };
}
