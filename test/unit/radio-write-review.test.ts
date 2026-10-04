import { describe, expect, it } from 'vitest';
import { CTCSS, Frequency, type RadioMemoryMap, type RadioProgram, type RadioProgrammedChannel, RadioToneType } from '@springfield/ham-radio-api';
import { diffRadioPrograms, summarizeWriteReview } from '../../app/utils/radio-write-review.ts';

const memoryMap: RadioMemoryMap = {
  version: '1.0.0',
  groups: [
    { id: 'basic', label: 'Basic Settings' },
    { id: 'audio', label: 'Audio' },
  ],
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
        {
          id: 'lowpower',
          type: 'u8',
          value: { kind: 'integer', min: 0, max: 1 },
          ui: { group: 'channel', label: 'Power', widget: 'select' },
        },
        {
          id: 'wide',
          type: 'u8',
          value: { kind: 'boolean' },
          ui: { group: 'channel', label: 'Mode', widget: 'switch' },
        },
        {
          id: 'scan',
          type: 'u8',
          value: { kind: 'boolean' },
          ui: { group: 'channel', label: 'Scan', widget: 'switch' },
        },
        {
          id: 'duplex',
          type: 'u8',
          value: { kind: 'enum', values: ['', '+', '-', 'split'] },
          ui: { group: 'channel', label: 'Duplex', widget: 'select' },
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
    {
      id: 'settings',
      seek: '0x1EC0',
      fields: [
        {
          id: 'squelch',
          type: 'u8',
          value: { kind: 'integer', min: 0, max: 9 },
          ui: { group: 'basic', label: 'Squelch', widget: 'integer' },
        },
        {
          id: 'beep',
          type: 'u8',
          value: { kind: 'boolean' },
          ui: { group: 'basic', label: 'Beep', widget: 'switch' },
        },
        {
          id: 'vox',
          type: 'u8',
          value: { kind: 'integer', min: 0, max: 10 },
          ui: { group: 'audio', label: 'VOX', widget: 'integer' },
        },
      ],
    },
  ],
};

function channel(overrides: Partial<RadioProgrammedChannel> & { channelNumber: number }): RadioProgrammedChannel {
  const radioChannel = overrides.radioChannel;

  return {
    channelNumber: overrides.channelNumber,
    settings: overrides.settings,
    radioChannel:
      typeof radioChannel === 'string'
        ? radioChannel
        : {
            name: 'SIMPLEX',
            receiveFrequency: Frequency(146_520_000),
            transmitFrequency: Frequency(146_520_000),
            receiveTone: { tone: 0, type: RadioToneType.CTCSS },
            transmitTone: { tone: 0, type: RadioToneType.CTCSS },
            ...radioChannel,
          },
  };
}

function program(channels: RadioProgrammedChannel[], settings: RadioProgram['settings'] = {}): RadioProgram {
  return { channels, settings };
}

