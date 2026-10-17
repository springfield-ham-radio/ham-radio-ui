import { describe, expect, it } from 'vitest';
import { Frequency, RadioChannelId, RadioToneType } from '@springfield/ham-radio-api';
import { CHIRP_CSV_HEADER, serializeSavedChannelsChirpCsv } from '../../app/utils/chirp-csv.ts';
import {
  importedRepeaterNotes,
  importedRepeaterToRadioChannel,
  parseRepeaterImportCsv,
} from '../../app/utils/repeater-import.ts';
import { parseSavedChannelsCsv } from '../../app/utils/saved-channels-csv.ts';
import { radioChannelToSavedChannel, type SavedChannel } from '../../app/utils/saved-channels-db.ts';

const chirpCsv = `Location,Name,Frequency,Duplex,Offset,Tone,rToneFreq,cToneFreq,DtcsCode,DtcsPolarity,Mode,TStep,Skip,Comment
1,W1AW,146.640000,-,0.600000,Tone,88.5,88.5,023,NN,FM,5.00,,Newington
2,Simplex,146.520000,,0.000000,,88.5,88.5,023,NN,FM,5.00,,
3,UHF,442.100000,+,5.000000,TSQL,100.0,123.0,023,NN,FM,25.00,,Portland
4,DCS,147.000000,-,0.600000,DTCS,88.5,88.5,754,NN,FM,5.00,,
`;

function savedChannelsFromChirpCsv(text: string): SavedChannel[] {
  const parsed = parseRepeaterImportCsv(text);

  return parsed.repeaters.map((repeater, index) =>
    radioChannelToSavedChannel(importedRepeaterToRadioChannel(repeater), {
      notes: importedRepeaterNotes(repeater),
      kind: 'repeater',
      sourceKey: repeater.sourceKey,
      sourceFormat: repeater.sourceFormat,
      modes: repeater.modes,
      id: RadioChannelId(`00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`),
      createdAt: 0,
      updatedAt: 0,
    }),
  );
}

