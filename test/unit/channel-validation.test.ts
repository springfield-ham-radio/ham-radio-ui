import { describe, expect, it } from 'vitest';
import { CTCSS, Frequency, type RadioMemoryMap, type RadioTone, RadioToneType } from '@springfield/ham-radio-api';
import {
  partitionChannelFindings,
  validateChannelForRadio,
  type ChannelValidationRadio,
} from '../../app/utils/channel-validation.ts';

const uv5rMemoryMap: RadioMemoryMap = {
  version: '1.0.0',
  channelBindings: {
    records: 'channels',
    names: 'names',
    nameField: 'name',
    receiveFrequency: 'rxfreq',
    transmitFrequency: 'txfreq',
    receiveTone: 'rxtone',
    transmitTone: 'txtone',
  },
  structs: [
    {
      id: 'channels',
      seek: 0,
      count: 128,
      stride: 16,
      fields: [
        { id: 'rxfreq', type: 'u8', value: { kind: 'lbcd', length: 4, scale: 10 } },
        { id: 'txfreq', type: 'u8', value: { kind: 'lbcd', length: 4, scale: 10 } },
        {
          id: 'rxtone',
          type: 'u16',
          value: {
            kind: 'tone',
            ctcssMin: 600,
            reverseOffset: 105,
            values: [23, 25, 754],
          },
        },
        {
          id: 'txtone',
          type: 'u16',
          value: {
            kind: 'tone',
            ctcssMin: 600,
            reverseOffset: 105,
            values: [23, 25, 754],
          },
        },
      ],
    },
    {
      id: 'names',
      seek: '0x1000',
      count: 128,
      stride: 16,
      fields: [{ id: 'name', type: 'u8', value: { kind: 'ascii', length: 7 } }],
    },
  ],
};

const uv5rSchema = {
  properties: {
    name: { maxLength: 7 },
    receiveFrequency: { minimum: 136_000_000, maximum: 174_000_000 },
    transmitFrequency: { minimum: 136_000_000, maximum: 174_000_000 },
  },
};

const kenwoodSchema = {
  properties: {
    name: { maxLength: 16 },
    receiveFrequency: { minimum: 1000, maximum: 1_300_000_000 },
    transmitFrequency: { minimum: 1000, maximum: 1_300_000_000 },
  },
};

const thF6NameMap: RadioMemoryMap = {
  version: '1.0.0',
  channelBindings: {
    records: 'channels',
    nameField: 'name',
    receiveFrequency: 'freq',
    transmitFrequency: 'offset',
    receiveTone: 'ctone',
    transmitTone: 'rtone',
  },
  structs: [
    {
      id: 'channels',
      seek: 0,
      count: 400,
      stride: 32,
      fields: [
        { id: 'freq', type: 'u32', value: { kind: 'integer' } },
        { id: 'offset', type: 'u32', value: { kind: 'integer' } },
        {
          id: 'rtone',
          type: 'u8',
          value: { kind: 'ctcss-index', values: [670, 693, 770] },
        },
        {
          id: 'ctone',
          type: 'u8',
          value: { kind: 'ctcss-index', values: [670, 693, 770] },
        },
        {
          id: 'dtcs_code',
          type: 'u8',
          value: { kind: 'dcs-index', values: [23, 25, 754] },
        },
        { id: 'name', type: 'u8', value: { kind: 'ascii', length: 8 } },
      ],
    },
  ],
};

function radio(options: Partial<ChannelValidationRadio> & { bands?: string[] }): ChannelValidationRadio {
  return {
    bands: options.bands,
    memoryMap: options.memoryMap,
    channelSchema: options.channelSchema,
  };
}