describe('diffRadioPrograms', () => {
  it('should list added, cleared, and changed channels with field before and after values', () => {
    const before = program([
      channel({ channelNumber: 1, radioChannel: { name: 'CALL' } }),
      channel({
        channelNumber: 2,
        radioChannel: {
          name: 'OLD',
          receiveFrequency: Frequency(147_000_000),
          transmitFrequency: Frequency(147_600_000),
        },
        settings: { lowpower: 0, wide: true, scan: true, duplex: '+' },
      }),
      channel({
        channelNumber: 4,
        radioChannel: {
          name: 'RPT',
          receiveFrequency: Frequency(146_940_000),
          transmitFrequency: Frequency(146_340_000),
          transmitTone: { tone: CTCSS.TONE_100_0, type: RadioToneType.CTCSS },
        },
        settings: { lowpower: 0, wide: true, scan: true, duplex: '-' },
      }),
    ]);
    const after = program([
      channel({ channelNumber: 1, radioChannel: { name: 'CALL' } }),
      channel({
        channelNumber: 3,
        radioChannel: { name: 'NEW' },
        settings: { lowpower: 1, wide: false, scan: false },
      }),
      channel({
        channelNumber: 4,
        radioChannel: {
          name: 'REPEATER',
          receiveFrequency: Frequency(146_940_000),
          transmitFrequency: Frequency(146_340_000),
          transmitTone: { tone: CTCSS.TONE_88_5, type: RadioToneType.CTCSS },
        },
        settings: { lowpower: 1, wide: false, scan: false, duplex: '-' },
      }),
    ]);

    const diff = diffRadioPrograms(before, after, memoryMap);

    expect(diff.channels.map((entry) => [entry.channelNumber, entry.kind, entry.name])).toEqual([
      [2, 'cleared', 'OLD'],
      [3, 'added', 'NEW'],
      [4, 'changed', 'REPEATER'],
    ]);
    expect(diff.channels[0]?.fields).toEqual([
      { id: 'name', label: 'Name', before: 'OLD', after: '—' },
      { id: 'frequency', label: 'Frequency', before: '147.0000 MHz', after: '—' },
      { id: 'offset', label: 'Offset', before: '+ 0.6000 MHz', after: '—' },
      { id: 'channel.lowpower', label: 'Power', before: 'High', after: '—' },
      { id: 'channel.wide', label: 'Mode', before: 'Wide', after: '—' },
      { id: 'channel.scan', label: 'Scan', before: 'On', after: '—' },
    ]);
    expect(diff.channels[1]?.fields.map((field) => field.label)).toEqual([
      'Name',
      'Frequency',
      'Power',
      'Mode',
      'Scan',
    ]);
    expect(diff.channels[1]?.fields.find((field) => field.id === 'offset')).toBeUndefined();
    expect(diff.channels[2]?.fields).toEqual([
      { id: 'name', label: 'Name', before: 'RPT', after: 'REPEATER' },
      { id: 'transmitTone', label: 'Transmit tone', before: 'CTCSS 100.0', after: 'CTCSS 88.5' },
      { id: 'channel.lowpower', label: 'Power', before: 'High', after: 'Low' },
      { id: 'channel.wide', label: 'Mode', before: 'Wide', after: 'Narrow' },
      { id: 'channel.scan', label: 'Scan', before: 'On', after: 'Off' },
    ]);
  });

  it('should treat a raw string slot as empty and omit channels that did not change', () => {
    const before = program([
      channel({ channelNumber: 1, radioChannel: { name: 'KEEP' } }),
      channel({ channelNumber: 8, radioChannel: 'raw' }),
    ]);
    const after = program([
      channel({ channelNumber: 1, radioChannel: { name: 'KEEP' } }),
      channel({ channelNumber: 8, radioChannel: { name: 'FILLED' } }),
    ]);

    const diff = diffRadioPrograms(before, after, memoryMap);

    expect(diff.channels).toHaveLength(1);
    expect(diff.channels[0]).toMatchObject({ channelNumber: 8, kind: 'added', name: 'FILLED' });
  });

  it('should describe a split offset and a DCS tone', () => {
    const before = program([channel({ channelNumber: 5 })]);
    const after = program([
      channel({
        channelNumber: 5,
        radioChannel: {
          name: 'SPLIT',
          receiveFrequency: Frequency(146_520_000),
          transmitFrequency: Frequency(145_110_000),
          receiveTone: { tone: 23, type: RadioToneType.DCS },
        },
        settings: { duplex: 'split', split: true },
      }),
    ]);

    const diff = diffRadioPrograms(before, after, memoryMap);
    const fields = diff.channels[0]?.fields ?? [];

    expect(fields.find((field) => field.id === 'offset')).toEqual({
      id: 'offset',
      label: 'Offset',
      before: 'Off',
      after: 'Split 145.1100 MHz',
    });
    expect(fields.find((field) => field.id === 'receiveTone')).toEqual({
      id: 'receiveTone',
      label: 'Receive tone',
      before: 'None',
      after: 'DCS 023',
    });
    expect(fields.some((field) => field.id === 'channel.duplex')).toBe(false);
  });

  it('should group changed settings and skip groups that match', () => {
    const before = program([], { settings: { squelch: 3, beep: false, vox: 1 } });
    const after = program([], { settings: { squelch: 5, beep: true, vox: 1 } });

    const diff = diffRadioPrograms(before, after, memoryMap);

    expect(diff.channels).toEqual([]);
    expect(diff.settingsGroups).toEqual([
      {
        id: 'basic',
        label: 'Basic Settings',
        fields: [
          { id: 'settings.squelch', label: 'Squelch', before: '3', after: '5' },
          { id: 'settings.beep', label: 'Beep', before: 'Off', after: 'On' },
        ],
      },
    ]);
    expect(summarizeWriteReview(diff)).toBe('2 settings changed.');
  });

  it('should summarize mixed channel and setting changes', () => {
    const before = program([channel({ channelNumber: 1 })]);
    const after = program([], { settings: { squelch: 1 } });

    const diff = diffRadioPrograms(before, after, memoryMap);

    expect(summarizeWriteReview(diff)).toBe('1 channel cleared. 1 setting changed.');
  });

  it('should report no changes when the programs match', () => {
    const image = program([channel({ channelNumber: 1, radioChannel: { name: 'KEEP' } })], {
      settings: { squelch: 2 },
    });

    const diff = diffRadioPrograms(image, image, memoryMap);

    expect(diff.channels).toEqual([]);
    expect(diff.settingsGroups).toEqual([]);
    expect(summarizeWriteReview(diff)).toBe('No channel or setting changes.');
  });
});
