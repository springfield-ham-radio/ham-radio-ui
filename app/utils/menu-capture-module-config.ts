import type { LoadedRadioConfig } from '~/utils/radio-catalog-db';
import { getRadioCatalogRecord } from '~/utils/radio-catalog-db';
import {
  mergeMenuCaptureIgnore,
  parseMenuCaptureConfigFromModule,
  type MenuCaptureIgnoreEntry,
} from '~/utils/menu-capture';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';

type ConfigWithCapture = LoadedRadioConfig & { capture?: { ignore?: MenuCaptureIgnoreEntry[] } };

/** Ignore bytes from the hydrated catalog config when it still includes `capture`. */
export function menuCaptureIgnoreFromConfig(config: LoadedRadioConfig | undefined): MenuCaptureIgnoreEntry[] {
  if (!config) {
    return [];
  }

  const capture = (config as ConfigWithCapture).capture;

  if (!capture?.ignore || !Array.isArray(capture.ignore)) {
    return [];
  }

  return capture.ignore;
}

/**
 * Pick `capture.ignore` from raw module JSON texts for one model.
 * Used when catalog hydration does not keep the key.
 */
export function ignoreEntriesFromModuleJson(modelId: string, documents: readonly string[]): MenuCaptureIgnoreEntry[] {
  for (const text of documents) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      continue;
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      continue;
    }

    const id = (parsed as { id?: { model?: unknown } }).id?.model;

    if (id !== undefined && String(id) !== modelId) {
      continue;
    }

    const entries = parseMenuCaptureConfigFromModule(parsed);

    if (entries.length > 0) {
      return entries;
    }
  }

  return [];
}

async function readInstalledModuleJson(config: LoadedRadioConfig): Promise<string[]> {
  if (!isTauriRuntime()) {
    return [];
  }

  const { invoke } = await import('@tauri-apps/api/core');
  const modelId = String(config.id.model);
  const record = await getRadioCatalogRecord(modelId);
  const paths = new Set<string>();

  if (record?.sourcePath?.toLowerCase().endsWith('.json')) {
    paths.add(record.sourcePath);
  }

  const moduleId = config.metadata?.moduleId?.trim();
  const version = record?.version || config.metadata?.moduleVersion?.trim();

  if (moduleId && version) {
    try {
      const listed = await invoke<string[]>('list_installed_radio_module_configs', {
        moduleId,
        version,
      });

      for (const path of listed) {
        paths.add(path);
      }
    } catch {
      // The module directory may not be installed in this profile.
    }
  }

  const documents: string[] = [];

  for (const path of paths) {
    try {
      documents.push(await invoke<string>('load_text_file', { path }));
    } catch {
      // Skip a config the process cannot read.
    }
  }

  return documents;
}

/**
 * Resolve `capture.ignore` from the catalog row and, when needed, the raw module JSON on disk.
 */
export async function resolveMenuCaptureIgnoreForConfig(
  config: LoadedRadioConfig | undefined,
): Promise<MenuCaptureIgnoreEntry[]> {
  const fromHydrated = menuCaptureIgnoreFromConfig(config);

  if (!config) {
    return [];
  }

  if (fromHydrated.length > 0) {
    return fromHydrated;
  }

  const documents = await readInstalledModuleJson(config);

  return mergeMenuCaptureIgnore(fromHydrated, ignoreEntriesFromModuleJson(String(config.id.model), documents));
}