import type { RadioModuleCatalogEntry } from '@springfield/ham-radio-registry';
import { compareSemver, isApiVersionCompatible } from '@springfield/ham-radio-registry';
import type { RadioCatalogRecord } from '~/utils/radio-catalog-db';
import {
  APP_HAM_RADIO_API_VERSION,
  catalogModelMatchesId,
  parseModuleInstallPath,
} from '~/utils/radio-module-install';

const APP_UPDATE_REQUIRED = 'This radio module requires a newer version of HamBench.';

export interface InstalledRadioListItem {
  record: RadioCatalogRecord;
  catalogEntry?: RadioModuleCatalogEntry;
  updateAvailable: boolean;
  canUpdate: boolean;
  updateBlockedReason?: string;
}

export interface InstalledManufacturerGroup {
  manufacturer: string;
  radios: InstalledRadioListItem[];
  updateAvailable: boolean;
  canUpdate: boolean;
  catalogEntry?: RadioModuleCatalogEntry;
  updateBlockedReason?: string;
}

export interface CatalogRadioRef {
  modelId: string;
  name: string;
  config?: string;
}

export interface AvailableRadioModelItem {
  modelId: string;
  name: string;
  config?: string;
  installed: boolean;
  canInstall: boolean;
  installBlockedReason?: string;
}

export interface AvailableManufacturerGroup {
  manufacturer: string;
  entry: RadioModuleCatalogEntry;
  radios: AvailableRadioModelItem[];
  canInstall: boolean;
  installBlockedReason?: string;
}

/**
 * Strip npm scope and `radio-module-` so catalog ids match install paths.
 */
