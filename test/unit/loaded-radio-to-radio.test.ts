import { describe, expect, it } from 'vitest';
import type { LoadedRadioConfig } from '../../app/utils/radio-catalog-db.ts';
import { loadedRadioToRadio } from '../../app/utils/loaded-radio-to-radio.ts';

function minimalConfig(overrides: Partial<LoadedRadioConfig> = {}): LoadedRadioConfig {
  return {
    id: { manufacturer: 'Kenwood', model: 'th-d74', name: 'TH-D74' },
    version: '1.13.0',
    description: 'test',
    settingsSchema: { type: 'object', additionalProperties: true },
    memoryConfig: {
      chunkSize: 64,
      addressSize: 2,
      addressEndianness: 'big',
      segments: { main: { startAddress: 0, endAddress: 255 } },
    },
    serialConfig: { baudRate: 57600, dataBits: 8, stopBits: 1, parity: 'none' },
    readMemory: [],
    writeMemory: [],
    ...overrides,
  };
}

describe('loadedRadioToRadio', () => {
  it('keeps onError cleanup steps from the catalog config', () => {
    const onError = {
      readMemory: [{ setBaudRate: 57600 }, { send: ['E'] }],
      writeMemory: [{ send: ['E'] }],
    };
    const config = minimalConfig({ onError });
    const radio = loadedRadioToRadio(config);

    expect(radio.onError).toEqual(onError);
  });

  it('overrides baud rate without dropping onError', () => {
    const onError = { readMemory: [{ setBaudRate: 57600 }] };
    const config = minimalConfig({ onError });
    const radio = loadedRadioToRadio(config, 9600);

    expect(radio.serialConfig.baudRate).toBe(9600);
    expect(radio.onError).toEqual(onError);
  });
});