function channel(overrides: Partial<SavedChannel> = {}): SavedChannel {
  return {
    id: RadioChannelId('11111111-1111-1111-1111-111111111111'),
    kind: 'channel',
    name: 'Local',
    transmitFrequency: Frequency(146_520_000),
    receiveFrequency: Frequency(146_520_000),
    transmitTone: { tone: 0, type: RadioToneType.CTCSS },
    receiveTone: { tone: 0, type: RadioToneType.CTCSS },
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function csvLine(text: string, index: number): string {
  return text.split('\r\n')[index] ?? '';
}

describe('chirp-csv', () => {
  it('writes the CHIRP generic header, CRLF rows, and quoted commas', () => {
    const csv = serializeSavedChannelsChirpCsv([
      channel({
        name: 'Club, "main"',
        notes: 'Newington, CT',
      }),
    ]);

    expect(csv.split('\r\n')[0]).toBe(CHIRP_CSV_HEADER);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.replaceAll('\r\n', '')).not.toContain('\n');
    expect(csvLine(csv, 1)).toContain('"Club, ""main"""');
    expect(csvLine(csv, 1)).toContain('"Newington, CT"');
    expect(CHIRP_CSV_HEADER.startsWith('Location,Name,Frequency,Duplex,Offset,Tone,')).toBe(true);
    expect(CHIRP_CSV_HEADER).toContain(',DtcsPolarity,RxDtcsCode,CrossMode,Mode,TStep,Skip,Comment');
  });

  it('numbers locations and fills CHIRP tone defaults', () => {
    const csv = serializeSavedChannelsChirpCsv([
      channel({ name: 'A' }),
      channel({
        id: RadioChannelId('22222222-2222-2222-2222-222222222222'),
        name: 'B',
        sourceFormat: 'chirp',
        sourceKey: 'chirp:4:146520000',
      }),
      channel({
        id: RadioChannelId('33333333-3333-3333-3333-333333333333'),
        name: 'C',
      }),
    ]);

    expect(csvLine(csv, 1).startsWith('1,A,146.520000,,0.000000,,88.5,88.5,023,NN,023,Tone->Tone,FM,5.00,,')).toBe(
      true,
    );
    expect(csvLine(csv, 2).startsWith('4,B,')).toBe(true);
    expect(csvLine(csv, 3).startsWith('2,C,')).toBe(true);
  });

  it('writes duplex +/-, split, and off with the matching offset', () => {
    const csv = serializeSavedChannelsChirpCsv([
      channel({
        name: 'Minus',
        receiveFrequency: Frequency(146_640_000),
        transmitFrequency: Frequency(146_040_000),
        transmitTone: { tone: 885, type: RadioToneType.CTCSS },
      }),
      channel({
        name: 'Plus',
        receiveFrequency: Frequency(442_100_000),
        transmitFrequency: Frequency(447_100_000),
        transmitTone: { tone: 1000, type: RadioToneType.CTCSS },
        receiveTone: { tone: 1230, type: RadioToneType.CTCSS },
      }),
      channel({
        name: 'Odd',
        receiveFrequency: Frequency(146_520_000),
        transmitFrequency: Frequency(446_000_000),
      }),
      channel({
        name: 'NoTx',
        receiveFrequency: Frequency(146_520_000),
        transmitFrequency: Frequency(0),
      }),
      channel({
        name: 'Narrow',
        modes: 'NFM',
        transmitTone: { tone: 23, type: RadioToneType.DCS },
        receiveTone: { tone: 23, type: RadioToneType.DCS },
      }),
      channel({
        name: 'Listen',
        receiveTone: { tone: 1000, type: RadioToneType.CTCSS },
      }),
    ]);

    expect(csvLine(csv, 1)).toContain(',146.640000,-,0.600000,Tone,88.5,88.5,023,NN,023,Tone->Tone,FM,5.00,,');
    expect(csvLine(csv, 2)).toContain(',442.100000,+,5.000000,TSQL,100.0,123.0,023,NN,023,Tone->Tone,FM,5.00,,');
    expect(csvLine(csv, 3)).toContain(',146.520000,split,446.000000,,88.5,88.5,023,NN,023,Tone->Tone,FM,5.00,,');
    expect(csvLine(csv, 4)).toContain(',146.520000,off,0.000000,,88.5,88.5,023,NN,023,Tone->Tone,FM,5.00,,');
    expect(csvLine(csv, 5)).toContain(',DTCS,88.5,88.5,023,NN,023,Tone->Tone,NFM,5.00,,');
    expect(csvLine(csv, 6)).toContain(',Cross,88.5,100.0,023,NN,023,->Tone,FM,5.00,,');

    const parsed = parseRepeaterImportCsv(csv);
    expect(parsed.repeaters[2]?.transmitFrequency).toBe(Frequency(446_000_000));
    expect(parsed.repeaters[2]?.receiveFrequency).toBe(Frequency(146_520_000));
    expect(parsed.repeaters[3]?.transmitFrequency).toBe(Frequency(0));
    expect(parsed.repeaters[5]?.transmitTone).toEqual({ tone: 0, type: RadioToneType.CTCSS });
    expect(parsed.repeaters[5]?.receiveTone).toEqual({ tone: 1000, type: RadioToneType.CTCSS });
    expect(parsed.repeaters[4]?.transmitTone).toEqual({ tone: 23, type: RadioToneType.DCS });
  });

  it('round-trips a cross tone and does not put repeater mode lists in Mode', () => {
    const csv = serializeSavedChannelsChirpCsv([
      channel({
        name: 'Mixed',
        transmitTone: { tone: 754, type: RadioToneType.DCS },
        receiveTone: { tone: 885, type: RadioToneType.CTCSS },
        modes: 'FM, DMR',
      }),
    ]);
    const parsed = parseRepeaterImportCsv(csv);

    expect(csvLine(csv, 1)).toContain(',Cross,88.5,88.5,754,NN,023,DTCS->Tone,FM,5.00,,');
    expect(csv).not.toContain('DMR');
    expect(parsed.repeaters[0]?.transmitTone).toEqual({ tone: 754, type: RadioToneType.DCS });
    expect(parsed.repeaters[0]?.receiveTone).toEqual({ tone: 885, type: RadioToneType.CTCSS });
    expect(parsed.repeaters[0]?.modes).toBe('FM');
  });

  it('round-trips CHIRP sample rows through export and import', () => {
    const original = parseRepeaterImportCsv(chirpCsv);
    const channels = savedChannelsFromChirpCsv(chirpCsv);
    const exported = serializeSavedChannelsChirpCsv(channels);
    const reimported = parseRepeaterImportCsv(exported);

    expect(reimported.format).toBe('chirp');
    expect(reimported.repeaters).toHaveLength(original.repeaters.length);

    for (let index = 0; index < original.repeaters.length; index += 1) {
      const before = original.repeaters[index]!;
      const after = reimported.repeaters[index]!;

      expect(after.callsign).toBe(before.callsign);
      expect(after.receiveFrequency).toBe(before.receiveFrequency);
      expect(after.transmitFrequency).toBe(before.transmitFrequency);
      expect(after.transmitTone).toEqual(before.transmitTone);
      expect(after.receiveTone).toEqual(before.receiveTone);
      expect(after.notes).toBe(before.notes);
      expect(after.sourceKey).toBe(before.sourceKey);
    }
  });

  it('is recognized by the shared channel CSV parser', () => {
    const channels = savedChannelsFromChirpCsv(chirpCsv);
    const exported = serializeSavedChannelsChirpCsv(channels);
    const parsed = parseSavedChannelsCsv(exported);

    expect(parsed.source).toBe('chirp');
    expect(parsed.channels[0]?.name).toBe('W1AW');
    expect(parsed.channels[0]?.receiveFrequency).toBe(Frequency(146_640_000));
    expect(parsed.channels[2]?.transmitTone).toEqual({ tone: 1000, type: RadioToneType.CTCSS });
    expect(parsed.channels[2]?.receiveTone).toEqual({ tone: 1230, type: RadioToneType.CTCSS });
    expect(parsed.channels[3]?.transmitTone).toEqual({ tone: 754, type: RadioToneType.DCS });
  });
});
