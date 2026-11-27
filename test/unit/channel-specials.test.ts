import { describe, expect, it } from 'vitest';
import {
  Frequency,
  RadioToneType,
  type RadioMemoryMap,
  type RadioProgram,
  type RadioProgrammedChannel,
} from '@springfield/ham-radio-api';

function programmedChannel(overrides: Partial<RadioProgrammedChannel> = {}): RadioProgrammedChannel {
  return {
    channelNumber: 0,
    radioChannel: {
      name: '',
      receiveFrequency: Frequency(0),
      transmitFrequency: Frequency(0),
      receiveTone: { tone: 0, type: RadioToneType.CTCSS },
      transmitTone: { tone: 0, type: RadioToneType.CTCSS },
    },
    ...overrides,
  };
}
import { channelCapacity, channelRecordCapacity, moveProgrammedChannel } from '~/utils/channel-edit';
import {
  encodeRadioProgramPreservingSpecialSlots,
  hasMemoryMapSpecialChannels,
  isRegularChannelIndex,
  isSpecialChannelIndex,
  memoryMapSpecialChannelLabel,
  restoreUnprogrammedSpecialChannelBytes,
  specialChannelRows,
} from '~/utils/channel-specials';

const memoryMapWithSpecials: RadioMemoryMap = {
  version: '1',
  description: 'test',
  structs: [
    { id: 'records', seek: 0, count: 1101, stride: 16, fields: [] },
    { id: 'names', seek: 0, count: 1101, stride: 8, fields: [] },
  ],
  channelBindings: {
    records: 'records',
    names: 'names',
    nameField: 'name',
    receiveFrequency: 'rx',
    transmitFrequency: 'tx',
    receiveTone: 'rxtone',
    transmitTone: 'txtone',
    specials: {
      start: 1000,
      labels: ['L0', 'U0', 'Pri'],
    },
  },
};

describe('memory map special channel helpers', () => {
  it('detects specials metadata and capacities', () => {
    expect(hasMemoryMapSpecialChannels(memoryMapWithSpecials)).toBe(true);
    expect(channelCapacity(memoryMapWithSpecials)).toBe(1000);
    expect(channelRecordCapacity(memoryMapWithSpecials)).toBe(1101);
    expect(isSpecialChannelIndex(memoryMapWithSpecials, 1000)).toBe(true);
    expect(isRegularChannelIndex(memoryMapWithSpecials, 999)).toBe(true);
    expect(isRegularChannelIndex(memoryMapWithSpecials, 1000)).toBe(false);
    expect(memoryMapSpecialChannelLabel(memoryMapWithSpecials, 1002)).toBe('Pri');
  });

  it('refuses regular-channel shifts that cross into specials', () => {
    const channels = [
      programmedChannel({
        channelNumber: 998,
        radioChannel: {
          name: 'A',
          receiveFrequency: Frequency(146_520_000),
          transmitFrequency: Frequency(146_520_000),
          receiveTone: { tone: 0, type: RadioToneType.CTCSS },
          transmitTone: { tone: 0, type: RadioToneType.CTCSS },
        },
      }),
      programmedChannel({
        channelNumber: 999,
        radioChannel: {
          name: 'B',
          receiveFrequency: Frequency(146_520_000),
          transmitFrequency: Frequency(146_520_000),
          receiveTone: { tone: 0, type: RadioToneType.CTCSS },
          transmitTone: { tone: 0, type: RadioToneType.CTCSS },
        },
      }),
    ];

    const result = moveProgrammedChannel(channels, 998, 999, 1000, 'specials-boundary');

    expect(result.refused).toBe('Radio memory is full; no free slot after that position.');
    expect(result.previousToNext.size).toBe(0);
  });

  it('builds special rows with labels and empty placeholders', () => {
    const program: RadioProgram = {
      channels: [
        programmedChannel({
          channelNumber: 1000,
          radioChannel: {
            name: 'EDGE',
            receiveFrequency: Frequency(146_520_000),
            transmitFrequency: Frequency(146_520_000),
            receiveTone: { tone: 0, type: RadioToneType.CTCSS },
            transmitTone: { tone: 0, type: RadioToneType.CTCSS },
          },
        }),
      ],
      settings: {},
    };

    const rows = specialChannelRows(memoryMapWithSpecials, program);

    expect(rows).toHaveLength(3);
    expect(rows[0]?.slotLabel).toBe('L0');
    expect(rows[0]?.name).toBe('EDGE');
    expect(rows[1]?.isEmptySpecial).toBe(true);
    expect(rows[1]?.slotLabel).toBe('U0');
    expect(rows[2]?.slotLabel).toBe('Pri');
  });

  it('preserves EEPROM bytes only for special slots that were empty and remain unprogrammed', () => {
    const program: RadioProgram = { channels: [], settings: {} };
    const compactMap: RadioMemoryMap = {
      version: '1',
      description: 'compact',
      structs: [
        {
          id: 'records',
          seek: 0,
          count: 2,
          stride: 16,
          emptyWhen: { equals: 255 },
          clearEmpty: true,
          fields: [],
        },
      ],
      channelBindings: {
        records: 'records',
        receiveFrequency: 'rx',
        transmitFrequency: 'tx',
        receiveTone: 'rxtone',
        transmitTone: 'txtone',
        specials: { start: 1, labels: ['Pri'] },
      },
    };
    const memoryConfig = {
      segments: {
        main: { startAddress: 0, endAddress: 31 },
      },
    };
    const before = new Uint8Array(32).fill(0xff);
    before[17] = 0x42;
    const after = new Uint8Array(before);
    after[17] = 0x00;

    restoreUnprogrammedSpecialChannelBytes(compactMap, program, before, after, memoryConfig);

    expect(after[17]).toBe(0x42);
  });

  it('writes cleared bytes after program then clear (does not resurrect the special)', () => {
    const compactMap: RadioMemoryMap = {
      version: '1',
      description: 'compact',
      structs: [
        {
          id: 'records',
          seek: 0,
          count: 2,
          stride: 16,
          emptyWhen: { equals: 255 },
          clearEmpty: true,
          fields: [{ id: 'rx', type: 'u32', value: { kind: 'integer' } }],
        },
      ],
      channelBindings: {
        records: 'records',
        receiveFrequency: 'rx',
        transmitFrequency: 'tx',
        receiveTone: 'rxtone',
        transmitTone: 'txtone',
        specials: { start: 1, labels: ['Pri'] },
      },
    };
    const memoryConfig = {
      segments: {
        main: { startAddress: 0, endAddress: 31 },
      },
    };
    const before = new Uint8Array(32).fill(0xff);
    const programmed: RadioProgram = {
      channels: [
        programmedChannel({
          channelNumber: 1,
          radioChannel: {
            name: 'X',
            receiveFrequency: Frequency(146_520_000),
            transmitFrequency: Frequency(146_520_000),
            receiveTone: { tone: 0, type: RadioToneType.CTCSS },
            transmitTone: { tone: 0, type: RadioToneType.CTCSS },
          },
        }),
      ],
      settings: {},
    };

    const encoded = encodeRadioProgramPreservingSpecialSlots(compactMap, programmed, before, memoryConfig);
    expect(encoded[16]).not.toBe(0xff);

    const cleared = encodeRadioProgramPreservingSpecialSlots(
      compactMap,
      { channels: [], settings: {} },
      encoded,
      memoryConfig,
    );

    expect(cleared[16]).toBe(0xff);
  });
});