export function normalizeCatalogModuleId(value: string): string {
  let id = value.trim().toLowerCase();
  id = id.replace(/^@[^/]+\//, '');

  if (id.startsWith('radio-module-')) {
    return id.slice('radio-module-'.length);
  }

  return id;
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

type CatalogEntryWithRadios = RadioModuleCatalogEntry & {
  radios?: CatalogRadioRef[];
};

/**
 * Radios advertised for a module: zip configs when present, otherwise legacy ids.
 */
export function radiosOnCatalogEntry(entry: RadioModuleCatalogEntry): CatalogRadioRef[] {
  const radios = (entry as CatalogEntryWithRadios).radios;

  if (Array.isArray(radios) && radios.length > 0) {
    return radios;
  }

  return entry.supportedRadios.map((modelId) => ({
    modelId,
    name: formatCatalogRadioName(modelId, entry.manufacturer),
  }));
}

/**
 * Child labels for a manufacturer group, from catalog radio names.
 */
export function catalogRadioDisplayNames(entry: RadioModuleCatalogEntry): string {
  return radiosOnCatalogEntry(entry)
    .map((radio) => radioDisplayName(entry.manufacturer, radio.name))
    .join(', ');
}

/**
 * Human-readable catalog radio name from a supportedRadios id such as `uv5r-plus`.
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
 * True when a catalog `supportedRadios` id refers to this installed row.
 * Catalogs use short ids (`uv5r`); configs use prefixed ids (`baofeng-uv5r`).
 */
export function catalogModelMatchesRecord(catalogModelId: string, record: RadioCatalogRecord): boolean {
  return catalogModelMatchesId(catalogModelId, record.modelId, record.manufacturer);
}

function configModuleId(record: RadioCatalogRecord): string | undefined {
  const moduleId = record.config.metadata?.moduleId;

  if (typeof moduleId !== 'string' || moduleId.length === 0) {
    return undefined;
  }

  return normalizeCatalogModuleId(moduleId);
}

/**
 * Catalog module id for an installed radio, from the install directory or config metadata.
 */
export function catalogModuleIdForRecord(record: RadioCatalogRecord): string | undefined {
  if (record.sourcePath) {
    const parsed = parseModuleInstallPath(record.sourcePath);

    if (parsed) {
      return normalizeCatalogModuleId(parsed.moduleId);
    }
  }

  return configModuleId(record);
}

function installedModuleVersion(record: RadioCatalogRecord): string {
  if (record.sourcePath) {
    const parsed = parseModuleInstallPath(record.sourcePath);

    if (parsed) {
      return parsed.version;
    }
  }

  return record.version;
}

/**
 * Official catalog entry that published this installed radio, if any.
 */
export function catalogEntryForInstalledRadio(
  record: RadioCatalogRecord,
  catalog: RadioModuleCatalogEntry[],
): RadioModuleCatalogEntry | undefined {
  const moduleId = catalogModuleIdForRecord(record);

  if (moduleId) {
    const byId = catalog.find((entry) => {
      return (
        normalizeCatalogModuleId(entry.id) === moduleId ||
        normalizeCatalogModuleId(entry.package) === moduleId
      );
    });

    if (byId) {
      return byId;
    }
  }

  return catalog.find((entry) =>
    radiosOnCatalogEntry(entry).some((radio) => catalogModelMatchesRecord(radio.modelId, record)),
  );
}

function moduleCompatible(entry: RadioModuleCatalogEntry): boolean {
  return isApiVersionCompatible(APP_HAM_RADIO_API_VERSION, entry.minApiVersion);
}

function findInstalledRecordForCatalogModel(
  catalogModelId: string,
  manufacturer: string,
  records: RadioCatalogRecord[],
): RadioCatalogRecord | undefined {
  return records.find((record) => {
    return (
      record.manufacturer.toLowerCase() === manufacturer.toLowerCase() &&
      catalogModelMatchesRecord(catalogModelId, record)
    );
  });
}

/**
 * Installed radios with catalog update state, in catalog order.
 */
export function buildInstalledRadioListItems(
  records: RadioCatalogRecord[],
  catalog: RadioModuleCatalogEntry[],
): InstalledRadioListItem[] {
  return records.map((record) => {
    const catalogEntry = catalogEntryForInstalledRadio(record, catalog);
    const installedVersion = installedModuleVersion(record);
    const newer =
      record.source !== 'user' &&
      catalogEntry !== undefined &&
      compareSemver(catalogEntry.version, installedVersion) > 0;
    const compatible = catalogEntry ? moduleCompatible(catalogEntry) : true;

    return {
      record,
      ...(catalogEntry ? { catalogEntry } : {}),
      updateAvailable: newer,
      canUpdate: newer && compatible,
      ...(newer && !compatible ? { updateBlockedReason: APP_UPDATE_REQUIRED } : {}),
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

  return [...groups.entries()].map(([manufacturer, radios]) => {
    const updateAvailable = radios.some((item) => item.updateAvailable);
    const canUpdate = radios.some((item) => item.canUpdate);
    const catalogEntry = radios.find((item) => item.catalogEntry)?.catalogEntry;
    const updateBlockedReason = radios.find((item) => item.updateBlockedReason)?.updateBlockedReason;

    return {
      manufacturer,
      radios,
      updateAvailable,
      canUpdate,
      ...(catalogEntry ? { catalogEntry } : {}),
      ...(updateBlockedReason ? { updateBlockedReason } : {}),
    };
  });
}

/**
 * Official catalog manufacturers that still have at least one radio you do not have.
 * Installed models stay visible as children so you can see what you already own.
 */
export function buildAvailableManufacturerGroups(
  records: RadioCatalogRecord[],
  catalog: RadioModuleCatalogEntry[],
): AvailableManufacturerGroup[] {
  return catalog
    .map((entry) => {
      const compatible = moduleCompatible(entry);
      const radios = radiosOnCatalogEntry(entry).map((radio) => {
        const installedRecord = findInstalledRecordForCatalogModel(radio.modelId, entry.manufacturer, records);
        const installed = installedRecord !== undefined;

        return {
          modelId: radio.modelId,
          name: installedRecord
            ? radioDisplayName(installedRecord.manufacturer, installedRecord.name)
            : radioDisplayName(entry.manufacturer, radio.name),
          ...(radio.config ? { config: radio.config } : {}),
          installed,
          canInstall: !installed && compatible,
          ...(!installed && !compatible ? { installBlockedReason: APP_UPDATE_REQUIRED } : {}),
        };
      });

      const hasUninstalled = radios.some((radio) => !radio.installed);

      return {
        manufacturer: entry.manufacturer,
        entry,
        radios,
        canInstall: compatible && hasUninstalled,
        ...(compatible || !hasUninstalled ? {} : { installBlockedReason: APP_UPDATE_REQUIRED }),
      };
    })
    .filter((group) => group.radios.some((radio) => !radio.installed));
}
