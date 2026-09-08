import { describe, it } from 'node:test';
import { expect } from 'chai';
import type { RadioMemoryConfig, RadioMemoryMap } from '@springfield/ham-radio-api';
import {
  bufferOffsetToRadioAddress,
  codecHitAtOffset,
  codecInstanceLabel,
  codecSelectionOffsets,
  codecStructInstanceAddress,
  collectCodecByteHits,
  describeMemoryMap,
  filterMemoryConfig,
  filterMemoryMap,
  formatCodecJson,
  formatCodecSettingValue,
  groupLayoutBands,
  layoutStructFields,
} from '../../app/utils/codec-display.ts';

const channelMap: RadioMemoryMap = {
  version: '1.0.0',
  description: 'Test radio memory map',
  channelBindings: {
    records: 'channels',
    names: 'names',
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
      emptyWhen: { equals: 255 },
      fields: [
        { id: 'rxfreq', type: 'u8', value: { kind: 'lbcd', length: 4, scale: 10 } },
        { id: 'txfreq', type: 'u8', value: { kind: 'lbcd', length: 4, scale: 10 } },
        { id: 'rxtone', type: 'u16', value: { kind: 'tone', values: [23], ctcssMin: 600 } },
        { id: 'txtone', type: 'u16', value: { kind: 'tone', values: [23], ctcssMin: 600 } },
        { id: '_pad', type: 'bits', width: 3, reserved: true },
        { id: 'scan', type: 'bits', width: 1, value: { kind: 'boolean' } },
        { id: 'power', type: 'bits', width: 4, value: { kind: 'integer' } },
        { id: 'name', type: 'u8', value: { kind: 'ascii', length: 3 } },
      ],
    },
    {
      id: 'names',
      seek: '0x1000',
      count: 128,
      stride: 16,
      fields: [{ id: 'name', type: 'u8', value: { kind: 'ascii', length: 16 } }],
    },
    {
      id: 'squelch',
      seek: '0x1EC0',
      fields: [{ id: 'squelch', type: 'u8', value: { kind: 'integer', min: 0, max: 9 } }],
    },
  ],
};

