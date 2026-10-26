import type {
  RadioModuleCatalog,
  RadioModuleCatalogEntry,
  RadioCatalogSource,
  RegistryRadio,
} from '@springfield/ham-radio-registry';
import { isApiVersionCompatible, parseModuleCatalog } from '@springfield/ham-radio-registry';
import { applyCatalogTrustFields } from '~/utils/driver-trust-badge';
import { loadRadioConfigFromFile } from '~/utils/load-radio-config';
import {
  deleteRadioCatalogRecord,
  deleteRadioCatalogRecordsUnderDirectories,
  getRadioCatalogRecord,
  listRadioCatalogRecords,
  type RadioCatalogRecord,
  upsertRadioCatalogRecord,
} from '~/utils/radio-catalog-db';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';
import {
  isStrictSemverVersion,
  moduleIdFromZipName,
  versionFromZipName,
} from '~/utils/radio-module-semver';
import hamRadioApiPackage from '@springfield/ham-radio-api/package.json';

/** Official catalog served via GitHub Pages. */
export const OFFICIAL_MODULE_CATALOG_URL =
  'https://springfield-ham-radio.github.io/radio-module-catalog/catalog.json';

/** Installed @springfield/ham-radio-api version. Catalog minApiVersion is compared against this. */
export const APP_HAM_RADIO_API_VERSION: string = hamRadioApiPackage.version;

const LEGACY_MANUFACTURER_MODULE_IDS = new Set(['kenwood', 'baofeng']);

export interface InstalledRadioModuleResult {
  moduleId: string;
  version: string;
  installPath: string;
  configPaths: string[];
  /** The download replaced an existing directory. That backup stays until commit. */
  replacedPrevious?: boolean;
}

export interface SwitchAllToVerifiedFailure {
  id: string;
  message: string;
}

export interface SwitchAllToVerifiedResult {
  switchedIds: string[];
  failures: SwitchAllToVerifiedFailure[];
}

export interface InstallModuleRadiosResult {
  moduleId: string;
  version: string;
  radios: RegistryRadio[];
  source: RadioCatalogSource;
}

export type OfficialModuleCatalogFailureKind = 'network' | 'incompatible';

export interface OfficialModuleCatalogFailure {
  kind: OfficialModuleCatalogFailureKind;
  title: string;
  detail: string;
  guidance: string;
}

export const OFFICIAL_CATALOG_NETWORK_TITLE = 'Could not reach the official catalog';

export const OFFICIAL_CATALOG_INCOMPATIBLE_TITLE =
  'Official catalog is not compatible with this version of HamBench';

const OFFICIAL_CATALOG_NETWORK_GUIDANCE =
  'Connect to the internet and retry, or install a driver from a local file.';

const OFFICIAL_CATALOG_INCOMPATIBLE_GUIDANCE =
  'Update HamBench to the latest version, or install a driver from a local file.';

export class OfficialModuleCatalogError extends Error {
  readonly kind: OfficialModuleCatalogFailureKind;

  constructor(kind: OfficialModuleCatalogFailureKind, message: string) {
    super(message);
    this.name = 'OfficialModuleCatalogError';
    this.kind = kind;
  }
}

function isCatalogParseFailureMessage(message: string): boolean {
  return (
    message.startsWith('Failed to parse module catalog:') || message.startsWith('Invalid module catalog:')
  );
}

/**
 * Map a failed catalog load to UI copy for network vs parse/validation failures.
 */
export function officialCatalogFailureFromCause(cause: unknown): OfficialModuleCatalogFailure {
  if (cause instanceof OfficialModuleCatalogError) {
    if (cause.kind === 'incompatible') {
      return {
        kind: 'incompatible',
        title: OFFICIAL_CATALOG_INCOMPATIBLE_TITLE,
        detail: cause.message,
        guidance: OFFICIAL_CATALOG_INCOMPATIBLE_GUIDANCE,
      };
    }

    return {
      kind: 'network',
      title: OFFICIAL_CATALOG_NETWORK_TITLE,
      detail: cause.message,
      guidance: OFFICIAL_CATALOG_NETWORK_GUIDANCE,
    };
  }

  const message = cause instanceof Error ? cause.message : 'Failed to load official catalog';

  if (isCatalogParseFailureMessage(message)) {
    return {
      kind: 'incompatible',
      title: OFFICIAL_CATALOG_INCOMPATIBLE_TITLE,
      detail: message,
      guidance: OFFICIAL_CATALOG_INCOMPATIBLE_GUIDANCE,
    };
  }

  return {
    kind: 'network',
    title: OFFICIAL_CATALOG_NETWORK_TITLE,
    detail: message,
    guidance: OFFICIAL_CATALOG_NETWORK_GUIDANCE,
  };
}

