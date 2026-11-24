import type { LoadedRadioConfig } from '~/utils/radio-catalog-db';
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

async function readModuleConfigJson(config: LoadedRadioConfig): Promise<unknown | undefined> {
  const sourcePath = config.metadata?.pluginPath;

  if (!sourcePath || !isTauriRuntime()) {
    return undefined;
  }

  const { invoke } = await import('@tauri-apps/api/core');

  try {
    const text = await invoke<string>('load_text_file', { path: sourcePath });
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
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

  const raw = await readModuleConfigJson(config);
  const fromRaw = raw ? parseMenuCaptureConfigFromModule(raw) : [];

  return mergeMenuCaptureIgnore(fromHydrated, fromRaw);
}