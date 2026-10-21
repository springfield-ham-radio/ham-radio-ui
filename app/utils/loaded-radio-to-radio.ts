import type { Radio } from '@springfield/ham-radio-api';
import type { LoadedRadioConfig } from '~/utils/radio-catalog-db';

/** Build the driver {@link Radio} object from a catalog config, preserving optional cleanup steps. */
export function loadedRadioToRadio(config: LoadedRadioConfig, baudRate?: number): Radio {
  return {
    id: config.id,
    version: config.version,
    description: config.description,
    settingsSchema: config.settingsSchema,
    memoryConfig: config.memoryConfig,
    serialConfig: baudRate === undefined ? config.serialConfig : { ...config.serialConfig, baudRate },
    readMemory: config.readMemory,
    writeMemory: config.writeMemory,
    memoryMap: config.memoryMap,
    onError: config.onError,
  };
}
