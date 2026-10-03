/** Stable ids. Radio menu event names in `src-tauri/src/lib.rs` match the radio and memory ids. */
export const IMPORT_EXPORT_IDS = {
  importChannelsCsv: 'import-channels-csv',
  exportChannelsCsv: 'export-channels-csv',
  readFromRadio: 'read-from-radio',
  writeToRadio: 'write-to-radio',
  openMemory: 'open-memory',
  saveMemory: 'save-memory',
  saveMemoryAs: 'save-memory-as',
  saveToLibrary: 'save-to-library',
  addToRadio: 'add-to-radio',
  addFromLibrary: 'add-from-library',
  restoreRadioImage: 'restore-radio-image',
} as const;

export type ImportExportId = (typeof IMPORT_EXPORT_IDS)[keyof typeof IMPORT_EXPORT_IDS];
