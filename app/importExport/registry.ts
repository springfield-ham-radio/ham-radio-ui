import { registerBuiltinImportExport } from '~/importExport/builtins';
import type {
  ImportExportAvailabilityContext,
  ImportExportCategory,
  ImportExportDefinition,
  ImportExportHandler,
  ImportExportKind,
  ImportExportListFilter,
  ImportExportMatchQuery,
} from '~/importExport/types';

const KINDS = new Set<ImportExportKind>(['source', 'target']);
const CATEGORIES = new Set<ImportExportCategory>(['file', 'radio', 'online']);

/**
 * Fills omitted availability flags with false.
 * `token` stays unset until a caller passes one.
 */
export function importExportContext(
  partial: Partial<ImportExportAvailabilityContext> = {},
): ImportExportAvailabilityContext {
  return {
    radioOpen: false,
    memoryLoaded: false,
    tauri: false,
    ...partial,
  };
}

export function importExportAvailability(
  entry: ImportExportDefinition,
  context: ImportExportAvailabilityContext,
): { available: true } | { available: false; reason?: string } {
  if (!entry.available) {
    return { available: true };
  }

  const result = entry.available(context);

  if (result === true) {
    return { available: true };
  }

  if (result === false) {
    return { available: false };
  }

  return { available: false, reason: result };
}

/**
 * In-memory catalog of channel import sources and export targets.
 * The app shares {@link channelImportExport}. Tests build their own.
 */
export interface ImportExportRegistry {
  register(definition: ImportExportDefinition): void;
  get(id: string): ImportExportDefinition | undefined;
  require(id: string): ImportExportDefinition;
  list(filter?: ImportExportListFilter): ImportExportDefinition[];
  matching(query: ImportExportMatchQuery): ImportExportDefinition[];
}

export function createImportExportRegistry(): ImportExportRegistry {
  const entries: ImportExportDefinition[] = [];
  const byId = new Map<string, ImportExportDefinition>();

  function register(definition: ImportExportDefinition): void {
    const id = definition.id.trim();

    if (id.length === 0) {
      throw new Error('Import/export id is empty');
    }

    if (byId.has(id)) {
      throw new Error(`Import/export id "${id}" is already registered`);
    }

    if (!KINDS.has(definition.kind)) {
      throw new Error(`Import/export "${id}" has an unknown kind`);
    }

    if (!CATEGORIES.has(definition.category)) {
      throw new Error(`Import/export "${id}" has an unknown category`);
    }

    if (typeof definition.handler !== 'function') {
      throw new Error(`Import/export "${id}" is missing a handler`);
    }

    const stored: ImportExportDefinition = { ...definition, id };
    entries.push(stored);
    byId.set(id, stored);
  }

  function list(filter: ImportExportListFilter = {}): ImportExportDefinition[] {
    const availableOnly = filter.availableOnly ?? filter.context !== undefined;

    return entries.filter((entry) => {
      if (filter.kind !== undefined && entry.kind !== filter.kind) {
        return false;
      }

      if (filter.category !== undefined && entry.category !== filter.category) {
        return false;
      }

      if (availableOnly && filter.context && !importExportAvailability(entry, filter.context).available) {
        return false;
      }

      return true;
    });
  }

  function matching(query: ImportExportMatchQuery): ImportExportDefinition[] {
    return list(query).filter((entry) => {
      if (query.fileName !== undefined && !importExportAcceptsExtension(entry, query.fileName)) {
        return false;
      }

      if (query.mimeType !== undefined && !importExportAcceptsMime(entry, query.mimeType)) {
        return false;
      }

      return true;
    });
  }

  return {
    register,
    get: (id) => byId.get(id),
    require: (id) => {
      const entry = byId.get(id);

      if (!entry) {
        throw new Error(`Unknown import/export id "${id}"`);
      }

      return entry;
    },
    list,
    matching,
  };
}