/**
 * Fetch and validate the official module catalog.
 */
export async function fetchOfficialModuleCatalog(
  catalogUrl: string = OFFICIAL_MODULE_CATALOG_URL,
): Promise<RadioModuleCatalog> {
  try {
    const response = await fetch(catalogUrl);

    if (!response.ok) {
      throw new OfficialModuleCatalogError(
        'network',
        `Failed to fetch radio module catalog (HTTP ${response.status})`,
      );
    }

    const text = await response.text();

    try {
      const catalog = parseModuleCatalog(text);

      try {
        applyCatalogTrustFields(catalog, JSON.parse(text) as unknown);
      } catch {
        // parseModuleCatalog already accepted this document.
      }

      return catalog;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Invalid module catalog';
      throw new OfficialModuleCatalogError('incompatible', message);
    }
  } catch (cause) {
    if (cause instanceof OfficialModuleCatalogError) {
      throw cause;
    }

    const message = cause instanceof Error ? cause.message : 'Failed to fetch radio module catalog';
    throw new OfficialModuleCatalogError('network', message);
  }
}

function assertApiCompatible(entry: RadioModuleCatalogEntry): void {
  assertMinApiVersionCompatible(entry.id, entry.minApiVersion);
}

/** Validate `minApiVersion` from packed config JSON (local zip installs). */
export function validatePackedConfigMinApiVersion(moduleId: string, configText: string): void {
  const minApiVersion = readMinApiVersionFromConfigText(configText);

  if (!minApiVersion) {
    throw new Error(`Module ${moduleId} has invalid minApiVersion`);
  }

  assertMinApiVersionCompatible(moduleId, minApiVersion);
}

function readMinApiVersionFromConfigText(text: string): string | undefined {
  const parsed = JSON.parse(text) as { minApiVersion?: unknown };

  return typeof parsed.minApiVersion === 'string' ? parsed.minApiVersion : undefined;
}

function assertMinApiVersionCompatible(moduleId: string, minApiVersion: string): void {
  if (!isStrictSemverVersion(minApiVersion)) {
    throw new Error(`Module ${moduleId} has invalid minApiVersion`);
  }

  if (!isApiVersionCompatible(APP_HAM_RADIO_API_VERSION, minApiVersion)) {
    throw new Error(
      `Module ${moduleId} requires ham-radio-api ${minApiVersion} or newer (app has ${APP_HAM_RADIO_API_VERSION})`,
    );
  }
}

async function assertPackedConfigsApiCompatible(configPaths: string[], moduleId: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');

  for (const configPath of configPaths) {
    const text = await invoke<string>('load_text_file', { path: configPath });
    const minApiVersion = readMinApiVersionFromConfigText(text);

    if (!minApiVersion) {
      throw new Error(`Module ${moduleId} has invalid minApiVersion`);
    }

    assertMinApiVersionCompatible(moduleId, minApiVersion);
  }
}

async function hydrateConfigsIntoCatalog(
  configPaths: string[],
  source: RadioCatalogSource,
  sourcePath?: string,
  expectedModelId?: string,
  replaceUserCatalog = false,
  moduleVersion?: string,
): Promise<RegistryRadio[]> {
  const { invoke } = await import('@tauri-apps/api/core');
  const radios: RegistryRadio[] = [];

  for (const configPath of configPaths) {
    const text = await invoke<string>('load_text_file', { path: configPath });
    const radio = await loadRadioConfigFromFile(configPath, text);

    if (expectedModelId && String(radio.id.model) !== expectedModelId) {
      throw new Error(`Module ${expectedModelId} contains radio ${String(radio.id.model)}`);
    }

    await upsertRadioCatalogRecord(radio, source, {
      sourcePath: sourcePath ?? configPath,
      replaceUserCatalog,
      ...(moduleVersion ? { moduleVersion } : {}),
    });
    radios.push(radio);
  }

  return radios;
}

export interface InstalledModuleIdentity {
  modelId: string;
  version: string;
  installPath: string;
  source: RadioCatalogSource;
}

function normalizedInstallPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Why the catalog row does not describe the module that was just written to disk.
 * Undefined when model id, source, module version, and install path all match.
 */
export function catalogInstallMismatch(
  record: Pick<RadioCatalogRecord, 'modelId' | 'version' | 'source' | 'sourcePath'> | undefined,
  expected: InstalledModuleIdentity,
): string | undefined {
  if (!record) {
    return `Installed ${expected.modelId} ${expected.version}, but the catalog has no row for it.`;
  }

  const path = record.sourcePath ?? '';
  const parsed = path ? parseModuleInstallPath(path) : undefined;
  const problems: string[] = [];

  if (record.modelId !== expected.modelId) {
    problems.push(`model ${record.modelId}`);
  }

  if (record.source !== expected.source) {
    problems.push(`source ${record.source}`);
  }

  if (record.version !== expected.version) {
    problems.push(`version ${record.version}`);
  }

  if (normalizedInstallPath(path) !== normalizedInstallPath(expected.installPath)) {
    problems.push(`path ${path || '(missing)'}`);
  }

  if (!parsed || parsed.moduleId !== expected.modelId || parsed.version !== expected.version) {
    problems.push(`install folder ${parsed ? `${parsed.moduleId}/${parsed.version}` : 'unrecognized'}`);
  }

  if (problems.length === 0) {
    return undefined;
  }

  return `Installed ${expected.modelId} ${expected.version} at ${expected.installPath}, but the catalog row still has ${problems.join(', ')}.`;
}

async function assertCatalogMatchesInstall(expected: InstalledModuleIdentity): Promise<void> {
  const record = await getRadioCatalogRecord(expected.modelId);
  const message = catalogInstallMismatch(record, expected);

  if (message) {
    throw new Error(message);
  }
}

/**
 * Download an official catalog radio module, verify integrity, and upsert the config as `installed`.
 */
export async function installOfficialModule(
  entry: RadioModuleCatalogEntry,
  options: { replaceUserCatalog?: boolean } = {},
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

  let catalogUpdated = false;

  try {
    const radios = await hydrateConfigsIntoCatalog(
      installed.configPaths,
      'installed',
      installed.installPath,
      entry.id,
      options.replaceUserCatalog ?? false,
      installed.version,
    );
    await assertCatalogMatchesInstall({
      modelId: entry.id,
      version: installed.version,
      installPath: installed.installPath,
      source: 'installed',
    });
    catalogUpdated = true;
    await settleReplacedInstall(installed, true);

    return {
      moduleId: installed.moduleId,
      version: installed.version,
      radios,
      source: 'installed',
    };
  } catch (cause) {
    if (!catalogUpdated) {
      await settleReplacedInstall(installed, false);
    }
    throw cause;
  }
}

/**
 * Delete the backup of a replaced install, or put that backup back when hydration failed.
 * A brand-new directory is removed on failure so a bad install does not stay on disk.
 */
async function settleReplacedInstall(installed: InstalledRadioModuleResult, keepNewCopy: boolean): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');

  if (installed.replacedPrevious) {
    await invoke(keepNewCopy ? 'commit_radio_module_replace' : 'rollback_radio_module_replace', {
      moduleId: installed.moduleId,
      version: installed.version,
    }).catch(() => undefined);
    return;
  }

  if (!keepNewCopy) {
    await invoke('uninstall_radio_module', {
      moduleId: installed.moduleId,
      version: installed.version,
    }).catch(() => undefined);
  }
}

/**
 * Older unverified module directory to delete after a verified install is in the catalog.
 * Same id and version is the directory the new zip just replaced; that backup is committed
 * separately and must not be uninstalled or the verified copy would be deleted.
 */
export function previousModuleDirectoryToRemove(
  previousSourcePath: string | undefined,
  installedModuleId: string,
  installedVersion: string,
): { moduleId: string; version: string } | undefined {
  const parsed = previousSourcePath ? parseModuleInstallPath(previousSourcePath) : undefined;

  if (!parsed) {
    return undefined;
  }

  if (parsed.moduleId === installedModuleId && parsed.version === installedVersion) {
    return undefined;
  }

  return parsed;
}

async function removeUnverifiedModuleDirectory(
  sourcePath: string | undefined,
  installedModuleId: string,
  installedVersion: string,
): Promise<void> {
  const parsed = previousModuleDirectoryToRemove(sourcePath, installedModuleId, installedVersion);

  if (!parsed) {
    return;
  }

  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('uninstall_radio_module', {
    moduleId: parsed.moduleId,
    version: parsed.version,
  }).catch(() => undefined);
}

