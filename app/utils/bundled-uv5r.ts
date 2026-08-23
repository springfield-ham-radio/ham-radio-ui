import type { RegistryRadio } from '@springfield/ham-radio-registry';
import { hydrateRadioConfigFromDocuments } from '~/utils/radio-catalog-db';
import uv5rConfig from '#baofeng-uv5r';
import uv5rSettingsSchema from '#baofeng-uv5r-settings-schema';
import uv5rChannelSchema from '#baofeng-uv5r-channel-schema';
import uv5rMemoryMap from '#baofeng-uv5r-memory-map';

const UV5R_DOCUMENTS_BY_REF: Record<string, unknown> = {
  '../src/shared/schemas/settings-schema.json': uv5rSettingsSchema,
  '../src/shared/schemas/channel-schema.json': uv5rChannelSchema,
  '../src/shared/memory-maps/uv5r-settings.json': uv5rMemoryMap,
};

/**
 * Hydrate the bundled Baofeng UV-5R config with inlined schemas and memory map.
 */
export function createBundledUv5rRadio(): RegistryRadio {
  return hydrateRadioConfigFromDocuments(uv5rConfig as Record<string, unknown>, UV5R_DOCUMENTS_BY_REF);
}
