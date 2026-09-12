import { describe, it } from 'node:test';
import { expect } from 'chai';
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

    expect(parsed.source).to.equal('library');
    expect(parsed.channels).to.have.length(1);
    expect(parsed.channels[0]?.name).to.equal('Local RPT');
    expect(parsed.channels[0]?.transmitFrequency).to.equal(Frequency(146_520_000));
    expect(parsed.channels[0]?.receiveFrequency).to.equal(Frequency(146_520_000));
    expect(parsed.channels[0]?.transmitTone).to.deep.equal({ tone: 885, type: RadioToneType.CTCSS });
    expect(parsed.channels[0]?.receiveTone).to.deep.equal({ tone: 23, type: RadioToneType.DCS });
    expect(parsed.notes[0]).to.equal('Club, "main" repeater');
    expect(parsed.kinds[0]).to.equal('channel');
  });

  it('preserves a repeater kind through CSV', () => {
    const csv = serializeSavedChannelsCsv([{ ...sample, kind: 'repeater' }]);
    const parsed = parseSavedChannelsCsv(csv);

    expect(parsed.kinds[0]).to.equal('repeater');
  });

  it('imports RepeaterBook CSV as repeater library rows', () => {
    const parsed = parseSavedChannelsCsv(repeaterBookCsv);

    expect(parsed.source).to.equal('repeaterbook');
    expect(parsed.kinds).to.deep.equal(['repeater']);
    expect(parsed.channels[0]?.name).to.equal('WJ1L');
    expect(parsed.channels[0]?.receiveFrequency).to.equal(Frequency(146_925_000));
    expect(parsed.channels[0]?.transmitFrequency).to.equal(Frequency(146_325_000));
  });

  it('rejects CSV files missing required columns', () => {
    expect(() => parseSavedChannelsCsv('name,tx_mhz\nA,146.52\n')).to.throw(/missing required column/);
  });
});