/**
 * Shared catalog.
 * Built-ins are registered here, as this module loads, so a component can look
 * up `read-from-radio` during setup without importing `builtins` first.
 */
export const channelImportExport = createImportExportRegistry();

registerBuiltinImportExport(channelImportExport);

const reportedMissingIds = new Set<string>();

/** Log a missing id once. Callers keep rendering instead of throwing a page error. */
export function reportUnknownImportExport(id: string): void {
  if (reportedMissingIds.has(id)) {
    return;
  }

  reportedMissingIds.add(id);
  console.error(`Unknown import/export id "${id}"`);
}

function missingImportExportEntry(id: string): ImportExportDefinition {
  reportUnknownImportExport(id);

  return {
    id,
    label: 'Unavailable',
    icon: 'i-lucide-circle-alert',
    kind: 'source',
    category: 'file',
    handler: () => ({ cancelled: true }),
  };
}

/**
 * UI actions bound at startup (file dialogs, radio read/write, toasts).
 * Kept off the definition so tests can call the data handler without Nuxt.
 */
const actions = new Map<string, ImportExportHandler>();

/**
 * Replace the UI action for an id on the shared catalog.
 * Card-scoped work reads `input.sessionId` so a click on one radio card
 * does not follow whichever card last called `useRadio`.
 */
export function bindImportExportAction(id: string, handler: ImportExportHandler): void {
  if (!channelImportExport.get(id)) {
    reportUnknownImportExport(id);
    return;
  }

  actions.set(id, handler);
}

/**
 * Run the bound UI action when one exists, otherwise the definition handler.
 * Menus, toolbar buttons, and shortcuts call this.
 */
export async function runImportExport(
  id: string,
  input: Parameters<ImportExportHandler>[0] = {},
): Promise<Awaited<ReturnType<ImportExportHandler>>> {
  const action = actions.get(id);

  if (action) {
    return action(input);
  }

  const entry = channelImportExport.get(id);

  if (!entry) {
    reportUnknownImportExport(id);
    return { cancelled: true };
  }

  return entry.handler(input);
}

/** Definition handler, ignoring any UI action bound over it. */
export function importExportDataHandler(id: string): ImportExportHandler {
  return importExportEntry(id).handler;
}

export function importExportEntry(id: string): ImportExportDefinition {
  return channelImportExport.get(id) ?? missingImportExportEntry(id);
}

export function importExportShortcut(id: string): string {
  const shortcut = channelImportExport.get(id)?.shortcut;

  if (!shortcut) {
    reportUnknownImportExport(id);
    return '';
  }

  return shortcut;
}

/**
 * Handler placeholder for entries whose work is bound from the radio session.
 * Calling it before startup throws. The bound action is what menus run.
 */
export function unboundImportExportAction(id: string): ImportExportHandler {
  return () => {
    throw new Error(`Import/export action "${id}" is not available in this runtime`);
  };
}

export function importExportAcceptsExtension(entry: ImportExportDefinition, fileName: string): boolean {
  const extension = fileExtension(fileName);

  if (!extension || !entry.fileTypes) {
    return false;
  }

  return entry.fileTypes.some((type) =>
    type.extensions.some((candidate) => normalizeExtension(candidate) === extension),
  );
}

export function importExportAcceptsMime(entry: ImportExportDefinition, mimeType: string): boolean {
  const mime = mimeBase(mimeType);

  if (!mime || !entry.fileTypes) {
    return false;
  }

  return entry.fileTypes.some((type) => type.mimeTypes?.some((candidate) => mimeBase(candidate) === mime) ?? false);
}

export function fileExtension(fileName: string): string {
  const base = fileName.replaceAll('\\', '/').split('/').pop() ?? fileName;
  const dot = base.lastIndexOf('.');

  if (dot <= 0) {
    return '';
  }

  return base.slice(dot + 1).toLowerCase();
}

function normalizeExtension(extension: string): string {
  return extension.trim().replace(/^\./, '').toLowerCase();
}

function mimeBase(mimeType: string): string {
  return mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}
