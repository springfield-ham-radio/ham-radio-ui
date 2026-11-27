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

    const result = moveProgrammedChannel(channels, 998, 999, 1000);

    expect(result.refused).toMatch(/memory is full/i);
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

  it('preserves EEPROM bytes for unprogrammed special indices', () => {
    const program: RadioProgram = { channels: [], settings: {} };
    const compactMap: RadioMemoryMap = {
      version: '1',
      description: 'compact',
      structs: [{ id: 'records', seek: 0, count: 2, stride: 16, fields: [] }],
      channelBindings: {
        records: 'records',
        receiveFrequency: 'rx',
        transmitFrequency: 'tx',
        receiveTone: 'rxtone',
        transmitTone: 'txtone',
        specials: { start: 1, labels: ['Pri'] },
      },
    };
    const before = new Uint8Array(32).fill(0xff);
    before[16] = 0x42;
    const after = new Uint8Array(before);
    after[16] = 0x00;

    restoreUnprogrammedSpecialChannelBytes(
      compactMap,
      program,
      before,
      after,
      {
        segments: {
          main: { startAddress: 0, endAddress: 31 },
        },
      },
    );

    expect(after[16]).toBe(0x42);
  });
});