import { describe, expect, it } from 'vitest';
import { Frequency, RadioChannelId, RadioToneType } from '@springfield/ham-radio-api';
import {
  parseSavedChannelsCsv,
  serializeSavedChannelsCsv,
} from '../../app/utils/saved-channels-csv.ts';
import type { SavedChannel } from '../../app/utils/saved-channels-db.ts';

const sample: SavedChannel = {
  id: RadioChannelId('11111111-1111-1111-1111-111111111111'),
  name: 'Local RPT',
  kind: 'channel',
  transmitFrequency: Frequency(146_520_000),
  receiveFrequency: Frequency(146_520_000),
  transmitTone: { tone: 885, type: RadioToneType.CTCSS },
  receiveTone: { tone: 23, type: RadioToneType.DCS },
  notes: 'Club, "main" repeater',
  createdAt: 1_000,
  updatedAt: 2_000,
};

const repeaterBookCsv = `State ID,Rptr ID,Frequency,Input Freq,PL,TSQ,Nearest City,Landmark,County,State,Country,Lat,Long,Callsign,Use,Operational Status,FM Analog,DMR,D-Star,System Fusion,Notes,Last Update
23,21812,146.92500,146.32500,103.5,,Lyman,,York,Maine,United States,43.50189120,-70.72602590,WJ1L,OPEN,On-air,Yes,No,No,No,Club machine,2026-01-01
`;

describe('saved-channels-csv', () => {
  it('round-trips portable channel fields through CSV', () => {
    const csv = serializeSavedChannelsCsv([sample]);
    const parsed = parseSavedChannelsCsv(csv);

    expect(parsed.source).toBe('library');
    expect(parsed.channels).toHaveLength(1);
    expect(parsed.channels[0]?.name).toBe('Local RPT');
    expect(parsed.channels[0]?.transmitFrequency).toBe(Frequency(146_520_000));
    expect(parsed.channels[0]?.receiveFrequency).toBe(Frequency(146_520_000));
    expect(parsed.channels[0]?.transmitTone).toEqual({ tone: 885, type: RadioToneType.CTCSS });
    expect(parsed.channels[0]?.receiveTone).toEqual({ tone: 23, type: RadioToneType.DCS });
    expect(parsed.notes[0]).toBe('Club, "main" repeater');
    expect(parsed.kinds[0]).toBe('channel');
  });

  it('preserves a repeater kind through CSV', () => {
    const csv = serializeSavedChannelsCsv([{ ...sample, kind: 'repeater' }]);
    const parsed = parseSavedChannelsCsv(csv);

    expect(parsed.kinds[0]).toBe('repeater');
  });

  it('imports RepeaterBook CSV as repeater library rows', () => {
    const parsed = parseSavedChannelsCsv(repeaterBookCsv);

    expect(parsed.source).toBe('repeaterbook');
    expect(parsed.kinds).toEqual(['repeater']);
    expect(parsed.channels[0]?.name).toBe('WJ1L');
    expect(parsed.channels[0]?.receiveFrequency).toBe(Frequency(146_925_000));
    expect(parsed.channels[0]?.transmitFrequency).toBe(Frequency(146_325_000));
  });

  it('rejects CSV files missing required columns', () => {
    expect(() => parseSavedChannelsCsv('name,tx_mhz\nA,146.52\n')).toThrow(/missing required column/);
  });
});
