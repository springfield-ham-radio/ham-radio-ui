import { describe, it } from 'node:test';
import { expect } from 'chai';
import { Frequency, RadioToneType } from '@springfield/ham-radio-api';
import {
  importedRepeaterToRadioChannel,
  parseRepeaterImportCsv,
} from '../../app/utils/repeater-import.ts';

const repeaterBookCsv = `State ID,Rptr ID,Frequency,Input Freq,PL,TSQ,Nearest City,Landmark,County,State,Country,Lat,Long,Callsign,Use,Operational Status,FM Analog,DMR,D-Star,System Fusion,Notes,Last Update
23,21812,146.92500,146.32500,103.5,,Lyman,,York,Maine,United States,43.50189120,-70.72602590,WJ1L,OPEN,On-air,Yes,No,No,No,Club machine,2026-01-01
23,99,446.00000,441.00000,D023,88.5,Portland,West Peak,Cumberland,Maine,United States,43.66,-70.25,K1ABC,OPEN,On-air,Yes,Yes,No,No,,2026-02-02
`;

const chirpCsv = `Location,Name,Frequency,Duplex,Offset,Tone,rToneFreq,cToneFreq,DtcsCode,DtcsPolarity,Mode,TStep,Skip,Comment
1,W1AW,146.640000,-,0.600000,Tone,88.5,88.5,023,NN,FM,5.00,,Newington
2,Simplex,146.520000,,0.000000,,88.5,88.5,023,NN,FM,5.00,,
3,UHF,442.100000,+,5.000000,TSQL,100.0,123.0,023,NN,FM,25.00,,Portland
4,DCS,147.000000,-,0.600000,DTCS,88.5,88.5,754,NN,FM,5.00,,
`;

describe('repeater-import', () => {
  describe('parseRepeaterImportCsv', () => {
    it('parses RepeaterBook CSV into downlink RX and uplink TX', () => {
      const parsed = parseRepeaterImportCsv(repeaterBookCsv);

      expect(parsed.format).to.equal('repeaterbook');
      expect(parsed.repeaters).to.have.length(2);

      const analog = parsed.repeaters[0]!;
      expect(analog.sourceKey).to.equal('rb:23:21812');
      expect(analog.callsign).to.equal('WJ1L');
      expect(analog.city).to.equal('Lyman');
      expect(analog.state).to.equal('Maine');
      expect(analog.receiveFrequency).to.equal(Frequency(146_925_000));
      expect(analog.transmitFrequency).to.equal(Frequency(146_325_000));
      expect(analog.transmitTone).to.deep.equal({ tone: 1035, type: RadioToneType.CTCSS });
      expect(analog.receiveTone).to.deep.equal({ tone: 0, type: RadioToneType.CTCSS });
      expect(analog.operationalStatus).to.equal('On-air');
      expect(analog.modes).to.equal('FM');
    });

    it('parses RepeaterBook DCS PL codes and listed digital modes', () => {
      const parsed = parseRepeaterImportCsv(repeaterBookCsv);
      const digital = parsed.repeaters[1]!;

      expect(digital.transmitTone).to.deep.equal({ tone: 23, type: RadioToneType.DCS });
      expect(digital.receiveTone).to.deep.equal({ tone: 885, type: RadioToneType.CTCSS });
      expect(digital.modes).to.equal('FM, DMR');
    });

    it('parses CHIRP CSV duplex, tone, TSQL, and DTCS rows', () => {
      const parsed = parseRepeaterImportCsv(chirpCsv);

      expect(parsed.format).to.equal('chirp');
      expect(parsed.repeaters).to.have.length(4);

      const minusOffset = parsed.repeaters[0]!;
      expect(minusOffset.sourceKey).to.equal('chirp:1:146640000');
      expect(minusOffset.callsign).to.equal('W1AW');
      expect(minusOffset.receiveFrequency).to.equal(Frequency(146_640_000));
      expect(minusOffset.transmitFrequency).to.equal(Frequency(146_040_000));
      expect(minusOffset.transmitTone).to.deep.equal({ tone: 885, type: RadioToneType.CTCSS });
      expect(minusOffset.receiveTone).to.deep.equal({ tone: 0, type: RadioToneType.CTCSS });
      expect(minusOffset.notes).to.equal('Newington');

      const simplex = parsed.repeaters[1]!;
      expect(simplex.transmitFrequency).to.equal(Frequency(146_520_000));
      expect(simplex.receiveFrequency).to.equal(Frequency(146_520_000));
      expect(simplex.transmitTone.tone).to.equal(0);

      const tsql = parsed.repeaters[2]!;
      expect(tsql.transmitFrequency).to.equal(Frequency(447_100_000));
      expect(tsql.transmitTone).to.deep.equal({ tone: 1000, type: RadioToneType.CTCSS });
      expect(tsql.receiveTone).to.deep.equal({ tone: 1230, type: RadioToneType.CTCSS });

      const dtcs = parsed.repeaters[3]!;
      expect(dtcs.transmitTone).to.deep.equal({ tone: 754, type: RadioToneType.DCS });
      expect(dtcs.receiveTone).to.deep.equal({ tone: 754, type: RadioToneType.DCS });
    });

    it('rejects CSV files that are not RepeaterBook or CHIRP exports', () => {
      expect(() => parseRepeaterImportCsv('name,tx_mhz\nA,146.52\n')).to.throw(/RepeaterBook or CHIRP/);
    });
  });

  describe('importedRepeaterToRadioChannel', () => {
    it('copies callsign, frequencies, and tones into a portable channel', () => {
      const parsed = parseRepeaterImportCsv(repeaterBookCsv);
      const channel = importedRepeaterToRadioChannel(parsed.repeaters[0]!);

      expect(channel.name).to.equal('WJ1L');
      expect(channel.receiveFrequency).to.equal(Frequency(146_925_000));
      expect(channel.transmitFrequency).to.equal(Frequency(146_325_000));
      expect(channel.transmitTone).to.deep.equal({ tone: 1035, type: RadioToneType.CTCSS });
    });
  });
});
