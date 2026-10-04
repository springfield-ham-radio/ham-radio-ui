import { getCurrentInstance, inject } from 'vue';
import { radioCardIdKey } from '~/composables/radio-card-context';
import { channelImportExport, importExportEntry, reportUnknownImportExport, runImportExport } from '~/importExport/registry';
import type { ImportExportDefinition, ImportExportHandlerInput, ImportExportHandlerResult } from '~/importExport/types';

function toastUnknownImportExport(id: string): void {
  reportUnknownImportExport(id);

  try {
    useToast().add({
      title: 'Could not run that action',
      description: `Unknown import/export id "${id}"`,
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } catch {
    // Unit tests and other non-Nuxt callers have no toast app.
  }
}

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
    entry: (id) => {
      if (!channelImportExport.get(id)) {
        toastUnknownImportExport(id);
      }

      return importExportEntry(id);
    },
    run: (id, input = {}) => {
      if (!channelImportExport.get(id)) {
        toastUnknownImportExport(id);
        return Promise.resolve({ cancelled: true });
      }

      if (input.sessionId === undefined && injected?.value) {
        return runImportExport(id, { ...input, sessionId: injected.value });
      }

      return runImportExport(id, input);
    },
  };
}
