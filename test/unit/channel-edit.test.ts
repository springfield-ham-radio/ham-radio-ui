import { describe, it } from 'node:test';
import { expect } from 'chai';
import {
  CTCSS,
  DCS,
  Frequency,
  type RadioMemoryMap,
  type RadioModelId,
  type RadioProgram,
  type RadioProgrammedChannel,
  RadioToneType,
} from '@springfield/ham-radio-api';
import type { RadioMemoryMapUiField } from '@springfield/ham-radio-utils';
import { CodecFactory } from '@springfield/radio-module-baofeng';
import { MockLogLayer } from 'loglayer';
import {
  applyChannelPatch,
  channelFieldEditor,
  channelNameMaxLength,
  formatFrequencyMHz,
  keyToTone,
  parseChannelFieldValue,
  parseFrequencyMHz,
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
    expect(formatFrequencyMHz(146_520_000)).to.equal('146.5200');
  });

  it('returns an empty string for missing frequencies', () => {
    expect(formatFrequencyMHz(undefined)).to.equal('');
  });
});

describe('parseFrequencyMHz', () => {
  it('parses MHz text to hertz', () => {
    expect(parseFrequencyMHz('146.52')).to.equal(146_520_000);
    expect(parseFrequencyMHz('146.5200')).to.equal(146_520_000);
  });

  it('returns undefined for blank or invalid input', () => {
    expect(parseFrequencyMHz('')).to.equal(undefined);
    expect(parseFrequencyMHz('abc')).to.equal(undefined);
    expect(parseFrequencyMHz('0')).to.equal(undefined);
  });
});

describe('tone keys', () => {
  it('round-trips none, CTCSS, and DCS tones', () => {
    expect(keyToTone(toneToKey({ tone: 0, type: RadioToneType.CTCSS }))).to.deep.equal({
      tone: 0,
      type: RadioToneType.CTCSS,
    });
    expect(toneToKey({ tone: CTCSS.TONE_88_5, type: RadioToneType.CTCSS })).to.equal('ctcss:885');
    expect(keyToTone('ctcss:885')).to.deep.equal({ tone: 885, type: RadioToneType.CTCSS });
    expect(toneToKey({ tone: DCS.D023, type: RadioToneType.DCS })).to.equal('dcs:23');
    expect(keyToTone('dcs:23')).to.deep.equal({ tone: 23, type: RadioToneType.DCS });
    expect(keyToTone('none')).to.deep.equal({ tone: 0, type: RadioToneType.CTCSS });
  });
});

describe('channelNameMaxLength', () => {
  it('reads the ASCII name length from the memory map', () => {
    expect(channelNameMaxLength(sampleMap)).to.equal(7);
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

    expect(next.radioChannel).to.not.be.a('string');
    if (typeof next.radioChannel === 'string') {
      return;
    }

    expect(next.radioChannel.name).to.equal('VERYLON');
    expect(next.radioChannel.receiveFrequency).to.equal(146_940_000);
    expect(next.radioChannel.transmitFrequency).to.equal(146_340_000);
    expect(next.radioChannel.transmitTone).to.deep.equal({ tone: 0, type: RadioToneType.CTCSS });
    expect(next.radioChannel.receiveTone).to.deep.equal({ tone: 23, type: RadioToneType.DCS });
  });

  it('merges settings and keeps encode aliases in sync', () => {
    const next = applyChannelPatch(programmedChannel(), {
      settings: { lowpower: 1, wide: false, scan: false },
    });

    expect(next.settings).to.include({
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

    expect(vhf.settings?.isuhf).to.equal(false);
    expect(uhf.settings?.isuhf).to.equal(true);
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

  it('builds High/Low options for power and Wide/Narrow for mode', () => {
    const powerEditor = channelFieldEditor(power);
    const modeEditor = channelFieldEditor(mode);

    expect(powerEditor.kind).to.equal('select');
    if (powerEditor.kind === 'select') {
      expect(powerEditor.items.map((item) => item.label)).to.deep.equal(['High', 'Low']);
    }

    expect(modeEditor.kind).to.equal('select');
    if (modeEditor.kind === 'select') {
      expect(modeEditor.items.map((item) => item.label)).to.deep.equal(['Wide', 'Narrow']);
    }
  });

  it('serializes and parses power, mode, and 1-based PTT ID', () => {
    expect(serializeChannelFieldValue(power, 0)).to.equal('0');
    expect(parseChannelFieldValue(power, '1')).to.equal(1);
    expect(serializeChannelFieldValue(mode, false)).to.equal('false');
    expect(parseChannelFieldValue(mode, 'true')).to.equal(true);
    expect(serializeChannelFieldValue(scode, 0)).to.equal('1');
    expect(parseChannelFieldValue(scode, '16')).to.equal(15);
    expect(parseChannelFieldValue(pttid, 'BOT')).to.equal('BOT');
  });
});

describe('channel edit codec round-trip', () => {
  it('persists a patched name and frequencies through the Baofeng codec', async () => {
    const factory = new CodecFactory();
    const modelId = 'baofeng-uv5r' as RadioModelId;
    const codec = await factory.createCodec(
      modelId,
      {
        channelMemorySegment: { endAddress: 6143, startAddress: 0 },
        channelSettingsSchemaPath: 'shared/schemas/channel-schema.json',
        channelSize: 16,
        magicNumber: [80, 187, 255, 32, 18, 7, 37],
        memorySegmentSize: 64,
        numberChannels: 128,
        powerOffset: 12,
        radioSettingsSchemaPath: 'shared/schemas/settings-schema.json',
        receiveFrequencyOffset: 0,
        receiveToneOffset: 8,
        settingsMemorySegment: { endAddress: 8191, startAddress: 7872 },
        transmitFrequencyOffset: 4,
        transmitToneOffset: 10,
      },
      new MockLogLayer(),
    );

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

    expect(channel).to.not.equal(undefined);
    expect(typeof channel?.radioChannel).to.equal('object');

    if (!channel || typeof channel.radioChannel === 'string') {
      return;
    }

    expect(channel.radioChannel.name).to.equal('CALL');
    expect(channel.radioChannel.receiveFrequency).to.equal(146_940_000);
    expect(channel.radioChannel.transmitFrequency).to.equal(146_340_000);
    expect(channel.settings?.lowpower).to.equal(1);
  });
});
