import type { RadioModuleCatalogEntry } from '@springfield/ham-radio-registry';
import { compareSemver, isApiVersionCompatible } from '@springfield/ham-radio-registry';
import type { RadioCatalogRecord } from '~/utils/radio-catalog-db';
import { APP_HAM_RADIO_API_VERSION, parseModuleInstallPath } from '~/utils/radio-module-install';
import { compareSemverWithPrerelease, isBetaDriverRecord } from '~/utils/radio-module-semver';

const APP_UPDATE_REQUIRED = 'This radio module requires a newer version of HamBench.';

export interface InstalledRadioListItem {
  record: RadioCatalogRecord;
  catalogEntry?: RadioModuleCatalogEntry;
  updateAvailable: boolean;
  canUpdate: boolean;
  updateBlockedReason?: string;
  canSwitchToVerified: boolean;
  switchBlockedReason?: string;
  canReplaceWithOfficial: boolean;
  replaceBlockedReason?: string;
}

export interface InstalledManufacturerGroup {
  manufacturer: string;
  radios: InstalledRadioListItem[];
}

export interface AvailableRadioModelItem {
  modelId: string;
  name: string;
  entry: RadioModuleCatalogEntry;
  /** True when an official catalog install is present (not a local unverified file). */
  installedOfficially: boolean;
  installedUnverified: boolean;
  installedBeta: boolean;
  canInstall: boolean;
  installBlockedReason?: string;
  canSwitchToVerified: boolean;
  switchBlockedReason?: string;
  canReplaceWithOfficial: boolean;
  replaceBlockedReason?: string;
}

export interface AvailableManufacturerGroup {
  manufacturer: string;
  radios: AvailableRadioModelItem[];
  canInstall: boolean;
  installBlockedReason?: string;
}

/**
 * Model name without a leading manufacturer, so children are not "Baofeng Baofeng UV-5R".
 */
export function radioDisplayName(manufacturer: string, name: string): string {
  const trimmedName = name.trim();
  const prefix = manufacturer.trim();

  if (prefix.length > 0 && trimmedName.toLowerCase().startsWith(prefix.toLowerCase())) {
    const withoutManufacturer = trimmedName.slice(prefix.length).trim();
    return withoutManufacturer.length > 0 ? withoutManufacturer : trimmedName;
  }

  return trimmedName;
}

/**
 * One line for a radio menu: keep the manufacturer once.
 * "Baofeng" plus "Baofeng UV-5R" is "Baofeng UV-5R".
 */
export function radioMenuLabel(manufacturer: string, name: string): string {
  const trimmedName = name.trim();
  const prefix = manufacturer.trim();

  if (prefix.length === 0) {
    return trimmedName;
  }

  if (trimmedName.toLowerCase().startsWith(prefix.toLowerCase())) {
    return trimmedName;
  }

  return `${prefix} ${trimmedName}`;
}

/**
 * Human-readable model id when only a slug is available (local zips, tests).
 */
export function formatCatalogRadioName(modelId: string, manufacturer?: string): string {
  let id = modelId.trim();

  if (manufacturer) {
    const slug = manufacturer.toLowerCase().replace(/\s+/g, '-');

    if (id.toLowerCase().startsWith(`${slug}-`)) {
      id = id.slice(slug.length + 1);
    }
  }

  const formatted = id
    .split('-')
    .map((part) => formatModelIdPart(part))
    .join('-');

  return formatted.replace(/-Plus$/i, ' Plus');
}

function formatModelIdPart(part: string): string {
  if (part.toLowerCase() === 'plus') {
    return 'Plus';
  }

  const match = part.match(/^([a-z]+)(\d+)([a-z]*)$/i);

  if (!match) {
    return part.toUpperCase();
  }

  const head = match[1]!.toUpperCase();
  const digits = match[2]!;
  const tail = match[3]!.toUpperCase();

  if (head.length >= 2) {
    return `${head}-${digits}${tail}`;
  }

  return `${head}${digits}${tail}`;
}

/**
 * Zip version used to decide whether the official catalog has a newer download.
 * Installed rows show the radio config version instead.
 */
function installedModuleVersion(record: RadioCatalogRecord): string {
  if (record.sourcePath) {
    const parsed = parseModuleInstallPath(record.sourcePath);

    if (parsed) {
      return parsed.version;
    }
  }

  return record.version;
}

/** Version label for an installed radio: the driver config version, not the module zip. */
export function installedDriverVersionLabel(record: Pick<RadioCatalogRecord, 'version' | 'modelId'>): string {
  return `v${record.version} · ${record.modelId}`;
}

/**
 * Official catalog entry that published this installed radio, if any.
 */
export function catalogEntryForInstalledRadio(
  record: RadioCatalogRecord,
  catalog: RadioModuleCatalogEntry[],
): RadioModuleCatalogEntry | undefined {
  return catalog.find((entry) => entry.id === record.modelId);
}

function moduleCompatible(entry: RadioModuleCatalogEntry): boolean {
  return isApiVersionCompatible(APP_HAM_RADIO_API_VERSION, entry.minApiVersion);
}

/** Local JSON or non-beta zip install marked Unverified in the UI. */
export function isUnverifiedDriverRecord(record: RadioCatalogRecord): boolean {
  return record.source === 'user' && !isBetaDriverRecord(record);
}

/** Official or bundled driver install. */
export function isVerifiedDriverRecord(record: RadioCatalogRecord): boolean {
  return record.source === 'installed' || record.source === 'bundled';
}

