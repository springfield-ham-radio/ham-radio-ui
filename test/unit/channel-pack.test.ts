import { describe, expect, it } from 'vitest';
import { RadioChannelId, RadioToneType } from '@springfield/ham-radio-api';
import {
  buildChannelPackDocument,
  CHANNEL_PACK_MAX_CHANNELS,
  CHANNEL_PACK_MAX_CHARS,
  countRepeaterBookChannels,
  packChannelsToSavedChannels,
  parseChannelPack,
  serializeChannelPack,
} from '~/utils/channel-pack';
import { radioChannelToSavedChannel, type SavedChannel } from '~/utils/saved-channels-db';

const packId = '8f1c0b2e-7a4d-4c1e-9b6a-1d2e3f4a5b6c';
const metadata = {
  id: packId,
  name: 'ARES Weekly Net',
  description: 'Local repeaters',
  author: 'W5XYZ',
  version: '1.2.0',
  updated: '2026-10-17T18:00:00.000Z',
  source: 'https://example.com/ares.hpack',
};

function channel(
  overrides: Partial<SavedChannel> & Pick<SavedChannel, 'id'> & { packChannelId?: string },
): SavedChannel & { packChannelId?: string } {
  const base = radioChannelToSavedChannel(
    {
      name: 'Monday Net',
      transmitFrequency: 146_520_000,
      receiveFrequency: 146_520_000,
      transmitTone: { tone: 0, type: RadioToneType.CTCSS },
      receiveTone: { tone: 0, type: RadioToneType.CTCSS },
    },
    { id: overrides.id },
  );

  return { ...base, ...overrides };
}

