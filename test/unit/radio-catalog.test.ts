import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractCatalogMetadata,
  hydrateRadioConfig,
  validateConfiguration,
} from '@springfield/ham-radio-registry';
import { hydrateRadioConfigFromDocuments, upsertRadioCatalogRecord, listRadioCatalogRecords } from '../../app/utils/radio-catalog-db.ts';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '../..');
const baofengRoot = join(rootDirectory, 'node_modules/@springfield/radio-module-baofeng');

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(baofengRoot, relativePath), 'utf8')) as Record<string, unknown>;
}

describe('radio catalog hydrate', () => {
  it('should hydrate bundled UV-5R config with schemas and memory map', () => {
    const config = readJson('configs/baofeng-uv5r.json');
    const documentsByRef = {
      '../src/shared/schemas/settings-schema.json': readJson('src/shared/schemas/settings-schema.json'),
      '../src/shared/schemas/channel-schema.json': readJson('src/shared/schemas/channel-schema.json'),
      '../src/shared/memory-maps/uv5r-settings.json': readJson('src/shared/memory-maps/uv5r-settings.json'),
    };

    const radio = hydrateRadioConfigFromDocuments(config, documentsByRef);
    const validation = validateConfiguration(radio);
    const entry = extractCatalogMetadata(radio, 'bundled');

    expect(validation.isValid).toBe(true);
    expect(radio.id.model).toBe('baofeng-uv5r');
    expect(radio.memoryMap).toBeTypeOf('object');
    expect(radio.memoryMap).toHaveProperty('structs');
    expect(entry.manufacturer).toBe('Baofeng');
    expect(entry.source).toBe('bundled');
    expect(entry.contentHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('should keep an in-memory catalog outside Tauri', async () => {
    const config = readJson('configs/baofeng-uv5r.json');
    const documentsByRef = {
      '../src/shared/schemas/settings-schema.json': readJson('src/shared/schemas/settings-schema.json'),
      '../src/shared/schemas/channel-schema.json': readJson('src/shared/schemas/channel-schema.json'),
      '../src/shared/memory-maps/uv5r-settings.json': readJson('src/shared/memory-maps/uv5r-settings.json'),
    };
    const radio = hydrateRadioConfig(config, documentsByRef);

    await upsertRadioCatalogRecord(radio, 'bundled');
    const records = await listRadioCatalogRecords();

    expect(records.some((record) => record.modelId === 'baofeng-uv5r')).toBe(true);
  });

  it('should replace a user catalog row when switching to a verified install', async () => {
    const config = readJson('configs/baofeng-uv5r.json');
    const documentsByRef = {
      '../src/shared/schemas/settings-schema.json': readJson('src/shared/schemas/settings-schema.json'),
      '../src/shared/schemas/channel-schema.json': readJson('src/shared/schemas/channel-schema.json'),
      '../src/shared/memory-maps/uv5r-settings.json': readJson('src/shared/memory-maps/uv5r-settings.json'),
    };
    const radio = hydrateRadioConfig(config, documentsByRef);

    await upsertRadioCatalogRecord(radio, 'user', { sourcePath: '/tmp/uv5r.json' });
    const kept = await upsertRadioCatalogRecord(radio, 'installed', {
      sourcePath: '/tmp/radio-modules/baofeng-uv5r/3.7.0',
    });
    expect(kept.source).toBe('user');

    const replaced = await upsertRadioCatalogRecord(radio, 'installed', {
      sourcePath: '/tmp/radio-modules/baofeng-uv5r/3.7.0',
      replaceUserCatalog: true,
    });
    expect(replaced.source).toBe('installed');
    expect(replaced.modelId).toBe('baofeng-uv5r');
    expect(replaced.sourcePath).toContain('baofeng-uv5r');
    expect(replaced.createdAt).toBe(kept.createdAt);
  });

  it('should rewrite an installed row when the content hash matches but the module path changed', async () => {
    const config = readJson('configs/baofeng-uv5r.json');
    const documentsByRef = {
      '../src/shared/schemas/settings-schema.json': readJson('src/shared/schemas/settings-schema.json'),
      '../src/shared/schemas/channel-schema.json': readJson('src/shared/schemas/channel-schema.json'),
      '../src/shared/memory-maps/uv5r-settings.json': readJson('src/shared/memory-maps/uv5r-settings.json'),
    };
    const radio = hydrateRadioConfig(config, documentsByRef);

    await upsertRadioCatalogRecord(radio, 'installed', {
      sourcePath: '/tmp/radio-modules/baofeng-uv5r/1.11.0',
      moduleVersion: '1.11.0',
    });
    const updated = await upsertRadioCatalogRecord(radio, 'installed', {
      sourcePath: '/tmp/radio-modules/baofeng-uv5r/1.12.0',
      moduleVersion: '1.12.0',
    });

    expect(updated.version).toBe('1.12.0');
    expect(updated.sourcePath).toBe('/tmp/radio-modules/baofeng-uv5r/1.12.0');
    expect(updated.config.version).toBe(radio.version);
    const listed = (await listRadioCatalogRecords()).find((record) => record.modelId === 'baofeng-uv5r');
    expect(listed?.version).toBe('1.12.0');
    expect(listed?.sourcePath).toBe('/tmp/radio-modules/baofeng-uv5r/1.12.0');
  });
});
