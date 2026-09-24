import { describe, expect, it } from 'vitest';
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

      expect(parsed.format).toBe('repeaterbook');
      expect(parsed.repeaters).toHaveLength(2);

      const analog = parsed.repeaters[0]!;
      expect(analog.sourceKey).toBe('rb:23:21812');
      expect(analog.callsign).toBe('WJ1L');
      expect(analog.city).toBe('Lyman');
      expect(analog.state).toBe('Maine');
      expect(analog.receiveFrequency).toBe(Frequency(146_925_000));
      expect(analog.transmitFrequency).toBe(Frequency(146_325_000));
      expect(analog.transmitTone).toEqual({ tone: 1035, type: RadioToneType.CTCSS });
      expect(analog.receiveTone).toEqual({ tone: 0, type: RadioToneType.CTCSS });
      expect(analog.use).toBe('open');
      expect(analog.onAir).toBe(true);
      expect(analog.modes).toBe('FM');
    });

    it('parses RepeaterBook DCS PL codes and listed digital modes', () => {
      const parsed = parseRepeaterImportCsv(repeaterBookCsv);
      const digital = parsed.repeaters[1]!;

      expect(digital.transmitTone).toEqual({ tone: 23, type: RadioToneType.DCS });
      expect(digital.receiveTone).toEqual({ tone: 885, type: RadioToneType.CTCSS });
      expect(digital.modes).toBe('FM, DMR');
    });

    it('parses CHIRP CSV duplex, tone, TSQL, and DTCS rows', () => {
      const parsed = parseRepeaterImportCsv(chirpCsv);

      expect(parsed.format).toBe('chirp');
      expect(parsed.repeaters).toHaveLength(4);

      const minusOffset = parsed.repeaters[0]!;
      expect(minusOffset.sourceKey).toBe('chirp:1:146640000');
      expect(minusOffset.callsign).toBe('W1AW');
      expect(minusOffset.receiveFrequency).toBe(Frequency(146_640_000));
      expect(minusOffset.transmitFrequency).toBe(Frequency(146_040_000));
      expect(minusOffset.transmitTone).toEqual({ tone: 885, type: RadioToneType.CTCSS });
      expect(minusOffset.receiveTone).toEqual({ tone: 0, type: RadioToneType.CTCSS });
      expect(minusOffset.notes).toBe('Newington');

      const simplex = parsed.repeaters[1]!;
      expect(simplex.transmitFrequency).toBe(Frequency(146_520_000));
      expect(simplex.receiveFrequency).toBe(Frequency(146_520_000));
      expect(simplex.transmitTone.tone).toBe(0);

      const tsql = parsed.repeaters[2]!;
      expect(tsql.transmitFrequency).toBe(Frequency(447_100_000));
      expect(tsql.transmitTone).toEqual({ tone: 1000, type: RadioToneType.CTCSS });
      expect(tsql.receiveTone).toEqual({ tone: 1230, type: RadioToneType.CTCSS });

      const dtcs = parsed.repeaters[3]!;
      expect(dtcs.transmitTone).toEqual({ tone: 754, type: RadioToneType.DCS });
      expect(dtcs.receiveTone).toEqual({ tone: 754, type: RadioToneType.DCS });
    });

    it('parses a RepeaterBook search download that uses Output Freq and Call', () => {
      const csv = `Output Freq,Input Freq,Offset,Uplink Tone,Downlink Tone,Call,"Location",County,State,Modes,Digital Access
441.600000,446.60000,+,100.0,100.0,KE5RS,"Leander",Williamson,Texas,FM AllStar EchoLink ,
1293.100000,1273.10000,-,,,W5KA,"Austin - South Austin Med Ctr",Travis,Texas,DSTAR ,
927.187500,902.18750,-,151.4,151.4,K5TRA,"Austin",Travis,Texas,FM AllStar EchoLink P-25 ,293
`;
      const parsed = parseRepeaterImportCsv(csv);

      expect(parsed.format).toBe('repeaterbook');
      expect(parsed.repeaters).toHaveLength(3);

      const leander = parsed.repeaters[0]!;
      expect(leander.callsign).toBe('KE5RS');
      expect(leander.city).toBe('Leander');
      expect(leander.county).toBe('Williamson');
      expect(leander.state).toBe('Texas');
      expect(leander.receiveFrequency).toBe(Frequency(441_600_000));
      expect(leander.transmitFrequency).toBe(Frequency(446_600_000));
      expect(leander.transmitTone).toEqual({ tone: 1000, type: RadioToneType.CTCSS });
      expect(leander.receiveTone).toEqual({ tone: 1000, type: RadioToneType.CTCSS });
      expect(leander.modes).toBe('FM AllStar EchoLink');

      const noTone = parsed.repeaters[1]!;
      expect(noTone.callsign).toBe('W5KA');
      expect(noTone.transmitTone.tone).toBe(0);
      expect(noTone.receiveTone.tone).toBe(0);
      expect(noTone.modes).toBe('DSTAR');

      const access = parsed.repeaters[2]!;
      expect(access.notes).toBe('Digital access 293');
    });

    it('reads Use and Op Status from a RepeaterBook search export', () => {
      const csv = `Output Freq,Input Freq,Offset,Uplink Tone,Downlink Tone,"Location",Call,Use,Op Status,Mode
146.940000,146.34000,-,107.2,107.2,"Austin",W5KA,OPEN,On-air,FM
146.520000,146.520000,,,,"Austin",N5TEST,CLOSED,Off-air,FM
`;
      const parsed = parseRepeaterImportCsv(csv);

      expect(parsed.repeaters[0]?.use).toBe('open');
      expect(parsed.repeaters[0]?.onAir).toBe(true);
      expect(parsed.repeaters[1]?.use).toBe('closed');
      expect(parsed.repeaters[1]?.onAir).toBe(false);
    });

    it('rejects CSV files that are not RepeaterBook or CHIRP exports', () => {
      expect(() => parseRepeaterImportCsv('name,tx_mhz\nA,146.52\n')).toThrow(/RepeaterBook or CHIRP/);
    });
  });

  describe('importedRepeaterToRadioChannel', () => {
    it('keeps a RepeaterBook call sign off the portable channel name', () => {
      const parsed = parseRepeaterImportCsv(repeaterBookCsv);
      const channel = importedRepeaterToRadioChannel(parsed.repeaters[0]!);

      expect(channel.name).toBeUndefined();
      expect(parsed.repeaters[0]?.callsign).toBe('WJ1L');
      expect(channel.receiveFrequency).toBe(Frequency(146_925_000));
      expect(channel.transmitFrequency).toBe(Frequency(146_325_000));
      expect(channel.transmitTone).toEqual({ tone: 1035, type: RadioToneType.CTCSS });
    });
  });
});
