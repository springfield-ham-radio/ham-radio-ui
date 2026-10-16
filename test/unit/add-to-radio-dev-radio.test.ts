import { describe, expect, it } from 'vitest';
import { addToRadioDevFixture, isDevFixtureSerialPort } from '../../app/utils/add-to-radio-dev-fixture.ts';
import { addToRadioFixtureConfig, addToRadioFixtureMemory } from '../../app/utils/add-to-radio-dev-radio.ts';
import { channelSchemaFromSettingsSchema, validateChannelForRadio } from '../../app/utils/channel-validation.ts';

describe('add to radio dev fixture', () => {
  it('decodes an empty UV-5R image and flags one error and one warning', () => {
    const config = addToRadioFixtureConfig();
    const { memory, program } = addToRadioFixtureMemory(config);

    expect(memory.length).toBeGreaterThan(0);
    expect(program.channels).toHaveLength(0);
    expect(config.bands).toEqual(['2m', '70cm']);

    const radio = {
      bands: config.bands,
      memoryMap: config.memoryMap,
      channelSchema: channelSchemaFromSettingsSchema(config.settingsSchema),
    };
    const [outOfBand, longName] = addToRadioDevFixture();
    const outOfBandFindings = validateChannelForRadio(outOfBand, radio);
    const longNameFindings = validateChannelForRadio(longName, radio);

    expect(outOfBandFindings.some((finding) => finding.code === 'transmit-outside-bands')).toBe(true);
    expect(longNameFindings.some((finding) => finding.level === 'error')).toBe(false);
    expect(longNameFindings.some((finding) => finding.code === 'name-truncated')).toBe(true);
    expect(isDevFixtureSerialPort('fixture')).toBe(true);
    expect(isDevFixtureSerialPort('/dev/ttyUSB0')).toBe(false);
  });
});