describe('channel pack', () => {
  it('round-trips a document with stable key order', () => {
    const saved = channel({ id: RadioChannelId('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'), packChannelId: 'monday-net' });
    const document = buildChannelPackDocument(metadata, [saved]);
    const text = serializeChannelPack(document);
    expect(Object.keys(JSON.parse(text))).toEqual([
      'schemaVersion',
      'id',
      'name',
      'description',
      'author',
      'version',
      'updated',
      'source',
      'channels',
    ]);
    const reparsed = parseChannelPack(text);
    expect(reparsed.channels[0]?.id).toBe('monday-net');
    expect(reparsed.channels[0]?.rxHz).toBe(146_520_000);
  });

  it('rejects unsupported schemaVersion and invalid JSON', () => {
    expect(() => parseChannelPack('{')).toThrow(/valid JSON/);
    expect(() => parseChannelPack(JSON.stringify({ schemaVersion: 2, id: packId, name: 'x', version: '1', updated: 't', channels: [] }))).toThrow(
      /Unsupported channel pack schemaVersion/,
    );
  });

  it('ignores unknown root properties on parse', () => {
    const raw = {
      schemaVersion: 1,
      id: packId,
      name: 'Net',
      version: '1',
      updated: '2026-10-17T18:00:00.000Z',
      futureField: true,
      channels: [
        {
          id: 'net',
          kind: 'channel',
          rxHz: 146_520_000,
          txHz: 146_520_000,
          extra: 'ignored',
        },
      ],
    };
    const parsed = parseChannelPack(JSON.stringify(raw));
    expect(parsed.name).toBe('Net');
    expect(parsed.channels).toHaveLength(1);
  });

  it('rejects duplicate channel ids and the Null Island coordinate pair', () => {
    const duplicate = {
      schemaVersion: 1,
      id: packId,
      name: 'Net',
      version: '1',
      updated: '2026-10-17T18:00:00.000Z',
      channels: [
        { id: 'a', kind: 'channel', rxHz: 1, txHz: 1 },
        { id: 'a', kind: 'channel', rxHz: 2, txHz: 2 },
      ],
    };
    expect(() => parseChannelPack(JSON.stringify(duplicate))).toThrow(/Duplicate channel id/);

    const nullIsland = {
      schemaVersion: 1,
      id: packId,
      name: 'Net',
      version: '1',
      updated: '2026-10-17T18:00:00.000Z',
      channels: [{ id: 'r', kind: 'repeater', rxHz: 146_940_000, txHz: 146_340_000, latitude: 0, longitude: 0 }],
    };
    expect(() => parseChannelPack(JSON.stringify(nullIsland))).toThrow(/\(0, 0\)/);
  });

  it('converts CTCSS and DCS tones', () => {
    const repeater = channel({
      id: RadioChannelId('11111111-2222-3333-4444-555555555555'),
      packChannelId: 'w5ka',
      kind: 'repeater',
      name: 'W5KA',
      callsign: 'W5KA',
      transmitFrequency: 146_340_000,
      receiveFrequency: 146_940_000,
      transmitTone: { tone: 1109, type: RadioToneType.CTCSS },
      receiveTone: { tone: 1109, type: RadioToneType.CTCSS },
    });
    const document = buildChannelPackDocument(metadata, [repeater]);
    expect(document.channels[0]?.txTone).toEqual({ type: 'ctcss', hz: 110.9 });
    const roundTrip = packChannelsToSavedChannels(parseChannelPack(serializeChannelPack(document)).channels);
    expect(roundTrip[0]?.transmitTone).toEqual({ tone: 1109, type: RadioToneType.CTCSS });
    expect(roundTrip[0]?.receiveTone).toEqual({ tone: 1109, type: RadioToneType.CTCSS });

    const dcs = channel({
      id: RadioChannelId('22222222-3333-4444-5555-666666666666'),
      packChannelId: 'dcs',
      kind: 'repeater',
      transmitFrequency: 446_000_000,
      receiveFrequency: 446_000_000,
      transmitTone: { tone: 23, type: RadioToneType.DCS },
      receiveTone: { tone: 23, type: RadioToneType.DCS },
    });
    const dcsDoc = buildChannelPackDocument(metadata, [dcs]);
    expect(dcsDoc.channels[0]?.txTone).toEqual({ type: 'dcs', code: 23 });
    const dcsRows = packChannelsToSavedChannels(parseChannelPack(serializeChannelPack(dcsDoc)).channels);
    expect(dcsRows[0]?.transmitTone).toEqual({ tone: 23, type: RadioToneType.DCS });
  });

  it('omits RepeaterBook rows by default and includes them when requested', () => {
    const hand = channel({ id: RadioChannelId('aaaaaaaa-1111-2222-3333-444444444444'), packChannelId: 'simplex' });
    const rb = channel({
      id: RadioChannelId('bbbbbbbb-1111-2222-3333-444444444444'),
      packChannelId: 'w5ka',
      kind: 'repeater',
      callsign: 'W5KA',
      transmitFrequency: 146_340_000,
      receiveFrequency: 146_940_000,
      sourceFormat: 'repeaterbook',
      sourceKey: 'rb:48:123',
      city: 'Austin',
      state: 'Texas',
    });

    const omitted = buildChannelPackDocument(metadata, [hand, rb]);
    expect(omitted.channels).toHaveLength(1);
    expect(countRepeaterBookChannels([hand, rb])).toBe(1);

    const included = buildChannelPackDocument(metadata, [hand, rb], { includeRepeaterBook: true });
    expect(included.channels).toHaveLength(2);
    expect(included.channels[1]?.provenance).toBe('repeaterbook');
    expect(included.channels[1]?.sourceKey).toBe('rb:48:123');

    const roundTrip = parseChannelPack(serializeChannelPack(included));
    expect(roundTrip.channels[1]?.provenance).toBe('repeaterbook');

    const imported = packChannelsToSavedChannels(roundTrip.channels);
    expect(imported[1]?.sourceFormat).toBe('repeaterbook');
    expect(buildChannelPackDocument(metadata, imported).channels).toHaveLength(1);
    expect(buildChannelPackDocument(metadata, imported, { includeRepeaterBook: true }).channels[1]?.provenance).toBe(
      'repeaterbook',
    );
  });

  it('mints unique pack channel ids when none are stored', () => {
    const first = channel({ id: RadioChannelId('aaaaaaaa-1111-2222-3333-444444444444'), name: 'Net A' });
    const second = channel({ id: RadioChannelId('bbbbbbbb-1111-2222-3333-444444444444'), name: 'Net A' });
    const document = buildChannelPackDocument(metadata, [first, second]);
    expect(document.channels.map((row) => row.id)).toEqual(['net-a', 'net-a-2']);
  });

  it('keeps a stored pack channel id from colliding with a minted one', () => {
    const named = channel({ id: RadioChannelId('aaaaaaaa-1111-2222-3333-444444444444'), name: 'Net A' });
    const stored = channel({
      id: RadioChannelId('bbbbbbbb-1111-2222-3333-444444444444'),
      name: 'Other',
      packChannelId: 'net-a',
    });
    const document = buildChannelPackDocument(metadata, [stored, named]);
    expect(document.channels.map((row) => row.id)).toEqual(['net-a', 'net-a-2']);
  });

  it('rejects oversized input, bad ids, partial coordinates, and unsafe frequencies', () => {
    expect(() => parseChannelPack('x'.repeat(CHANNEL_PACK_MAX_CHARS + 1))).toThrow(/too large/);
    expect(() =>
      parseChannelPack(
        JSON.stringify({
          schemaVersion: 1,
          id: 'not-a-uuid',
          name: 'Net',
          version: '1',
          updated: '2026-10-17T18:00:00.000Z',
          channels: [],
        }),
      ),
    ).toThrow(/UUID/);
    expect(() =>
      parseChannelPack(
        JSON.stringify({
          schemaVersion: 1,
          id: packId,
          name: 'N'.repeat(41),
          version: '1',
          updated: '2026-10-17T18:00:00.000Z',
          channels: [],
        }),
      ),
    ).toThrow(/40 characters/);

    const base = {
      schemaVersion: 1,
      id: packId,
      name: 'Net',
      version: '1',
      updated: '2026-10-17T18:00:00.000Z',
    };
    expect(() =>
      parseChannelPack(JSON.stringify({ ...base, channels: [{ id: 'r', kind: 'repeater', rxHz: 1, txHz: 1, latitude: 30 }] })),
    ).toThrow(/both be set/);
    expect(() =>
      parseChannelPack(
        JSON.stringify({ ...base, channels: [{ id: 'r', kind: 'repeater', rxHz: 1, txHz: 1, latitude: 91, longitude: 0 }] }),
      ),
    ).toThrow(/out of range/);
    expect(() =>
      parseChannelPack(JSON.stringify({ ...base, channels: [{ id: 'r', kind: 'channel', rxHz: 1e21, txHz: 1 }] })),
    ).toThrow(/positive integer/);

    const channels = Array.from({ length: CHANNEL_PACK_MAX_CHANNELS + 1 }, (_, index) => ({
      id: `ch-${index}`,
      kind: 'channel',
      rxHz: 1,
      txHz: 1,
    }));
    expect(() => parseChannelPack(JSON.stringify({ ...base, channels }))).toThrow(/too many channels/);
  });

  it('does not copy hostile keys onto objects', () => {
    const text =
      '{"__proto__":{"polluted":true},"schemaVersion":1,"id":"8f1c0b2e-7a4d-4c1e-9b6a-1d2e3f4a5b6c","name":"Net","version":"1","updated":"2026-10-17T18:00:00.000Z","channels":[{"id":"net","kind":"channel","rxHz":1,"txHz":1,"__proto__":{"polluted":true}}]}';
    const parsed = parseChannelPack(text);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect(parsed.channels[0]?.id).toBe('net');
    expect(Object.hasOwn(parsed, '__proto__')).toBe(false);
  });
});