/**
 * Replace an unverified local driver with the official catalog module for the same model id.
 * A failed download leaves the local catalog row unchanged.
 */
export async function switchToVerifiedModule(entry: RadioModuleCatalogEntry): Promise<InstallModuleRadiosResult> {
  return replaceUserModuleWithOfficial(entry, 'No unverified local driver is installed');
}

/**
 * Replace a beta or unverified local zip with the official catalog module (explicit downgrade when beta is newer).
 */
export async function replaceWithOfficialModule(entry: RadioModuleCatalogEntry): Promise<InstallModuleRadiosResult> {
  return replaceUserModuleWithOfficial(entry, 'No local driver is installed');
}

async function replaceUserModuleWithOfficial(
  entry: RadioModuleCatalogEntry,
  missingMessage: string,
): Promise<InstallModuleRadiosResult> {
  if (!isTauriRuntime()) {
    throw new Error('Installing radio modules requires the Tauri desktop app.');
  }

  const existing = await getRadioCatalogRecord(entry.id);

  if (!existing || existing.source !== 'user') {
    throw new Error(`${missingMessage} for ${entry.id}`);
  }

  const previousSourcePath = existing.sourcePath;
  const result = await installOfficialModule(entry, { replaceUserCatalog: true });
  await removeUnverifiedModuleDirectory(previousSourcePath, result.moduleId, result.version);

  return result;
}

/**
 * Switch each catalog entry to the verified module.
 * A failure leaves that radio on its local driver and does not stop the rest.
 */
export async function switchAllToVerifiedModules(
  entries: RadioModuleCatalogEntry[],
  switchOne: (entry: RadioModuleCatalogEntry) => Promise<unknown> = switchToVerifiedModule,
): Promise<SwitchAllToVerifiedResult> {
  const switchedIds: string[] = [];
  const failures: SwitchAllToVerifiedFailure[] = [];

  for (const entry of entries) {
    try {
      await switchOne(entry);
      switchedIds.push(entry.id);
    } catch (cause) {
      failures.push({
        id: entry.id,
        message: cause instanceof Error ? cause.message : 'Switch failed',
      });
    }
  }

  return { switchedIds, failures };
}

/**
 * Install the official catalog zip over an installed, beta, or unverified row.
 * The previous module directory is removed only after the catalog row is `installed`.
 * Loose user `.json` paths are left on disk.
 */
export async function updateInstalledModule(
  entry: RadioModuleCatalogEntry,
  previous: Pick<RadioCatalogRecord, 'source' | 'sourcePath'>,
): Promise<InstallModuleRadiosResult> {
  const result = await installOfficialModule(entry, {
    replaceUserCatalog: previous.source === 'user',
  });
  const current = await getRadioCatalogRecord(entry.id);

  if (current?.source === 'installed') {
    await removeUnverifiedModuleDirectory(previous.sourcePath, result.moduleId, result.version);
  }

  return result;
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

  const existing = await getRadioCatalogRecord(moduleId);
  const previousSourcePath = existing?.sourcePath;

  const { invoke } = await import('@tauri-apps/api/core');
  const installed = await invoke<InstalledRadioModuleResult>('install_radio_module_from_zip', {
    zipPath,
    moduleId,
    version,
    integrity: null,
  });

  let catalogUpdated = false;

  try {
    await assertPackedConfigsApiCompatible(installed.configPaths, moduleId);
    const radios = await hydrateConfigsIntoCatalog(
      installed.configPaths,
      'user',
      installed.installPath,
      moduleId,
      false,
      installed.version,
    );
    await assertCatalogMatchesInstall({
      modelId: moduleId,
      version: installed.version,
      installPath: installed.installPath,
      source: 'user',
    });
    catalogUpdated = true;
    await settleReplacedInstall(installed, true);
    await removeUnverifiedModuleDirectory(previousSourcePath, installed.moduleId, installed.version);

    return {
      moduleId: installed.moduleId,
      version: installed.version,
      radios,
      source: 'user',
    };
  } catch (cause) {
    if (!catalogUpdated) {
      await settleReplacedInstall(installed, false);
    }
    throw cause;
  }
}

