import type { Radio, RadioId, RadioMemoryMap } from '@springfield/ham-radio-api';
import type { RadioCapabilities, RadioCatalogSource, RegistryRadio } from '@springfield/ham-radio-registry';
import {
  extractCatalogMetadata,
  hashRadioConfig,
  hydrateRadioConfig,
  validateConfiguration,
} from '@springfield/ham-radio-registry';
import Database from '@tauri-apps/plugin-sql';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';

export const RADIO_CATALOG_DATABASE = 'sqlite:ham-radio.db';

export interface LoadedRadioConfig extends Radio {
  codec?: {
    type: string;
    reference?: string;
    config?: Record<string, unknown>;
  };
  capabilities?: RadioCapabilities;
}

export interface RadioCatalogRecord {
  modelId: string;
  name: string;
  manufacturer: string;
  version: string;
  description: string;
  capabilities: RadioCapabilities;
  source: RadioCatalogSource;
  sourcePath?: string;
  config: LoadedRadioConfig;
  contentHash: string;
  createdAt: number;
  updatedAt: number;
}

interface RadioModelRow {
  model_id: string;
  name: string;
  manufacturer: string;
  version: string;
  description: string;
  capabilities: string;
  source: string;
  source_path: string | null;
  config_json: string;
  content_hash: string;
  created_at: number;
  updated_at: number;
}

let databasePromise: Promise<Database> | undefined;
const memoryCatalog = new Map<string, RadioCatalogRecord>();

export function assertRadioCatalogDatabaseAvailable(): void {
  if (!isTauriRuntime()) {
    throw new Error('The radio catalog database requires the Tauri desktop app. Run yarn tauri:dev.');
  }
}

async function getRadioCatalogDatabase(): Promise<Database> {
  assertRadioCatalogDatabaseAvailable();

  if (!databasePromise) {
    databasePromise = Database.load(RADIO_CATALOG_DATABASE);
  }

  return databasePromise;
}

