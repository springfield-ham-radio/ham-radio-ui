import type {
  RadioModuleCatalog,
  RadioModuleCatalogEntry,
  RadioCatalogSource,
  RegistryRadio,
} from '@springfield/ham-radio-registry';
import { isApiVersionCompatible, parseModuleCatalog } from '@springfield/ham-radio-registry';
import { loadRadioConfigFromFile } from '~/utils/load-radio-config';
import { upsertRadioCatalogRecord } from '~/utils/radio-catalog-db';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';
/** Official catalog served via GitHub Pages. */
export const OFFICIAL_MODULE_CATALOG_URL =
  'https://springfield-ham-radio.github.io/radio-module-catalog/catalog.json';

/** Minimum @springfield/ham-radio-api version this app was built against. */
export const APP_HAM_RADIO_API_VERSION = '17.3.0';

export interface InstalledRadioModuleResult {
  moduleId: string;
  version: string;
  installPath: string;
  configPaths: string[];
}

export interface InstallModuleRadiosResult {
  moduleId: string;
  version: string;
  radios: RegistryRadio[];
  source: RadioCatalogSource;
}

/**
 * Fetch and validate the official module catalog.
 */
export async function fetchOfficialModuleCatalog(
  catalogUrl: string = OFFICIAL_MODULE_CATALOG_URL,
): Promise<RadioModuleCatalog> {
  const response = await fetch(catalogUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch radio module catalog (HTTP ${response.status})`);
  }

  const text = await response.text();
  return parseModuleCatalog(text);
}

function assertApiCompatible(entry: RadioModuleCatalogEntry): void {
  if (!isApiVersionCompatible(APP_HAM_RADIO_API_VERSION, entry.minApiVersion)) {
    throw new Error(
      `Module ${entry.id} requires ham-radio-api ${entry.minApiVersion} or newer (app has ${APP_HAM_RADIO_API_VERSION})`,
    );
  }
}

async function hydrateConfigsIntoCatalog(
  configPaths: string[],
  source: RadioCatalogSource,
  sourcePath?: string,
): Promise<RegistryRadio[]> {
  const { invoke } = await import('@tauri-apps/api/core');
  const radios: RegistryRadio[] = [];

  for (const configPath of configPaths) {
    const text = await invoke<string>('load_text_file', { path: configPath });
    const radio = await loadRadioConfigFromFile(configPath, text);
    await upsertRadioCatalogRecord(radio, source, {
      sourcePath: sourcePath ?? configPath,
    });
    radios.push(radio);
  }

  return radios;
}

/**
 * Download an official catalog module, verify integrity, and upsert radios as `installed`.
 */
export async function installOfficialModule(
  entry: RadioModuleCatalogEntry,
): Promise<InstallModuleRadiosResult> {
  if (!isTauriRuntime()) {
    throw new Error('Installing radio modules requires the Tauri desktop app.');
  }

  assertApiCompatible(entry);

  const { invoke } = await import('@tauri-apps/api/core');
  const installed = await invoke<InstalledRadioModuleResult>('download_and_install_radio_module', {
    url: entry.downloadUrl,
    integrity: entry.integrity,
    moduleId: entry.id,
    version: entry.version,
  });

  const radios = await hydrateConfigsIntoCatalog(installed.configPaths, 'installed', installed.installPath);

  return {
    moduleId: installed.moduleId,
    version: installed.version,
    radios,
    source: 'installed',
  };
}

/**
 * Install a local module zip without catalog integrity (caller must warn the user).
 */
export async function installLocalModuleZip(
  zipPath: string,
  moduleId: string,
  version: string,
): Promise<InstallModuleRadiosResult> {
  if (!isTauriRuntime()) {
    throw new Error('Installing radio modules requires the Tauri desktop app.');
  }

  const { invoke } = await import('@tauri-apps/api/core');
  const installed = await invoke<InstalledRadioModuleResult>('install_radio_module_from_zip', {
    zipPath,
    moduleId,
    version,
    integrity: null,
  });

  const radios = await hydrateConfigsIntoCatalog(installed.configPaths, 'user', installed.installPath);

  return {
    moduleId: installed.moduleId,
    version: installed.version,
    radios,
    source: 'user',
  };
}

/**
 * Install a single local config JSON (and sibling $refs) as an unverified user radio.
 */
export async function installLocalConfigJson(path: string): Promise<InstallModuleRadiosResult> {
  if (!isTauriRuntime()) {
    throw new Error('Installing radio modules requires the Tauri desktop app.');
  }

  const { invoke } = await import('@tauri-apps/api/core');
  const text = await invoke<string>('load_text_file', { path });
  const radio = await loadRadioConfigFromFile(path, text);
  await upsertRadioCatalogRecord(radio, 'user', { sourcePath: path });

  return {
    moduleId: radio.metadata?.moduleId || radio.id.manufacturer.toLowerCase(),
    version: radio.version || '0.0.0',
    radios: [radio],
    source: 'user',
  };
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index < 0 ? normalized : normalized.slice(index + 1);
}

function moduleIdFromZipName(fileName: string): string {
  const withoutExt = fileName.replace(/\.zip$/i, '');
  const match = withoutExt.match(/^radio-module-(.+?)(?:-\d+\.\d+\.\d+.*)?$/i);
  return match?.[1]?.toLowerCase() || withoutExt.toLowerCase() || 'local';
}

function versionFromZipName(fileName: string): string {
  const match = fileName.match(/(\d+\.\d+\.\d+[^-]*)/);
  return match?.[1] || '0.0.0';
}

/**
 * Prompt for a local module zip or config JSON and return the chosen path + kind.
 */
export async function pickLocalModuleFile(): Promise<
  { path: string; kind: 'zip' | 'json' } | undefined
> {
  if (!isTauriRuntime()) {
    return undefined;
  }

  const { open } = await import('@tauri-apps/plugin-dialog');
  const path = await open({
    title: 'Install Radio Module',
    multiple: false,
    directory: false,
    filters: [
      { name: 'Radio Module', extensions: ['zip', 'json'] },
      { name: 'Module Zip', extensions: ['zip'] },
      { name: 'Config JSON', extensions: ['json'] },
    ],
  });

  if (typeof path !== 'string') {
    return undefined;
  }

  const lower = path.toLowerCase();

  if (lower.endsWith('.zip')) {
    return { path, kind: 'zip' };
  }

  if (lower.endsWith('.json')) {
    return { path, kind: 'json' };
  }

  throw new Error('Choose a .zip module package or a .json radio configuration');
}

/**
 * Install a picked local file after the caller has shown the at-your-own-risk warning.
 */
export async function installPickedLocalModuleFile(
  picked: { path: string; kind: 'zip' | 'json' },
): Promise<InstallModuleRadiosResult> {
  if (picked.kind === 'json') {
    return installLocalConfigJson(picked.path);
  }

  const fileName = basename(picked.path);
  return installLocalModuleZip(picked.path, moduleIdFromZipName(fileName), versionFromZipName(fileName));
}
