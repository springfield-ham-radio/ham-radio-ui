import { IMPORT_EXPORT_IDS } from '~/importExport/ids';
import type { ImportExportRegistry } from '~/importExport/registry';
import type { ImportExportDefinition, ImportExportHandler } from '~/importExport/types';
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

/**
 * Built-in sources and targets.
 *
 * CSV import is one source. It accepts the HamBench library CSV and the
 * RepeaterBook and CHIRP CSV dialects that `parseSavedChannelsCsv` already detects.
 *
 * TODO(phase-3): Import Channels… / Export Channels… list `registry.list()` and
 * call the data handler with the file the dialog picked. Do not add that UI here.
 * TODO(phase-4): register a CHIRP `.img` source (`chirp-img`, category `file`,
 * extensions `img`) beside `restore-radio-image`, which already matches `.img`.
 * TODO(phase-5): register an `online` RepeaterBook source that reads `input.token`
 * and returns a reason from `available` when `context.token` is absent.
 */
export function registerBuiltinImportExport(registry: ImportExportRegistry): void {
  const csvSource: ImportExportDefinition = {
    id: IMPORT_EXPORT_IDS.importChannelsCsv,
    label: 'Import CSV',
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

  registry.register(csvSource);
  registry.register(csvTarget);
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