/** SHA-256 hex digest of a local file (for beta install confirmation). */
export async function sha256HexForLocalFile(path: string): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error('SHA-256 requires the Tauri desktop app.');
  }

  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string>('sha256_file', { path });
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
    moduleId: radio.metadata?.moduleId || radio.id.model.toLowerCase(),
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

/**
 * True when a catalog `config` path refers to this extracted config file.
 */
export function catalogConfigMatchesPath(catalogConfig: string, configPath: string): boolean {
  const wanted = catalogConfig.replace(/\\/g, '/').replace(/^\.\//, '');
  const actual = configPath.replace(/\\/g, '/');

  return actual === wanted || actual.endsWith(`/${wanted}`) || basename(actual) === basename(wanted);
}

const MODULE_INSTALL_PATH_PATTERN = /\/radio-modules\/([^/]+)\/([^/]+)\/?$/;

/** True when `sourcePath` points at an extracted module directory under app data. */
export function isModuleInstallPath(sourcePath: string): boolean {
  return MODULE_INSTALL_PATH_PATTERN.test(sourcePath.replace(/\\/g, '/'));
}

/** Parse module id and version from an app-data module install directory. */
export function parseModuleInstallPath(
  sourcePath: string,
): { moduleId: string; version: string } | undefined {
  const match = sourcePath.replace(/\\/g, '/').match(MODULE_INSTALL_PATH_PATTERN);
  if (!match) {
    return undefined;
  }

  return {
    moduleId: match[1]!,
    version: match[2]!,
  };
}

/** Rewrite the version segment of a module install directory. */
export function moduleInstallPathForVersion(sourcePath: string, version: string): string | undefined {
  const parsed = parseModuleInstallPath(sourcePath);

  if (!parsed) {
    return undefined;
  }

  const normalized = normalizedInstallPath(sourcePath);
  const marker = `/${parsed.moduleId}/${parsed.version}`;

  if (!normalized.endsWith(marker)) {
    return undefined;
  }

  return `${normalized.slice(0, -parsed.version.length)}${version}`;
}

export type ModuleInstallRepairPlan =
  | { action: 'skip' }
  | { action: 'ok' }
  | { action: 'repair'; version: string }
  | { action: 'flag'; message: string };

export interface ModuleInstallFlag {
  modelId: string;
  message: string;
}

/**
 * Decide how to line a catalog row up with the module directories on disk.
 * The directory version is the installed module version. A missing recorded
 * folder is repaired only when one other version directory exists.
 */
export function planModuleInstallRepair(
  record: Pick<RadioCatalogRecord, 'modelId' | 'name' | 'version' | 'sourcePath'>,
  versionsOnDisk: readonly string[],
): ModuleInstallRepairPlan {
  const parsed = record.sourcePath ? parseModuleInstallPath(record.sourcePath) : undefined;

  if (!parsed) {
    return { action: 'skip' };
  }

  const folderPresent = versionsOnDisk.includes(parsed.version);

  if (folderPresent && parsed.version === record.version) {
    return { action: 'ok' };
  }

  if (folderPresent && parsed.version !== record.version) {
    return { action: 'repair', version: parsed.version };
  }

  if (versionsOnDisk.length === 1) {
    return { action: 'repair', version: versionsOnDisk[0]! };
  }

  const label = record.name.trim() || record.modelId;

  if (versionsOnDisk.length === 0) {
    return {
      action: 'flag',
      message: `${label} catalog row points at ${parsed.version}, but that install folder is missing.`,
    };
  }

  return {
    action: 'flag',
    message: `${label} catalog row points at ${parsed.version}, which is missing, and ${versionsOnDisk.length} other versions are on disk.`,
  };
}

/**
 * Repair installed module rows whose folder is missing or whose version column
 * disagrees with that folder. Returns rows that could not be repaired.
 */
export async function reconcileInstalledRadioModules(): Promise<ModuleInstallFlag[]> {
  if (!isTauriRuntime()) {
    return [];
  }

  const flags: ModuleInstallFlag[] = [];
  let records: RadioCatalogRecord[];

  try {
    records = await listRadioCatalogRecords();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Could not read the radio catalog';
    return [{ modelId: '', message }];
  }

  const { invoke } = await import('@tauri-apps/api/core');

  for (const record of records) {
    const parsed = record.sourcePath ? parseModuleInstallPath(record.sourcePath) : undefined;

    if (!parsed || (record.source !== 'installed' && record.source !== 'user') || !record.sourcePath) {
      continue;
    }

    let versionsOnDisk: string[] = [];

    try {
      versionsOnDisk = await invoke<string[]>('list_installed_radio_module_versions', {
        moduleId: parsed.moduleId,
      });
    } catch (cause) {
      flags.push({
        modelId: record.modelId,
        message: cause instanceof Error ? cause.message : `Could not list installs for ${record.modelId}`,
      });
      continue;
    }

    const plan = planModuleInstallRepair(record, versionsOnDisk);

    if (plan.action === 'flag') {
      flags.push({ modelId: record.modelId, message: plan.message });
      continue;
    }

    if (plan.action !== 'repair') {
      continue;
    }

    const installPath = moduleInstallPathForVersion(record.sourcePath, plan.version);

    if (!installPath) {
      flags.push({
        modelId: record.modelId,
        message: `Could not resolve an install path for ${record.modelId} ${plan.version}.`,
      });
      continue;
    }

    try {
      const configPaths = await invoke<string[]>('list_installed_radio_module_configs', {
        moduleId: parsed.moduleId,
        version: plan.version,
      });
      await hydrateConfigsIntoCatalog(
        configPaths,
        record.source,
        installPath,
        record.modelId,
        record.source === 'user',
        plan.version,
      );
      await assertCatalogMatchesInstall({
        modelId: record.modelId,
        version: plan.version,
        installPath,
        source: record.source,
      });
    } catch (cause) {
      flags.push({
        modelId: record.modelId,
        message: cause instanceof Error ? cause.message : `Could not repair ${record.modelId}`,
      });
    }
  }

  return flags;
}

/** True when the install directory used the pre-ADR-0009 manufacturer bundle layout. */
export function isLegacyManufacturerModulePath(sourcePath: string): boolean {
  const parsed = parseModuleInstallPath(sourcePath);

  if (!parsed) {
    return false;
  }

  return LEGACY_MANUFACTURER_MODULE_IDS.has(parsed.moduleId);
}

/**
 * True when the catalog row was added from a local JSON file that we can
 * re-read. HamBench stores a snapshot at install time; pointing at a workspace
 * config would otherwise keep stale serial settings such as `baudRates`.
 */
export function isUserJsonCatalogSourcePath(source: RadioCatalogSource, sourcePath: string | undefined): boolean {
  return source === 'user' && typeof sourcePath === 'string' && sourcePath.toLowerCase().endsWith('.json');
}

/**
 * Re-hydrate user-installed JSON configs from disk so local driver edits appear
 * without a manual reinstall.
 */
export async function reloadUserJsonCatalogRecords(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  const records = await listRadioCatalogRecords();

  for (const record of records) {
    if (!isUserJsonCatalogSourcePath(record.source, record.sourcePath) || record.sourcePath === undefined) {
      continue;
    }

    const path = record.sourcePath;

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const text = await invoke<string>('load_text_file', { path });
      const radio = await loadRadioConfigFromFile(path, text);
      await upsertRadioCatalogRecord(radio, 'user', { sourcePath: path });
    } catch (cause) {
      console.error('Failed to reload radio config from', path, cause);
    }
  }
}

