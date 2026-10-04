import { IMPORT_EXPORT_IDS } from '~/importExport/ids';
import { bindImportExportAction } from '~/importExport/registry';

/**
 * Point registry ids at the existing radio and library flows.
 * Buttons and the Radio menu call `runImportExport` instead of those functions.
 */
export default defineNuxtPlugin(() => {
  const radio = useRadio();
  const channels = useSavedChannels();

  bindImportExportAction(IMPORT_EXPORT_IDS.readFromRadio, (input) => {
    radio.openReadFromRadio(input.sessionId);
    return {};
  });
  bindImportExportAction(IMPORT_EXPORT_IDS.writeToRadio, (input) => {
    radio.openWriteToRadio(input.sessionId);
    return {};
  });
  bindImportExportAction(IMPORT_EXPORT_IDS.openMemory, (input) => radio.openMemoryFile(input.sessionId));
  bindImportExportAction(IMPORT_EXPORT_IDS.saveMemory, (input) => radio.saveMemoryFile(input.sessionId));
  bindImportExportAction(IMPORT_EXPORT_IDS.saveMemoryAs, (input) => radio.saveMemoryFileAs(input.sessionId));
  bindImportExportAction(IMPORT_EXPORT_IDS.saveToLibrary, async (input) => ({
    count: await channels.saveChannels([...(input.channels ?? [])]),
  }));
  bindImportExportAction(IMPORT_EXPORT_IDS.addToRadio, async (input) => ({
    count: await radio.addChannels([...(input.programmedChannels ?? [])], input.sessionId),
  }));
  bindImportExportAction(IMPORT_EXPORT_IDS.addFromLibrary, async (input) => ({
    count: await radio.addChannels([...(input.programmedChannels ?? [])], input.sessionId),
  }));
  bindImportExportAction(IMPORT_EXPORT_IDS.restoreRadioImage, async (input) => {
    const fileName = input.file?.name;

    if (!fileName) {
      return { cancelled: true };
    }

    const restored = await radio.restoreRadioImageBackup(fileName);
    return { count: restored ? 1 : 0 };
  });
  bindImportExportAction(IMPORT_EXPORT_IDS.importChannelsCsv, async (input) => ({
    count: await channels.importLibraryCsv(input),
  }));
  bindImportExportAction(IMPORT_EXPORT_IDS.exportChannelsCsv, async (input) => {
    await channels.exportLibraryCsv(input);
    return {};
  });
});
