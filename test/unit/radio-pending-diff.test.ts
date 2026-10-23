import { describe, expect, it } from 'vitest';
import {
  CTCSS,
  Frequency,
  type RadioMemoryMap,
  type RadioProgram,
  type RadioProgrammedChannel,
  RadioToneType,
} from '@springfield/ham-radio-api';
import {
  diffPendingRadioState,
  emptyPendingRadioDiff,
  pendingChangeCount,
  summarizePendingChanges,
} from '../../app/utils/radio-pending-diff.ts';

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

describe('diffPendingRadioState', () => {
  it('should report no marks when the program matches the baseline', () => {
    const image = program([channel({ channelNumber: 1, radioChannel: { name: 'KEEP' } })], {
      settings: { squelch: 2 },
    });

    const diff = diffPendingRadioState(image, image, memoryMap);

    expect(diff).toEqual(emptyPendingRadioDiff());
    expect(pendingChangeCount(diff)).toBe(0);
    expect(summarizePendingChanges(diff, 'radio')).toBe('');
  });

  it('should mark an empty slot that is now filled as added', () => {
    const before = program([channel({ channelNumber: 1, radioChannel: { name: 'KEEP' } })]);
    const after = program([
      channel({ channelNumber: 1, radioChannel: { name: 'KEEP' } }),
      channel({ channelNumber: 3, radioChannel: { name: 'NEW' } }),
    ]);

    const diff = diffPendingRadioState(before, after, memoryMap);

    expect(diff.channels).toEqual([
      { channelNumber: 3, kind: 'added', moved: false, changedColumnIds: [] },
    ]);
    expect(summarizePendingChanges(diff, 'loaded')).toBe('1 channel differs from the loaded memory.');
  });

  it('should mark a filled slot that is now empty as cleared', () => {
    const before = program([
      channel({ channelNumber: 1, radioChannel: { name: 'KEEP' } }),
      channel({ channelNumber: 4, radioChannel: { name: 'OLD' } }),
    ]);
    const after = program([channel({ channelNumber: 1, radioChannel: { name: 'KEEP' } })]);

    const diff = diffPendingRadioState(before, after, memoryMap);

    expect(diff.channels).toEqual([
      { channelNumber: 4, kind: 'cleared', moved: false, changedColumnIds: [] },
    ]);
  });

  it('should highlight only the columns whose values changed', () => {
    const before = program([
      channel({
        channelNumber: 2,
        radioChannel: {
          name: 'OLD',
          receiveFrequency: Frequency(147_000_000),
          transmitFrequency: Frequency(147_600_000),
          transmitTone: { tone: CTCSS.TONE_100_0, type: RadioToneType.CTCSS },
        },
        settings: { lowpower: 0, wide: true },
      }),
    ]);
    const after = program([
      channel({
        channelNumber: 2,
        radioChannel: {
          name: 'OLD',
          receiveFrequency: Frequency(146_520_000),
          transmitFrequency: Frequency(147_600_000),
          transmitTone: { tone: 23, type: RadioToneType.DCS },
        },
        settings: { lowpower: 1, wide: true },
      }),
    ]);

    const diff = diffPendingRadioState(before, after, memoryMap);

    expect(diff.channels).toEqual([
      {
        channelNumber: 2,
        kind: 'changed',
        moved: false,
        changedColumnIds: ['receive', 'txTone', 'toneType', 'lowpower'],
      },
    ]);
  });

  it('should highlight the transmit and band columns when the transmit frequency changes', () => {
    const before = program([channel({ channelNumber: 1 })]);
    const after = program([
      channel({
        channelNumber: 1,
        radioChannel: {
          receiveFrequency: Frequency(146_520_000),
          transmitFrequency: Frequency(446_000_000),
        },
      }),
    ]);

    const diff = diffPendingRadioState(before, after, memoryMap);
    const columns = diff.channels[0]?.changedColumnIds ?? [];

    expect(columns).toContain('transmit');
    expect(columns).toContain('bandName');
    expect(columns).not.toContain('receive');
    expect(columns).not.toContain('name');
  });

  it('should count a moved channel as changed in both slots', () => {
    const shared = {
      name: 'CALL',
      receiveFrequency: Frequency(146_520_000),
      transmitFrequency: Frequency(146_520_000),
    };
    const before = program([
      channel({ channelNumber: 1, radioChannel: shared }),
      channel({ channelNumber: 2, radioChannel: { name: 'NEXT' } }),
    ]);
    const after = program([
      channel({ channelNumber: 2, radioChannel: { name: 'NEXT' } }),
      channel({ channelNumber: 5, radioChannel: shared }),
    ]);

    const diff = diffPendingRadioState(before, after, memoryMap);

    expect(diff.channels.map((entry) => [entry.channelNumber, entry.kind, entry.moved])).toEqual([
      [1, 'changed', true],
      [5, 'changed', true],
    ]);
    expect(diff.channels[0]?.changedColumnIds).toEqual([]);
    expect(diff.channels[1]?.changedColumnIds).toEqual(['name', 'bandName', 'transmit', 'receive']);
  });

  it('should count a shift as changed in the vacated slot and the slot that received the channel', () => {
    const before = program([
      channel({ channelNumber: 1, radioChannel: { name: 'ONE' } }),
      channel({ channelNumber: 2, radioChannel: { name: 'TWO' } }),
    ]);
    const after = program([
      channel({ channelNumber: 2, radioChannel: { name: 'ONE' } }),
      channel({ channelNumber: 3, radioChannel: { name: 'TWO' } }),
    ]);

    const diff = diffPendingRadioState(before, after, memoryMap);

    expect(diff.channels.map((entry) => [entry.channelNumber, entry.kind])).toEqual([
      [1, 'changed'],
      [2, 'changed'],
      [3, 'changed'],
    ]);
    expect(diff.channels.every((entry) => entry.moved)).toBe(true);
  });

  it('should keep an added copy as added when the original slot still has that channel', () => {
    const before = program([channel({ channelNumber: 1, radioChannel: { name: 'CALL' } })]);
    const after = program([
      channel({ channelNumber: 1, radioChannel: { name: 'CALL' } }),
      channel({ channelNumber: 4, radioChannel: { name: 'CALL' } }),
    ]);

    const diff = diffPendingRadioState(before, after, memoryMap);

    expect(diff.channels).toEqual([
      { channelNumber: 4, kind: 'added', moved: false, changedColumnIds: [] },
    ]);
  });

  it('should list changed settings paths and count them with channels', () => {
    const before = program([channel({ channelNumber: 1 })], { settings: { squelch: 3, beep: false, vox: 1 } });
    const after = program([], { settings: { squelch: 5, beep: true, vox: 1 } });

    const diff = diffPendingRadioState(before, after, memoryMap);

    expect(diff.channels.map((entry) => entry.kind)).toEqual(['cleared']);
    expect(diff.settingsPaths).toEqual(['settings.squelch', 'settings.beep']);
    expect(pendingChangeCount(diff)).toBe(3);
    expect(summarizePendingChanges(diff, 'radio')).toBe('1 channel and 2 settings differ from the radio.');
  });

  it('should describe a settings-only difference', () => {
    const before = program([], { settings: { squelch: 1, vox: 0 } });
    const after = program([], { settings: { squelch: 1, vox: 4 } });

    const diff = diffPendingRadioState(before, after, memoryMap);

    expect(diff.channels).toEqual([]);
    expect(diff.settingsPaths).toEqual(['settings.vox']);
    expect(summarizePendingChanges(diff, 'loaded')).toBe('1 setting differs from the loaded memory.');
  });

  it('should treat a later snapshot that matches the baseline as having no pending marks', () => {
    const baseline = program([channel({ channelNumber: 1, radioChannel: { name: 'KEEP' } })]);
    const edited = program([channel({ channelNumber: 1, radioChannel: { name: 'EDIT' } })]);

    expect(diffPendingRadioState(baseline, edited, memoryMap).channels[0]?.kind).toBe('changed');
    expect(diffPendingRadioState(baseline, baseline, memoryMap)).toEqual(emptyPendingRadioDiff());
  });
});