function channel(overrides: {
  name?: string;
  receiveFrequency?: number;
  transmitFrequency?: number;
  receiveTone?: RadioTone;
  transmitTone?: RadioTone;
}) {
  return {
    name: overrides.name ?? 'TEST',
    receiveFrequency: Frequency(overrides.receiveFrequency ?? 146_520_000),
    transmitFrequency: Frequency(overrides.transmitFrequency ?? 146_520_000),
    receiveTone: overrides.receiveTone ?? { tone: 0, type: RadioToneType.CTCSS },
    transmitTone: overrides.transmitTone ?? { tone: 0, type: RadioToneType.CTCSS },
  };
}

const technicianLicense = {
  active: true,
  classIds: ['b7c9d9e4-5f0a-4f2d-9c2d-1e3b8e7a8b5f'],
  label: 'Technician',
};

describe('validateChannelForRadio', () => {
  it('accepts a 2 m simplex channel on a UV-5R with bands', () => {
    const findings = validateChannelForRadio(
      channel({}),
      radio({ bands: ['2m', '70cm'], memoryMap: uv5rMemoryMap, channelSchema: uv5rSchema }),
      technicianLicense,
    );

    expect(findings).toHaveLength(0);
  });

  it('errors on transmit outside declared bands but warns on receive outside bands', () => {
    const findings = validateChannelForRadio(
      channel({
        receiveFrequency: 162_550_000,
        transmitFrequency: 223_500_000,
      }),
      radio({ bands: ['2m', '70cm'], memoryMap: uv5rMemoryMap, channelSchema: uv5rSchema }),
    );

    expect(findings.some((finding) => finding.code === 'transmit-outside-bands' && finding.level === 'error')).toBe(
      true,
    );
    expect(findings.some((finding) => finding.code === 'receive-outside-bands' && finding.level === 'warning')).toBe(
      true,
    );
  });

  it('errors on GMRS transmit while allowing 70 cm when bands are declared', () => {
    const findings = validateChannelForRadio(
      channel({
        receiveFrequency: 462_562_500,
        transmitFrequency: 462_562_500,
      }),
      radio({ bands: ['2m', '70cm'], memoryMap: uv5rMemoryMap, channelSchema: uv5rSchema }),
    );

    expect(findings.some((finding) => finding.code === 'transmit-outside-bands')).toBe(true);
    expect(findings.some((finding) => finding.code === 'frequency-outside-range')).toBe(false);
  });

  it('allows 446 MHz when bands are declared even though the schema caps at 174 MHz', () => {
    const findings = validateChannelForRadio(
      channel({
        receiveFrequency: 446_000_000,
        transmitFrequency: 446_000_000,
      }),
      radio({ bands: ['2m', '70cm'], memoryMap: uv5rMemoryMap, channelSchema: uv5rSchema }),
    );

    expect(findings.filter((finding) => finding.level === 'error')).toHaveLength(0);
  });

  it('uses schema frequency range when bands are missing', () => {
    const findings = validateChannelForRadio(
      channel({
        receiveFrequency: 146_520_000,
        transmitFrequency: 446_000_000,
      }),
      radio({ memoryMap: uv5rMemoryMap, channelSchema: uv5rSchema }),
    );

    expect(findings.some((finding) => finding.code === 'frequency-outside-range' && finding.field === 'transmitFrequency')).toBe(
      true,
    );
  });

  it('does not schema-range 223 MHz when bands are missing but the schema window is wide', () => {
    const findings = validateChannelForRadio(
      channel({
        receiveFrequency: 223_500_000,
        transmitFrequency: 223_500_000,
      }),
      radio({ memoryMap: thF6NameMap, channelSchema: kenwoodSchema }),
    );

    expect(findings.some((finding) => finding.code === 'frequency-outside-range')).toBe(false);
  });

  it('warns when the name exceeds the memory map ascii length', () => {
    const findings = validateChannelForRadio(
      channel({ name: '123456789' }),
      radio({ bands: ['2m', '70cm'], memoryMap: thF6NameMap, channelSchema: kenwoodSchema }),
    );

    expect(findings).toContainEqual({
      level: 'warning',
      field: 'name',
      code: 'name-truncated',
      message: 'Name will be truncated to 8 characters.',
    });
  });

  it('warns at 8 characters on a 7-character UV-5R name field', () => {
    const findings = validateChannelForRadio(
      channel({ name: '12345678' }),
      radio({ bands: ['2m', '70cm'], memoryMap: uv5rMemoryMap, channelSchema: uv5rSchema }),
    );

    expect(findings.some((finding) => finding.code === 'name-truncated')).toBe(true);
  });

  it('accepts a DCS code in the UV-5R tone word table', () => {
    const findings = validateChannelForRadio(
      channel({
        transmitTone: { tone: 23, type: RadioToneType.DCS },
      }),
      radio({ bands: ['2m', '70cm'], memoryMap: uv5rMemoryMap, channelSchema: uv5rSchema }),
    );

    expect(findings.some((finding) => finding.code === 'transmit-tone-not-encodable')).toBe(false);
  });

  it('rejects tones the memory map cannot store', () => {
    const badDcs: RadioTone = { tone: 999, type: RadioToneType.DCS };
    const findings = validateChannelForRadio(
      channel({ transmitTone: badDcs }),
      radio({ bands: ['2m', '70cm'], memoryMap: uv5rMemoryMap, channelSchema: uv5rSchema }),
    );

    expect(findings.some((finding) => finding.code === 'transmit-tone-not-encodable')).toBe(true);
  });

  it('accepts CTCSS 67.0 Hz on a UV-5R tone word and rejects 50.0 Hz', () => {
    const good = validateChannelForRadio(
      channel({
        transmitTone: { tone: CTCSS.TONE_67_0, type: RadioToneType.CTCSS },
      }),
      radio({ bands: ['2m', '70cm'], memoryMap: uv5rMemoryMap, channelSchema: uv5rSchema }),
    );
    const bad = validateChannelForRadio(
      channel({
        transmitTone: { tone: 500, type: RadioToneType.CTCSS },
      }),
      radio({ bands: ['2m', '70cm'], memoryMap: uv5rMemoryMap, channelSchema: uv5rSchema }),
    );

    expect(good.some((finding) => finding.code === 'transmit-tone-not-encodable')).toBe(false);
    expect(bad.some((finding) => finding.code === 'transmit-tone-not-encodable')).toBe(true);
  });

  it('rejects CTCSS tenths missing from a ctcss-index table', () => {
    const findings = validateChannelForRadio(
      channel({
        transmitTone: { tone: 885, type: RadioToneType.CTCSS },
      }),
      radio({ bands: ['2m', '1.25m', '70cm'], memoryMap: thF6NameMap, channelSchema: kenwoodSchema }),
    );

    expect(findings.some((finding) => finding.code === 'transmit-tone-not-encodable')).toBe(true);
  });

  it('accepts a DCS code stored in the Kenwood dtcs_code table', () => {
    const findings = validateChannelForRadio(
      channel({
        transmitTone: { tone: 23, type: RadioToneType.DCS },
        receiveTone: { tone: 23, type: RadioToneType.DCS },
      }),
      radio({ bands: ['2m', '1.25m', '70cm'], memoryMap: thF6NameMap, channelSchema: kenwoodSchema }),
    );

    expect(findings.some((finding) => finding.code.endsWith('tone-not-encodable'))).toBe(false);
  });

  it('rejects a DCS code missing from the Kenwood dtcs_code table', () => {
    const findings = validateChannelForRadio(
      channel({
        transmitTone: { tone: 999, type: RadioToneType.DCS },
      }),
      radio({ bands: ['2m', '1.25m', '70cm'], memoryMap: thF6NameMap, channelSchema: kenwoodSchema }),
    );

    expect(findings.some((finding) => finding.code === 'transmit-tone-not-encodable')).toBe(true);
  });

  it('does not flag tones when the memory map is absent', () => {
    const findings = validateChannelForRadio(
      channel({
        transmitTone: { tone: 23, type: RadioToneType.DCS },
      }),
      radio({ bands: ['2m', '70cm'] }),
    );

    expect(findings.some((finding) => finding.code.endsWith('tone-not-encodable'))).toBe(false);
  });

  it('does not warn on a standard 2 m split or on cross-band 146/446', () => {
    const split = validateChannelForRadio(
      channel({
        receiveFrequency: 146_520_000,
        transmitFrequency: 146_520_000 + 600_000,
      }),
      radio({ bands: ['2m', '70cm'], memoryMap: uv5rMemoryMap, channelSchema: uv5rSchema }),
    );
    const crossBand = validateChannelForRadio(
      channel({
        receiveFrequency: 146_520_000,
        transmitFrequency: 446_000_000,
      }),
      radio({ bands: ['2m', '70cm'], memoryMap: uv5rMemoryMap, channelSchema: uv5rSchema }),
    );

    expect(split.some((finding) => finding.code === 'offset-not-standard')).toBe(false);
    expect(crossBand.some((finding) => finding.code === 'offset-not-standard')).toBe(false);
  });

  it('warns on an odd offset within the same band', () => {
    const findings = validateChannelForRadio(
      channel({
        receiveFrequency: 146_520_000,
        transmitFrequency: 146_520_000 + 6_000_000,
      }),
      radio({ bands: ['2m', '70cm'], memoryMap: uv5rMemoryMap, channelSchema: uv5rSchema }),
    );

    expect(findings.some((finding) => finding.code === 'offset-not-standard')).toBe(true);
  });

  it('warns on transmit outside license privileges when the assessment is active', () => {
    const findings = validateChannelForRadio(
      channel({
        transmitFrequency: 14_200_000,
        receiveFrequency: 14_200_000,
      }),
      radio({ bands: ['20m'], memoryMap: thF6NameMap, channelSchema: kenwoodSchema }),
      technicianLicense,
    );

    expect(findings.some((finding) => finding.code === 'transmit-outside-privileges')).toBe(true);
  });

  it('skips privilege warnings when the license assessment is inactive', () => {
    const findings = validateChannelForRadio(
      channel({
        transmitFrequency: 7_200_000,
        receiveFrequency: 7_200_000,
      }),
      radio({ bands: ['40m'], memoryMap: thF6NameMap, channelSchema: kenwoodSchema }),
      { active: false, classIds: [], label: '' },
    );

    expect(findings.some((finding) => finding.code === 'transmit-outside-privileges')).toBe(false);
  });

  it('rejects lbcd frequencies that need more digits than the field allows', () => {
    const findings = validateChannelForRadio(
      channel({
        receiveFrequency: 9_999_999_990,
        transmitFrequency: 9_999_999_990,
      }),
      radio({ bands: ['2m', '70cm'], memoryMap: uv5rMemoryMap, channelSchema: uv5rSchema }),
    );

    expect(findings.some((finding) => finding.code === 'frequency-not-encodable')).toBe(true);
  });

  it('accepts 446 MHz on lbcd length 4', () => {
    const findings = validateChannelForRadio(
      channel({
        receiveFrequency: 446_000_000,
        transmitFrequency: 446_000_000,
      }),
      radio({ bands: ['2m', '70cm'], memoryMap: uv5rMemoryMap, channelSchema: uv5rSchema }),
    );

    expect(findings.some((finding) => finding.code === 'frequency-not-encodable')).toBe(false);
  });
});

describe('partitionChannelFindings', () => {
  it('splits errors and warnings', () => {
    const partitioned = partitionChannelFindings([
      { level: 'error', field: 'transmitFrequency', code: 'x', message: 'e' },
      { level: 'warning', field: 'name', code: 'y', message: 'w' },
    ]);

    expect(partitioned.errors).toHaveLength(1);
    expect(partitioned.warnings).toHaveLength(1);
  });
});
