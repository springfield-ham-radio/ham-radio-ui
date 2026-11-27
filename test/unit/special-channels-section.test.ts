// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { computed, defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import {
  Frequency,
  RadioToneType,
  type RadioMemoryConfig,
  type RadioMemoryMap,
  type RadioProgram,
} from '@springfield/ham-radio-api';
import { decodeRadioProgram, structInstanceAddress } from '@springfield/ham-radio-utils';
import { encodeRadioProgramPreservingSpecialSlots, specialChannelRows } from '~/utils/channel-specials';
import { radioAddressToBufferOffset } from '~/utils/ham-radio-utils-shim';

function thD74StyleMemoryMap(): RadioMemoryMap {
  const base = JSON.parse(
    readFileSync('test/fixtures/kenwood/th-d74-menu-sections.json', 'utf8'),
  ) as RadioMemoryMap;
  const structs = base.structs.map((struct) => {
    if (struct.id === 'flags' || struct.id === 'channels' || struct.id === 'names') {
      return { ...struct, count: 1101 };
    }

    return struct;
  });

  return {
    ...base,
    structs,
    channelBindings: {
      ...base.channelBindings!,
      extras: 'flags',
      specials: {
        start: 1000,
        labels: ['L0', 'U0', 'Pri'],
      },
    },
  };
}

const thD74MemoryConfig: RadioMemoryConfig = {
  chunkSize: 256,
  addressSize: 2,
  addressEndianness: 'big',
  segments: {
    image: { startAddress: 0, endAddress: 0x1ffff },
  },
};

const SpecialChannelsHarness = defineComponent({
  name: 'SpecialChannelsHarness',
  props: {
    memoryMap: { type: Object, required: true },
    program: { type: Object, required: true },
  },
  setup(props) {
    const rows = computed(() => specialChannelRows(props.memoryMap as RadioMemoryMap, props.program as RadioProgram));

    return () =>
      h('div', { class: 'special-channels' }, [
        h('h3', 'Special channels'),
        h(
          'table',
          rows.value.map((row) =>
            h('tr', { 'data-channel': row.channelNumber }, [
              h('td', { class: 'slot' }, row.slotLabel),
              h('td', { class: 'name' }, row.name),
            ]),
          ),
        ),
      ]);
  },
});

describe('RadioWorkspace special channels section', () => {
  it('shows TH-D74 special labels from the memory map', () => {
    const memoryMap = thD74StyleMemoryMap();
    const program: RadioProgram = { channels: [], settings: {} };

    const wrapper = mount(SpecialChannelsHarness, {
      props: { memoryMap, program },
    });

    expect(wrapper.find('h3').text()).toBe('Special channels');
    const slots = wrapper.findAll('[data-channel]').map((row) => row.find('.slot').text());
    expect(slots).toEqual(['L0', 'U0', 'Pri']);
  });

  it('encodes programmed L0 frequency, tones, name, and flags; clear writes cleared bytes', () => {
    const memoryMap = thD74StyleMemoryMap();
    const contents = new Uint8Array(0x20_000).fill(0xff);
    const l0Index = 1000;
    const flagsStruct = memoryMap.structs.find((struct) => struct.id === 'flags')!;
    const channelsStruct = memoryMap.structs.find((struct) => struct.id === 'channels')!;
    const namesStruct = memoryMap.structs.find((struct) => struct.id === 'names')!;

    const programmed: RadioProgram = {
      channels: [
        {
          channelNumber: l0Index,
          radioChannel: {
            name: 'EDGE',
            receiveFrequency: Frequency(146_520_000),
            transmitFrequency: Frequency(146_520_000),
            receiveTone: { tone: 88.5, type: RadioToneType.CTCSS },
            transmitTone: { tone: 88.5, type: RadioToneType.CTCSS },
          },
        },
      ],
      settings: {},
    };

    const encoded = encodeRadioProgramPreservingSpecialSlots(memoryMap, programmed, contents, thD74MemoryConfig);
    const roundTrip = decodeRadioProgram(memoryMap, encoded, thD74MemoryConfig);

    expect(roundTrip.channels).toHaveLength(1);
    expect(roundTrip.channels[0]?.radioChannel).toMatchObject({ name: 'EDGE' });

    const channelOffset = radioAddressToBufferOffset(
      structInstanceAddress(channelsStruct, l0Index),
      thD74MemoryConfig,
      encoded.length,
    );
    const flagsOffset = radioAddressToBufferOffset(
      structInstanceAddress(flagsStruct, l0Index),
      thD74MemoryConfig,
      encoded.length,
    );
    const nameOffset = radioAddressToBufferOffset(
      structInstanceAddress(namesStruct, l0Index),
      thD74MemoryConfig,
      encoded.length,
    );

    expect(encoded[channelOffset]).not.toBe(0xff);
    expect(encoded[flagsOffset]).not.toBe(0xff);
    expect(encoded.slice(nameOffset, nameOffset + 4)).not.toEqual(new Uint8Array(4).fill(0xff));

    const cleared = encodeRadioProgramPreservingSpecialSlots(
      memoryMap,
      { channels: [], settings: {} },
      encoded,
      thD74MemoryConfig,
    );

    expect(cleared[channelOffset]).toBe(0xff);
    expect(cleared[flagsOffset]).toBe(0xff);
    expect(decodeRadioProgram(memoryMap, cleared, thD74MemoryConfig).channels).toEqual([]);
  });

  it('leaves an untouched empty special instance unchanged', () => {
    const memoryMap = thD74StyleMemoryMap();
    const before = new Uint8Array(0x20_000).fill(0xff);
    const l0Index = 1000;
    const channelsStruct = memoryMap.structs.find((struct) => struct.id === 'channels')!;
    const channelOffset = radioAddressToBufferOffset(
      structInstanceAddress(channelsStruct, l0Index),
      thD74MemoryConfig,
      before.length,
    );
    before[channelOffset + 5] = 0xab;

    const after = encodeRadioProgramPreservingSpecialSlots(
      memoryMap,
      { channels: [], settings: {} },
      before,
      thD74MemoryConfig,
    );

    expect(after[channelOffset + 5]).toBe(0xab);
  });
});