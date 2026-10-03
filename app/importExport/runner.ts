import { getCurrentInstance, inject } from 'vue';
import { radioCardIdKey } from '~/composables/radio-card-context';
import { importExportEntry, runImportExport } from '~/importExport/registry';
import type { ImportExportDefinition, ImportExportHandlerInput, ImportExportHandlerResult } from '~/importExport/types';

/**
 * Look up a registry entry and run it.
 * Inside a radio card, the card id is sent as `sessionId` unless the caller set one.
 */
export function useImportExportRunner(): {
  entry: (id: string) => ImportExportDefinition;
  run: (id: string, input?: ImportExportHandlerInput) => Promise<ImportExportHandlerResult>;
} {
  const injected = getCurrentInstance() ? inject(radioCardIdKey, undefined) : undefined;

  return {
    entry: importExportEntry,
    run: (id, input = {}) => {
      if (input.sessionId === undefined && injected?.value) {
        return runImportExport(id, { ...input, sessionId: injected.value });
      }

      return runImportExport(id, input);
    },
  };
}