export function installedRadiosEligibleForVerifiedSwitch(
  items: InstalledRadioListItem[],
): InstalledRadioListItem[] {
  return items.filter((item) => item.canSwitchToVerified && item.catalogEntry);
}

/**
 * Installed radios with catalog update state.
 */
export function buildInstalledRadioListItems(
  records: RadioCatalogRecord[],
  catalog: RadioModuleCatalogEntry[],
): InstalledRadioListItem[] {
  return records.map((record) => {
    const catalogEntry = catalogEntryForInstalledRadio(record, catalog);
    const installedVersion = installedModuleVersion(record);
    const beta = isBetaDriverRecord(record);
    const compatible = catalogEntry ? moduleCompatible(catalogEntry) : true;

    let newer = false;

    if (isVerifiedDriverRecord(record) && catalogEntry !== undefined) {
      newer = compareSemver(catalogEntry.version, installedVersion) > 0;
    } else if (beta && catalogEntry !== undefined) {
      newer = compareSemverWithPrerelease(catalogEntry.version, installedVersion) > 0;
    }

    const canSwitchToVerified = isUnverifiedDriverRecord(record) && catalogEntry !== undefined && compatible;
    const canReplaceWithOfficial =
      beta &&
      catalogEntry !== undefined &&
      compatible &&
      compareSemverWithPrerelease(installedVersion, catalogEntry.version) > 0;

    return {
      record,
      ...(catalogEntry ? { catalogEntry } : {}),
      updateAvailable: newer,
      canUpdate: newer && compatible,
      ...(newer && !compatible ? { updateBlockedReason: APP_UPDATE_REQUIRED } : {}),
      canSwitchToVerified,
      ...(isUnverifiedDriverRecord(record) && catalogEntry && !compatible
        ? { switchBlockedReason: APP_UPDATE_REQUIRED }
        : {}),
      canReplaceWithOfficial,
      ...(beta && catalogEntry && !compatible ? { replaceBlockedReason: APP_UPDATE_REQUIRED } : {}),
    };
  });
}

/**
 * Group installed radios under their manufacturer for the preferences list.
 */
export function groupInstalledRadiosByManufacturer(
  items: InstalledRadioListItem[],
): InstalledManufacturerGroup[] {
  const groups = new Map<string, InstalledRadioListItem[]>();

  for (const item of items) {
    const radios = groups.get(item.record.manufacturer) ?? [];
    radios.push(item);
    groups.set(item.record.manufacturer, radios);
  }

  return [...groups.entries()].map(([manufacturer, radios]) => ({
    manufacturer,
    radios,
  }));
}

/**
 * Official catalog manufacturers that still have at least one radio you do not have.
 * Installed models stay visible as children so you can see what you already own.
 */
export function buildAvailableManufacturerGroups(
  records: RadioCatalogRecord[],
  catalog: RadioModuleCatalogEntry[],
): AvailableManufacturerGroup[] {
  const byManufacturer = new Map<string, RadioModuleCatalogEntry[]>();

  for (const entry of catalog) {
    const radios = byManufacturer.get(entry.manufacturer) ?? [];
    radios.push(entry);
    byManufacturer.set(entry.manufacturer, radios);
  }

  return [...byManufacturer.entries()]
    .map(([manufacturer, entries]) => {
      const radios = entries.map((entry) => {
        const installedRecord = records.find((record) => record.modelId === entry.id);
        const installedOfficially =
          installedRecord !== undefined && isVerifiedDriverRecord(installedRecord);
        const installedBeta = installedRecord !== undefined && isBetaDriverRecord(installedRecord);
        const installedUnverified =
          installedRecord !== undefined && isUnverifiedDriverRecord(installedRecord);
        const compatible = moduleCompatible(entry);
        const installedVersion =
          installedRecord !== undefined ? installedModuleVersion(installedRecord) : undefined;
        const canSwitchToVerified = installedUnverified && compatible;
        const canReplaceWithOfficial =
          installedBeta &&
          compatible &&
          installedVersion !== undefined &&
          compareSemverWithPrerelease(installedVersion, entry.version) > 0;
        const canInstall = installedRecord === undefined && compatible;

        return {
          modelId: entry.id,
          name: installedRecord
            ? radioDisplayName(installedRecord.manufacturer, installedRecord.name)
            : radioDisplayName(entry.manufacturer, entry.name),
          entry,
          installedOfficially,
          installedUnverified,
          installedBeta,
          canInstall,
          canSwitchToVerified,
          canReplaceWithOfficial,
          ...(canInstall && !compatible ? { installBlockedReason: APP_UPDATE_REQUIRED } : {}),
          ...(installedUnverified && !compatible ? { switchBlockedReason: APP_UPDATE_REQUIRED } : {}),
          ...(installedBeta && !compatible ? { replaceBlockedReason: APP_UPDATE_REQUIRED } : {}),
        };
      });

      const hasInstallable = radios.some((radio) => radio.canInstall);

      return {
        manufacturer,
        radios,
        canInstall: hasInstallable,
        ...(radios.some(
          (radio) =>
            !radio.installedOfficially &&
            !radio.installedBeta &&
            !radio.installedUnverified &&
            !radio.canInstall &&
            !radio.canSwitchToVerified,
        )
          ? { installBlockedReason: APP_UPDATE_REQUIRED }
          : {}),
      };
    })
    .filter((group) => group.radios.some((radio) => !radio.installedOfficially));
}
