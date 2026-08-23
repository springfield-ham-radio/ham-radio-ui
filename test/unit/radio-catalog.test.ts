import { describe, it } from 'node:test';
import { expect } from 'chai';
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

    expect(validation.isValid).to.be.true;
    expect(radio.id.model).to.equal('baofeng-uv5r');
    expect(radio.memoryMap).to.be.an('object');
    expect(radio.memoryMap).to.have.property('structs');
    expect(entry.manufacturer).to.equal('Baofeng');
    expect(entry.source).to.equal('bundled');
    expect(entry.contentHash).to.match(/^[0-9a-f]{8}$/);
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

    expect(records.some((record) => record.modelId === 'baofeng-uv5r')).to.be.true;
  });
});