describe('codec-display', () => {
  describe('layoutStructFields', () => {
    it('should pack whole-byte fields and bitfields into a 16-byte record', () => {
      const layout = layoutStructFields(channelMap.structs[0]!.fields);

      expect(layout.recordSize).to.equal(16);
      expect(layout.slots.map((slot) => [slot.id, slot.offset, slot.size])).to.deep.equal([
        ['rxfreq', 0, 4],
        ['txfreq', 4, 4],
        ['rxtone', 8, 2],
        ['txtone', 10, 2],
        ['_pad', 12, 1],
        ['scan', 12, 1],
        ['power', 12, 1],
        ['name', 13, 3],
      ]);
      expect(layout.slots.find((slot) => slot.id === 'rxfreq')?.valueKind).to.equal('lbcd');
      expect(layout.slots.find((slot) => slot.id === 'scan')).to.include({
        bitOffset: 4,
        bitWidth: 1,
        reserved: false,
      });
      expect(groupLayoutBands(layout.slots).map((band) => band.kind)).to.deep.equal([
        'field',
        'field',
        'field',
        'field',
        'bits',
        'field',
      ]);
    });
  });

  describe('describeMemoryMap', () => {
    it('should assign channel-binding roles and address spans', () => {
      const described = describeMemoryMap(channelMap);

      expect(described.version).to.equal('1.0.0');
      expect(described.structs[0]?.id).to.equal('channels');
      expect(described.structs[0]?.role).to.equal('records');
      expect(described.structs[0]?.span).to.deep.equal({ start: 0, end: 2047 });
      expect(described.structs[0]?.notes).to.include('Empty when first byte is 0xFF');
      expect(described.structs[1]?.role).to.equal('names');
      expect(described.structs[1]?.span.start).to.equal(0x1000);
    });

    it('should split channel structs from settings structs', () => {
      const channels = filterMemoryMap(channelMap, 'channels');
      const settings = filterMemoryMap(channelMap, 'settings');

      expect(channels.structs.map((struct) => struct.id)).to.deep.equal(['channels', 'names']);
      expect(channels.channelBindings?.records).to.equal('channels');
      expect(settings.structs.map((struct) => struct.id)).to.deep.equal(['squelch']);
      expect(settings.channelBindings).to.equal(undefined);
    });

    it('should treat every struct as settings when there are no channel bindings', () => {
      const unbound: RadioMemoryMap = {
        version: channelMap.version,
        description: channelMap.description,
        structs: channelMap.structs,
      };
      const settings = filterMemoryMap(unbound, 'settings');
      const channels = filterMemoryMap(unbound, 'channels');

      expect(channels.structs).to.deep.equal([]);
      expect(settings.structs.map((struct) => struct.id)).to.deep.equal(['channels', 'names', 'squelch']);
    });
  });

  describe('filterMemoryConfig', () => {
    it('should keep only the segment named for the map scope', () => {
      const config = {
        chunkSize: 64,
        addressSize: 2 as const,
        addressEndianness: 'big' as const,
        segments: {
          channels: { startAddress: 0, endAddress: 6143 },
          settings: { startAddress: 7872, endAddress: 8191 },
          image: { startAddress: 0, endAddress: 8191 },
        },
      };

      expect(Object.keys(filterMemoryConfig(config, 'channels')?.segments ?? {})).to.deep.equal(['channels']);
      expect(Object.keys(filterMemoryConfig(config, 'settings')?.segments ?? {})).to.deep.equal(['settings']);
      expect(filterMemoryConfig(undefined, 'channels')).to.equal(undefined);
    });
  });

  describe('formatCodecJson', () => {
    it('should pretty-print the memory map', () => {
      const json = formatCodecJson(channelMap);

      expect(json).to.include('"id": "channels"');
      expect(json).to.include('"channelBindings"');
    });
  });

  describe('codecStructInstanceAddress', () => {
    it('should stride records and apply grouped pad bytes', () => {
      const described = describeMemoryMap(channelMap);
      const channels = described.structs[0]!;

      expect(codecStructInstanceAddress(channels, 0)).to.equal(0);
      expect(codecStructInstanceAddress(channels, 2)).to.equal(32);

      const grouped = {
        ...channels,
        groupSize: 2,
        groupPad: 8,
        stride: 16,
      };

      expect(codecStructInstanceAddress(grouped, 0)).to.equal(0);
      expect(codecStructInstanceAddress(grouped, 1)).to.equal(16);
      expect(codecStructInstanceAddress(grouped, 2)).to.equal(40);
    });
  });

  describe('collectCodecByteHits', () => {
    const memoryConfig: RadioMemoryConfig = {
      chunkSize: 64,
      addressSize: 2,
      addressEndianness: 'big',
      segments: {
        channels: { startAddress: 0, endAddress: 0x1fff },
      },
    };

    it('should map hex-dump offsets to channel fields', () => {
      const described = describeMemoryMap(channelMap);
      const hits = collectCodecByteHits(described, 0x2000, memoryConfig);
      const channelTwo = codecHitAtOffset(hits, 32);

      expect(channelTwo).to.include({
        structId: 'channels',
        instanceIndex: 2,
        fieldId: 'rxfreq',
      });

      const nameByte = codecHitAtOffset(hits, 32 + 13);
      expect(nameByte?.fieldId).to.equal('name');

      const selected = codecSelectionOffsets(
        described,
        { structId: 'channels', instanceIndex: 2, fieldId: 'txfreq' },
        0x2000,
        memoryConfig,
      );

      expect(selected.instance).to.deep.equal([32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47]);
      expect(selected.field).to.deep.equal([36, 37, 38, 39]);
    });

    it('should map packed settings offsets back to EEPROM addresses', () => {
      const packedConfig: RadioMemoryConfig = {
        chunkSize: 64,
        addressSize: 2,
        addressEndianness: 'big',
        segments: {
          channels: { startAddress: 0, endAddress: 6143 },
          settings: { startAddress: 7872, endAddress: 8191 },
        },
      };
      const packedSize = 6144 + 320;

      expect(bufferOffsetToRadioAddress(6144, packedConfig, packedSize)).to.equal(7872);
      expect(bufferOffsetToRadioAddress(0x1ee0, packedConfig, 8192)).to.equal(0x1ee0);
    });
  });

  describe('formatCodecSettingValue', () => {
    it('should format frequencies, tones, and booleans', () => {
      const freqSlot = { id: 'rxfreq', offset: 0, size: 4, reserved: false, typeLabel: 'lbcd×4', valueKind: 'lbcd' };
      const toneSlot = { id: 'rxtone', offset: 8, size: 2, reserved: false, typeLabel: 'tone', valueKind: 'tone' };
      const scanSlot = { id: 'scan', offset: 12, size: 1, reserved: false, typeLabel: '1b', valueKind: 'boolean' };

      expect(formatCodecSettingValue(146_520_000, freqSlot)).to.equal('146.5200 MHz');
      expect(formatCodecSettingValue({ mode: 'ctcss', value: 885 }, toneSlot)).to.equal('CTCSS 88.5');
      expect(formatCodecSettingValue({ mode: 'none' }, toneSlot)).to.equal('None');
      expect(formatCodecSettingValue(true, scanSlot)).to.equal('On');
    });
  });

  describe('codecInstanceLabel', () => {
    it('should call channel-bound structs Channel', () => {
      const described = describeMemoryMap(channelMap);

      expect(codecInstanceLabel(described.structs[0]!)).to.equal('Channel');
      expect(codecInstanceLabel(described.structs[2]!)).to.equal('squelch');
    });
  });
});