/**
 * Cutover for the retired manufacturer bundles. Safe to call on every launch:
 * missing directories are a no-op, and only catalog rows under those two
 * app-data directories are removed. Saved radios, channels, the log, and user
 * JSON outside those directories stay. Nothing is downloaded.
 */
export async function migrateLegacyManufacturerRadioModules(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  const { invoke } = await import('@tauri-apps/api/core');
  const legacyDirectories = await invoke<string[]>('migrate_legacy_manufacturer_radio_modules');
  await deleteRadioCatalogRecordsUnderDirectories(legacyDirectories);
}

/**
 * Remove one radio from the catalog and its install directory when applicable.
 * Returns the model ids removed from the catalog.
 */
export async function uninstallRadioCatalogRecord(record: RadioCatalogRecord): Promise<string[]> {
  if (!isTauriRuntime()) {
    throw new Error('Removing radio modules requires the Tauri desktop app.');
  }

  if (record.sourcePath && (record.source === 'installed' || isModuleInstallPath(record.sourcePath))) {
    const parsed = parseModuleInstallPath(record.sourcePath);

    if (parsed) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('uninstall_radio_module', {
        moduleId: parsed.moduleId,
        version: parsed.version,
      });
    }
  }

  await deleteRadioCatalogRecord(record.modelId);

  return [record.modelId];
}