function rowToRecord(row: RadioModelRow): RadioCatalogRecord {
  const capabilities = JSON.parse(row.capabilities) as RadioCapabilities;
  const config = JSON.parse(row.config_json) as LoadedRadioConfig;

  return {
    modelId: row.model_id,
    name: row.name,
    manufacturer: row.manufacturer,
    version: row.version,
    description: row.description,
    capabilities,
    source: row.source as RadioCatalogSource,
    ...(row.source_path ? { sourcePath: row.source_path } : {}),
    config,
    contentHash: row.content_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function recordToRadioId(record: RadioCatalogRecord): RadioId {
  return {
    model: record.modelId as RadioId['model'],
    name: record.name,
    manufacturer: record.manufacturer,
  };
}

/**
 * Upsert a hydrated radio into the catalog.
 * Does not overwrite an existing `user` row when inserting `bundled` with a different hash.
 */
export async function upsertRadioCatalogRecord(
  radio: RegistryRadio,
  source: RadioCatalogSource,
  options: { sourcePath?: string; contentHash?: string } = {},
): Promise<RadioCatalogRecord> {
  const contentHash = options.contentHash ?? hashRadioConfig(radio);
  const metadata = extractCatalogMetadata(radio, source, contentHash);
  const now = Date.now();
  const existing = await getRadioCatalogRecord(metadata.modelId);

  if (existing && source === 'bundled' && existing.source === 'user') {
    return existing;
  }

  if (existing && source === 'bundled' && existing.source === 'bundled' && existing.contentHash === contentHash) {
    return existing;
  }

  const record: RadioCatalogRecord = {
    modelId: metadata.modelId,
    name: metadata.name,
    manufacturer: metadata.manufacturer,
    version: metadata.version,
    description: metadata.description,
    capabilities: metadata.capabilities,
    source,
    ...(options.sourcePath ? { sourcePath: options.sourcePath } : {}),
    config: radio as LoadedRadioConfig,
    contentHash,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  if (!isTauriRuntime()) {
    memoryCatalog.set(record.modelId, record);
    return record;
  }

  const database = await getRadioCatalogDatabase();

  if (existing) {
    await database.execute(
      `UPDATE radio_models SET
         name = $1,
         manufacturer = $2,
         version = $3,
         description = $4,
         capabilities = $5,
         source = $6,
         source_path = $7,
         config_json = $8,
         content_hash = $9,
         updated_at = $10
       WHERE model_id = $11`,
      [
        record.name,
        record.manufacturer,
        record.version,
        record.description,
        JSON.stringify(record.capabilities),
        record.source,
        record.sourcePath ?? null,
        JSON.stringify(record.config),
        record.contentHash,
        record.updatedAt,
        record.modelId,
      ],
    );
  } else {
    await database.execute(
      `INSERT INTO radio_models (
         model_id, name, manufacturer, version, description, capabilities,
         source, source_path, config_json, content_hash, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        record.modelId,
        record.name,
        record.manufacturer,
        record.version,
        record.description,
        JSON.stringify(record.capabilities),
        record.source,
        record.sourcePath ?? null,
        JSON.stringify(record.config),
        record.contentHash,
        record.createdAt,
        record.updatedAt,
      ],
    );
  }

  return record;
}

export async function listRadioCatalogRecords(): Promise<RadioCatalogRecord[]> {
  if (!isTauriRuntime()) {
    return [...memoryCatalog.values()].sort((left, right) => {
      const manufacturerCompare = left.manufacturer.localeCompare(right.manufacturer);
      return manufacturerCompare !== 0 ? manufacturerCompare : left.name.localeCompare(right.name);
    });
  }

  const database = await getRadioCatalogDatabase();
  const rows = await database.select<RadioModelRow[]>(
    `SELECT model_id, name, manufacturer, version, description, capabilities,
            source, source_path, config_json, content_hash, created_at, updated_at
     FROM radio_models
     ORDER BY manufacturer COLLATE NOCASE ASC, name COLLATE NOCASE ASC`,
  );

  return rows.map(rowToRecord);
}

export async function listRadioManufacturers(): Promise<string[]> {
  const records = await listRadioCatalogRecords();
  return [...new Set(records.map((record) => record.manufacturer))].sort((left, right) => left.localeCompare(right));
}

export async function listRadioModelsByManufacturer(manufacturer: string): Promise<RadioId[]> {
  const records = await listRadioCatalogRecords();
  return records
    .filter((record) => record.manufacturer === manufacturer)
    .map(recordToRadioId);
}

export async function getRadioCatalogRecord(modelId: string): Promise<RadioCatalogRecord | undefined> {
  if (!isTauriRuntime()) {
    return memoryCatalog.get(modelId);
  }

  const database = await getRadioCatalogDatabase();
  const rows = await database.select<RadioModelRow[]>(
    `SELECT model_id, name, manufacturer, version, description, capabilities,
            source, source_path, config_json, content_hash, created_at, updated_at
     FROM radio_models
     WHERE model_id = $1
     LIMIT 1`,
    [modelId],
  );

  const row = rows[0];
  return row ? rowToRecord(row) : undefined;
}

export async function getRadioConfiguration(modelId: string): Promise<LoadedRadioConfig | undefined> {
  const record = await getRadioCatalogRecord(modelId);
  return record?.config;
}

export function memoryMapFromConfig(config: LoadedRadioConfig): RadioMemoryMap | undefined {
  return config.memoryMap as RadioMemoryMap | undefined;
}

export function validateHydratedRadio(radio: RegistryRadio): void {
  const validation = validateConfiguration(radio);

  if (!validation.isValid) {
    throw new Error(`Invalid radio configuration: ${validation.errors.join(', ')}`);
  }
}

export function hydrateRadioConfigFromDocuments(
  json: string | Record<string, unknown>,
  documentsByRef: Record<string, unknown> = {},
): RegistryRadio {
  const radio = hydrateRadioConfig(json, documentsByRef);
  validateHydratedRadio(radio);
  return radio;
}
