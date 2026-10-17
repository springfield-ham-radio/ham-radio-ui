import { describe, expect, it } from 'vitest';
import { Frequency, RadioChannelId, RadioToneType } from '@springfield/ham-radio-api';
import { serializeSavedChannelsChirpCsv } from '../../app/utils/chirp-csv.ts';
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

describe('chirp-csv', () => {
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
