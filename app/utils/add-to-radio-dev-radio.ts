import { hydrateRadioConfig } from '@springfield/ham-radio-registry';
import { createEmptyMemoryImage, createMemoryMapCodec, memoryImageSize } from '@springfield/ham-radio-utils';
import type { RadioMemoryConfig, RadioProgram } from '@springfield/ham-radio-api';
import type { LoadedRadioConfig } from '~/utils/radio-catalog-db';
import uv5rConfig from '../../node_modules/@springfield/radio-module-baofeng/configs/baofeng-uv5r.json' with { type: 'json' };
import uv5rMemoryMap from '../../node_modules/@springfield/radio-module-baofeng/src/shared/memory-maps/uv5r-settings.json' with { type: 'json' };
import uv5rChannelSchema from '../../node_modules/@springfield/radio-module-baofeng/src/shared/schemas/channel-schema.json' with { type: 'json' };
import uv5rSettingsSchema from '../../node_modules/@springfield/radio-module-baofeng/src/shared/schemas/settings-schema.json' with { type: 'json' };

/** Model id for the dev UV-5R stand-in used by `?fixture=add-to-radio`. */
export const ADD_TO_RADIO_FIXTURE_MODEL = 'baofeng-uv5r';

/**
 * Hydrated UV-5R config for the dev fixture.
 * The bundled 3.1 module omits `bands`; current catalog modules declare `2m` and `70cm`.
 */
export function addToRadioFixtureConfig(): LoadedRadioConfig {
  const hydrated = hydrateRadioConfig(uv5rConfig, {
    '../src/shared/schemas/settings-schema.json': uv5rSettingsSchema,
    '../src/shared/schemas/channel-schema.json': uv5rChannelSchema,
    '../src/shared/memory-maps/uv5r-settings.json': uv5rMemoryMap,
  });

  return {
    ...(hydrated as LoadedRadioConfig),
    bands: ['2m', '70cm'],
  };
}

/** Empty EEPROM image and decoded program for a UV-5R that was never read from a radio. */
export function addToRadioFixtureMemory(config: LoadedRadioConfig): { memory: Uint8Array; program: RadioProgram } {
  const memoryConfig = config.memoryConfig as RadioMemoryConfig;
  const memory = createEmptyMemoryImage(memoryImageSize(memoryConfig));
  const codec = createMemoryMapCodec({
    radioModel: config.id.model,
    memoryMap: config.memoryMap,
    memoryConfig,
  });
  const program = codec.decode({
    radioModel: config.id.model,
    contents: memory,
  });

  return { memory, program };
}
