import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CTCSS,
  DCS,
  Frequency,
  type RadioMemoryConfig,
  type RadioMemoryMap,
  type RadioModelId,
  type RadioProgram,
  type RadioProgrammedChannel,
  RadioToneType,
} from '@springfield/ham-radio-api';
import type { RadioMemoryMapUiField } from '@springfield/ham-radio-utils';
import { createMemoryMapCodec } from '@springfield/ham-radio-utils';
import { MockLogLayer } from 'loglayer';
import {
  applyChannelPatch,
  availableChannelNumbers,
  channelCapacity,
  channelFieldEditor,
  channelNameMaxLength,
  channelPatchFromLibrary,
  createProgrammedChannel,
  assignLibraryChannelsToSlots,
  formatFrequencyMHz,
  keyToTone,
  nextAvailableChannelNumber,
  parseChannelFieldValue,
  parseFrequencyMHz,
  patchFromDuplex,
  reorderProgrammedChannels,
  serializeChannelFieldValue,
  toneToKey,
} from '../../app/utils/channel-edit.ts';

const sampleMap: RadioMemoryMap = {
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
      fields: [],
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

function programmedChannel(overrides: Partial<RadioProgrammedChannel> = {}): RadioProgrammedChannel {
  return {
    channelNumber: 3,
    radioChannel: {
      name: 'TEST',
      receiveFrequency: Frequency(146_520_000),
      transmitFrequency: Frequency(146_520_000),
      receiveTone: { tone: 0, type: RadioToneType.CTCSS },
      transmitTone: { tone: CTCSS.TONE_88_5, type: RadioToneType.CTCSS },
    },
    settings: {
      lowpower: 0,
      wide: true,
      scan: true,
      isuhf: false,
      transmitPower: 5,
      mode: 'FM',
      skip: '',
    },
    ...overrides,
  };
}

describe('formatFrequencyMHz', () => {
  it('formats hertz as four-decimal MHz', () => {
    expect(formatFrequencyMHz(146_520_000)).toBe('146.5200');
  });

  it('returns an empty string for missing frequencies', () => {
    expect(formatFrequencyMHz(undefined)).toBe('');
  });
});

describe('parseFrequencyMHz', () => {
  it('parses MHz text to hertz', () => {
    expect(parseFrequencyMHz('146.52')).toBe(146_520_000);
    expect(parseFrequencyMHz('146.5200')).toBe(146_520_000);
  });

  it('returns undefined for blank or invalid input', () => {
    expect(parseFrequencyMHz('')).toBe(undefined);
    expect(parseFrequencyMHz('abc')).toBe(undefined);
    expect(parseFrequencyMHz('0')).toBe(undefined);
  });
});

describe('tone keys', () => {
  it('round-trips none, CTCSS, and DCS tones', () => {
    expect(keyToTone(toneToKey({ tone: 0, type: RadioToneType.CTCSS }))).toEqual({
      tone: 0,
      type: RadioToneType.CTCSS,
    });
    expect(toneToKey({ tone: CTCSS.TONE_88_5, type: RadioToneType.CTCSS })).toBe('ctcss:885');
    expect(keyToTone('ctcss:885')).toEqual({ tone: 885, type: RadioToneType.CTCSS });
    expect(toneToKey({ tone: DCS.D023, type: RadioToneType.DCS })).toBe('dcs:23');
    expect(keyToTone('dcs:23')).toEqual({ tone: 23, type: RadioToneType.DCS });
    expect(keyToTone('none')).toEqual({ tone: 0, type: RadioToneType.CTCSS });
  });
});

describe('channelNameMaxLength', () => {
  it('reads the ASCII name length from the memory map', () => {
    expect(channelNameMaxLength(sampleMap)).toBe(7);
  });
});

describe('channelCapacity', () => {
  it('reads the records struct count', () => {
    expect(channelCapacity(sampleMap)).toBe(128);
    expect(channelCapacity(undefined)).toBe(0);
  });
});

describe('nextAvailableChannelNumber', () => {
  it('returns unused slots in order', () => {
    expect(availableChannelNumbers([0, 1, 3], 8)).toEqual([2, 4, 5, 6, 7]);
    expect(availableChannelNumbers([], 3)).toEqual([0, 1, 2]);
    expect(availableChannelNumbers([0, 1], 2)).toEqual([]);
  });

  it('returns the lowest unused slot', () => {
    expect(nextAvailableChannelNumber([0, 1, 3], 8)).toBe(2);
    expect(nextAvailableChannelNumber([], 8)).toBe(0);
  });

  it('returns undefined when every slot is occupied', () => {
    expect(nextAvailableChannelNumber([0, 1], 2)).toBe(undefined);
    expect(nextAvailableChannelNumber([], 0)).toBe(undefined);
  });
});

describe('reorderProgrammedChannels', () => {
  function namedChannel(channelNumber: number, name: string): RadioProgrammedChannel {
    return programmedChannel({
      channelNumber,
      radioChannel: {
        name,
        receiveFrequency: Frequency(146_520_000),
        transmitFrequency: Frequency(146_520_000),
        receiveTone: { tone: 0, type: RadioToneType.CTCSS },
        transmitTone: { tone: 0, type: RadioToneType.CTCSS },
      },
    });
  }

  function namesBySlot(channels: RadioProgrammedChannel[]): Record<number, string> {
    return Object.fromEntries(
      channels.map((channel) => {
        const name = typeof channel.radioChannel === 'object' ? channel.radioChannel.name : channel.radioChannel;
        return [channel.channelNumber, name];
      }),
    );
  }

  it('moves channel data among occupied slots and keeps those slot numbers', () => {
    const original = [namedChannel(0, 'ALPHA'), namedChannel(1, 'BRAVO'), namedChannel(5, 'CHARLIE')];
    const result = reorderProgrammedChannels(original, 2, 0);

    expect(namesBySlot(result.channels)).toEqual({
      0: 'CHARLIE',
      1: 'ALPHA',
      5: 'BRAVO',
    });
    expect(result.previousToNext.get(5)).toBe(0);
    expect(result.previousToNext.get(0)).toBe(1);
    expect(result.previousToNext.get(1)).toBe(5);
    expect(namesBySlot(original)).toEqual({
      0: 'ALPHA',
      1: 'BRAVO',
      5: 'CHARLIE',
    });
  });

  it('moves a channel down the occupied list', () => {
    const result = reorderProgrammedChannels(
      [namedChannel(0, 'ALPHA'), namedChannel(1, 'BRAVO'), namedChannel(2, 'CHARLIE')],
      0,
      2,
    );

    expect(namesBySlot(result.channels)).toEqual({
      0: 'BRAVO',
      1: 'CHARLIE',
      2: 'ALPHA',
    });
  });

  it('returns the original list when the drop index does not move the row', () => {
    const original = [namedChannel(0, 'ALPHA'), namedChannel(4, 'BRAVO')];
    const result = reorderProgrammedChannels(original, 1, 1);

    expect(result.channels).toBe(original);
    expect(result.previousToNext.size).toBe(0);
  });

  it('returns the original list when an index is out of range', () => {
    const original = [namedChannel(0, 'ALPHA')];

    expect(reorderProgrammedChannels(original, -1, 0).channels).toBe(original);
    expect(reorderProgrammedChannels(original, 0, 3).channels).toBe(original);
  });

  it('leaves unresolved channel records in their original slots', () => {
    const unresolved: RadioProgrammedChannel = {
      channelNumber: 3,
      radioChannel: 'SKIP',
    };
    const result = reorderProgrammedChannels([namedChannel(0, 'ALPHA'), unresolved, namedChannel(1, 'BRAVO')], 1, 0);

    expect(namesBySlot(result.channels)).toEqual({
      0: 'BRAVO',
      1: 'ALPHA',
      3: 'SKIP',
    });
  });
});

describe('createProgrammedChannel', () => {
  const populatedMap: RadioMemoryMap = {
    ...sampleMap,
    structs: [
      {
        id: 'channels',
        seek: 0,
        count: 128,
        stride: 16,
        fields: [
          { id: 'rxfreq', type: 'u32' },
          { id: 'txfreq', type: 'u32' },
          { id: 'rxtone', type: 'u16' },
          { id: 'txtone', type: 'u16' },
          { id: 'isuhf', type: 'bits', width: 1, value: { kind: 'boolean' } },
          {
            id: 'lowpower',
            type: 'bits',
            width: 2,
            value: { kind: 'integer', min: 0, max: 3 },
            ui: { group: 'channel', label: 'Power', widget: 'select' },
          },
          {
            id: 'wide',
            type: 'bits',
            width: 1,
            value: { kind: 'boolean' },
            ui: { group: 'channel', label: 'Mode', widget: 'switch' },
          },
          {
            id: 'scan',
            type: 'bits',
            width: 1,
            value: { kind: 'boolean' },
            ui: { group: 'channel', label: 'Scan', widget: 'switch' },
          },
          {
            id: 'bcl',
            type: 'bits',
            width: 1,
            value: { kind: 'boolean' },
            ui: { group: 'channel', label: 'BCL', widget: 'switch' },
          },
        ],
      },
      sampleMap.structs[1]!,
    ],
  };

  it('seeds radio extras and copies portable fields from a saved channel', () => {
    const created = createProgrammedChannel({
      channelNumber: 4,
      memoryMap: populatedMap,
      source: {
        name: 'CALLING',
        receiveFrequency: Frequency(146_940_000),
        transmitFrequency: Frequency(146_340_000),
        receiveTone: { tone: 0, type: RadioToneType.CTCSS },
        transmitTone: { tone: CTCSS.TONE_88_5, type: RadioToneType.CTCSS },
      },
    });

    expect(created.channelNumber).toBe(4);
    expect(created.radioChannel).not.toBeTypeOf('string');

    if (typeof created.radioChannel === 'string') {
      return;
    }

    expect(created.radioChannel.name).toBe('CALLING');
    expect(created.radioChannel.receiveFrequency).toBe(146_940_000);
    expect(created.radioChannel.transmitFrequency).toBe(146_340_000);
    expect(created.radioChannel.transmitTone).toEqual({ tone: CTCSS.TONE_88_5, type: RadioToneType.CTCSS });
    expect(created.settings).toMatchObject({
      lowpower: 0,
      transmitPower: 5,
      wide: true,
      mode: 'FM',
      scan: true,
      skip: '',
      bcl: false,
      isuhf: false,
    });
  });

  it('truncates names to the memory-map limit', () => {
    const created = createProgrammedChannel({
      channelNumber: 0,
      memoryMap: populatedMap,
      source: { name: 'VERYLONGNAME' },
    });

    expect(created.radioChannel).not.toBeTypeOf('string');

    if (typeof created.radioChannel === 'string') {
      return;
    }

    expect(created.radioChannel.name).toBe('VERYLON');
  });
});

describe('channelPatchFromLibrary', () => {
  it('copies name, frequencies, and tones', () => {
    expect(
      channelPatchFromLibrary({
        name: 'Local',
        receiveFrequency: Frequency(146_520_000),
        transmitFrequency: Frequency(146_940_000),
        receiveTone: { tone: DCS.D023, type: RadioToneType.DCS },
        transmitTone: { tone: CTCSS.TONE_88_5, type: RadioToneType.CTCSS },
      }),
    ).toEqual({
      name: 'Local',
      receiveFrequencyHz: 146_520_000,
      transmitFrequencyHz: 146_940_000,
      receiveTone: { tone: DCS.D023, type: RadioToneType.DCS },
      transmitTone: { tone: CTCSS.TONE_88_5, type: RadioToneType.CTCSS },
    });
  });

  it('uses an empty name when the library channel has none', () => {
    expect(channelPatchFromLibrary({}).name).toBe('');
  });

  it('keeps the memory slot and radio settings when applied', () => {
    const next = applyChannelPatch(
      programmedChannel(),
      channelPatchFromLibrary({
        name: 'Library',
        receiveFrequency: Frequency(446_000_000),
        transmitFrequency: Frequency(441_000_000),
        receiveTone: { tone: 0, type: RadioToneType.CTCSS },
        transmitTone: { tone: 0, type: RadioToneType.CTCSS },
      }),
    );

    expect(next.channelNumber).toBe(3);
    expect(next.settings?.lowpower).toBe(0);
    expect(next.settings?.wide).toBe(true);
    expect(next.settings?.scan).toBe(true);
    expect(next.settings?.isuhf).toBe(true);

    if (typeof next.radioChannel === 'string') {
      return;
    }

    expect(next.radioChannel.name).toBe('Library');
    expect(next.radioChannel.receiveFrequency).toBe(446_000_000);
    expect(next.radioChannel.transmitFrequency).toBe(441_000_000);
  });
});

describe('assignLibraryChannelsToSlots', () => {
  it('fills unused slots in order and skips extras when the radio is full', () => {
    const tightMap: RadioMemoryMap = {
      ...sampleMap,
      structs: sampleMap.structs.map((struct) => (struct.id === 'channels' ? { ...struct, count: 2 } : struct)),
    };
    const assigned = assignLibraryChannelsToSlots(
      [
        { name: 'A', receiveFrequency: Frequency(146_520_000), transmitFrequency: Frequency(146_520_000) },
        { name: 'B', receiveFrequency: Frequency(146_940_000), transmitFrequency: Frequency(146_340_000) },
      ],
      [0],
      tightMap,
    );

    expect(assigned.programmed).toHaveLength(1);
    expect(assigned.skipped).toBe(1);
    expect(assigned.programmed[0]?.channelNumber).toBe(1);
    expect(assigned.programmed[0]?.radioChannel).not.toBeTypeOf('string');

    if (typeof assigned.programmed[0]?.radioChannel === 'object') {
      expect(assigned.programmed[0].radioChannel.name).toBe('A');
    }
  });
});

describe('applyChannelPatch', () => {
  it('updates core RadioChannel fields and truncates the name', () => {
    const next = applyChannelPatch(
      programmedChannel(),
      {
        name: 'VERYLONGNAME',
        receiveFrequencyHz: 146_940_000,
        transmitFrequencyHz: 146_340_000,
        transmitTone: { tone: 0, type: RadioToneType.CTCSS },
        receiveTone: { tone: DCS.D023, type: RadioToneType.DCS },
      },
      { nameMaxLength: 7 },
    );

    expect(next.radioChannel).not.toBeTypeOf('string');
    if (typeof next.radioChannel === 'string') {
      return;
    }

    expect(next.radioChannel.name).toBe('VERYLON');
    expect(next.radioChannel.receiveFrequency).toBe(146_940_000);
    expect(next.radioChannel.transmitFrequency).toBe(146_340_000);
    expect(next.radioChannel.transmitTone).toEqual({ tone: 0, type: RadioToneType.CTCSS });
    expect(next.radioChannel.receiveTone).toEqual({ tone: 23, type: RadioToneType.DCS });
  });

  it('merges settings and keeps encode aliases in sync', () => {
    const next = applyChannelPatch(programmedChannel(), {
      settings: { lowpower: 1, wide: false, scan: false },
    });

    expect(next.settings).toMatchObject({
      lowpower: 1,
      transmitPower: 1,
      wide: false,
      mode: 'NFM',
      scan: false,
      skip: 'S',
    });
  });

  it('sets isuhf from the receive frequency when that field is present', () => {
    const vhf = applyChannelPatch(programmedChannel(), { receiveFrequencyHz: 146_520_000 });
    const uhf = applyChannelPatch(programmedChannel(), { receiveFrequencyHz: 446_000_000 });

    expect(vhf.settings?.isuhf).toBe(false);
    expect(uhf.settings?.isuhf).toBe(true);
  });

  it('keeps duplex in sync with transmit and receive frequencies', () => {
    const plus = applyChannelPatch(programmedChannel({ settings: { duplex: '' } }), {
      transmitFrequencyHz: 147_120_000,
    });
    const off = applyChannelPatch(plus, { transmitFrequencyHz: 146_520_000 });

    expect(plus.settings?.duplex).toBe('+');
    expect(off.settings?.duplex).toBe('');
  });
});

describe('channel extras', () => {
  const power: RadioMemoryMapUiField = {
    path: 'lowpower',
    structId: 'channels',
    fieldId: 'lowpower',
    ui: { group: 'channel', label: 'Power', widget: 'select' },
    value: { kind: 'integer', min: 0, max: 3 },
  };
  const mode: RadioMemoryMapUiField = {
    path: 'wide',
    structId: 'channels',
    fieldId: 'wide',
    ui: { group: 'channel', label: 'Mode', widget: 'switch' },
    value: { kind: 'boolean' },
  };
  const scode: RadioMemoryMapUiField = {
    path: 'scode',
    structId: 'channels',
    fieldId: 'scode',
    ui: { group: 'channel', label: 'PTT ID', widget: 'integer' },
    value: { kind: 'integer', min: 0, max: 15 },
  };
  const pttid: RadioMemoryMapUiField = {
    path: 'pttid',
    structId: 'channels',
    fieldId: 'pttid',
    ui: { group: 'channel', label: 'PTT-ID', widget: 'select' },
    value: { kind: 'enum', values: ['Off', 'BOT', 'EOT', 'Both'] },
  };
  const duplex: RadioMemoryMapUiField = {
    path: 'duplex',
    structId: 'channels',
    fieldId: 'duplex',
    ui: { group: 'channel', label: 'Duplex', widget: 'select' },
    value: { kind: 'enum', values: ['', '+', '-', '', 'split'] },
  };

  it('builds High/Low options for power and Wide/Narrow for mode', () => {
    const powerEditor = channelFieldEditor(power);
    const modeEditor = channelFieldEditor(mode);

    expect(powerEditor.kind).toBe('select');
    if (powerEditor.kind === 'select') {
      expect(powerEditor.items.map((item) => item.label)).toEqual(['High', 'Low']);
    }

    expect(modeEditor.kind).toBe('select');
    if (modeEditor.kind === 'select') {
      expect(modeEditor.items.map((item) => item.label)).toEqual(['Wide', 'Narrow']);
    }
  });

  it('serializes and parses power, mode, and 1-based PTT ID', () => {
    expect(serializeChannelFieldValue(power, 0)).toBe('0');
    expect(parseChannelFieldValue(power, '1')).toBe(1);
    expect(serializeChannelFieldValue(mode, false)).toBe('false');
    expect(parseChannelFieldValue(mode, 'true')).toBe(true);
    expect(serializeChannelFieldValue(scode, 0)).toBe('1');
    expect(parseChannelFieldValue(scode, '16')).toBe(15);
    expect(parseChannelFieldValue(pttid, 'BOT')).toBe('BOT');
  });

  it('maps Kenwood duplex empty string to Off instead of a blank select value', () => {
    const editor = channelFieldEditor(duplex);

    expect(editor.kind).toBe('select');
    if (editor.kind !== 'select') {
      return;
    }

    expect(editor.items).toEqual([
      { label: 'Off', value: 'off' },
      { label: '+', value: '+' },
      { label: '-', value: '-' },
      { label: 'Split', value: 'split' },
    ]);
    expect(serializeChannelFieldValue(duplex, undefined)).toBe('off');
    expect(serializeChannelFieldValue(duplex, '')).toBe('off');
    expect(serializeChannelFieldValue(duplex, '+')).toBe('+');
    expect(parseChannelFieldValue(duplex, 'off')).toBe('');
    expect(parseChannelFieldValue(duplex, '+')).toBe('+');
  });

  it('shifts transmit frequency when duplex changes', () => {
    expect(patchFromDuplex(146_520_000, 146_520_000, 'off')).toEqual({
      transmitFrequencyHz: 146_520_000,
      settings: { duplex: '', split: false },
    });
    expect(patchFromDuplex(146_520_000, 146_520_000, '+')).toEqual({
      transmitFrequencyHz: 147_120_000,
      settings: { duplex: '+', split: false },
    });
    expect(patchFromDuplex(146_940_000, 146_340_000, 'off')).toEqual({
      transmitFrequencyHz: 146_940_000,
      settings: { duplex: '', split: false },
    });
    expect(patchFromDuplex(146_520_000, 146_520_000, 'split')).toEqual({
      settings: { duplex: 'split', split: true },
    });
  });
});

describe('channel edit codec round-trip', () => {
  function uv5rCodec() {
    const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '../..');
    const memoryMap = JSON.parse(
      readFileSync(
        join(rootDirectory, 'node_modules/@springfield/radio-module-baofeng/src/shared/memory-maps/uv5r-settings.json'),
        'utf8',
      ),
    ) as RadioMemoryMap;
    const memoryConfig: RadioMemoryConfig = {
      chunkSize: 64,
      addressSize: 2,
      addressEndianness: 'big',
      segments: {
        channels: { startAddress: 0, endAddress: 6143 },
        settings: { startAddress: 7872, endAddress: 8191 },
      },
    };
    const modelId = 'baofeng-uv5r' as RadioModelId;
    const codec = createMemoryMapCodec({
      radioModel: modelId,
      memoryMap,
      memoryConfig,
      logger: new MockLogLayer(),
    });

    return { codec, memoryMap, modelId };
  }

  it('persists a patched name and frequencies through the memory-map codec', async () => {
    const { codec, modelId } = uv5rCodec();
    const originalProgram: RadioProgram = {
      channels: [programmedChannel({ channelNumber: 0 })],
      settings: {},
    };

    const encoded = codec.encode(originalProgram, { contents: new Uint8Array(8192).fill(0xff), radioModel: modelId });
    const decoded = codec.decode(encoded);
    const patched = applyChannelPatch(
      decoded.channels[0]!,
      {
        name: 'CALL',
        receiveFrequencyHz: 146_940_000,
        transmitFrequencyHz: 146_340_000,
        settings: { lowpower: 1 },
      },
      { nameMaxLength: 7 },
    );

    const encodedAgain = codec.encode({ ...decoded, channels: [patched] }, encoded);
    const again = codec.decode(encodedAgain);
    const channel = again.channels[0];

    expect(channel).not.toBe(undefined);
    expect(typeof channel?.radioChannel).toBe('object');

    if (!channel || typeof channel.radioChannel === 'string') {
      return;
    }

    expect(channel.radioChannel.name).toBe('CALL');
    expect(channel.radioChannel.receiveFrequency).toBe(146_940_000);
    expect(channel.radioChannel.transmitFrequency).toBe(146_340_000);
    expect(channel.settings?.lowpower).toBe(1);
  });

  it('adds a new memory slot and omits it after removal', () => {
    const { codec, memoryMap, modelId } = uv5rCodec();
    const empty: RadioProgram = { channels: [], settings: {} };
    const created = createProgrammedChannel({
      channelNumber: 5,
      memoryMap,
      source: {
        name: 'SIMPLEX',
        receiveFrequency: Frequency(146_520_000),
        transmitFrequency: Frequency(146_520_000),
      },
    });

    const encoded = codec.encode(
      { ...empty, channels: [created] },
      { contents: new Uint8Array(8192).fill(0xff), radioModel: modelId },
    );
    const decoded = codec.decode(encoded);

    expect(decoded.channels.map((channel) => channel.channelNumber)).toEqual([5]);
    expect(decoded.channels[0]?.radioChannel).not.toBeTypeOf('string');

    if (typeof decoded.channels[0]?.radioChannel === 'object') {
      expect(decoded.channels[0].radioChannel.name).toBe('SIMPLEX');
      expect(decoded.channels[0].radioChannel.receiveFrequency).toBe(146_520_000);
    }

    const cleared = codec.encode({ ...decoded, channels: [] }, encoded);
    const afterRemove = codec.decode(cleared);

    expect(afterRemove.channels).toEqual([]);
  });
});
