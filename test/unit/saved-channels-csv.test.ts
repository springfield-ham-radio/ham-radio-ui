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
  transmitFrequency: Frequency(146_520_000),
  receiveFrequency: Frequency(146_520_000),
  transmitTone: { tone: 885, type: RadioToneType.CTCSS },
  receiveTone: { tone: 23, type: RadioToneType.DCS },
  notes: 'Club, "main" repeater',
  createdAt: 1_000,
  updatedAt: 2_000,
};

describe('saved-channels-csv', () => {
  it('round-trips portable channel fields through CSV', () => {
    const csv = serializeSavedChannelsCsv([sample]);
    const parsed = parseSavedChannelsCsv(csv);

    expect(parsed.channels).to.have.length(1);
    expect(parsed.channels[0]?.name).to.equal('Local RPT');
    expect(parsed.channels[0]?.transmitFrequency).to.equal(Frequency(146_520_000));
    expect(parsed.channels[0]?.receiveFrequency).to.equal(Frequency(146_520_000));
    expect(parsed.channels[0]?.transmitTone).to.deep.equal({ tone: 885, type: RadioToneType.CTCSS });
    expect(parsed.channels[0]?.receiveTone).to.deep.equal({ tone: 23, type: RadioToneType.DCS });
    expect(parsed.notes[0]).to.equal('Club, "main" repeater');
  });

  it('rejects CSV files missing required columns', () => {
    expect(() => parseSavedChannelsCsv('name,tx_mhz\nA,146.52\n')).to.throw(/missing required column/);
  });
});
