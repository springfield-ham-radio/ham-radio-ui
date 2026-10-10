import { readFileSync } from 'node:fs';
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
    expect(parsed.uses[0]).toBeUndefined();
    expect(parsed.onAir[0]).toBeUndefined();
  });

  it('round-trips repeater use and on-air through CSV', () => {
    const csv = serializeSavedChannelsCsv([{ ...sample, kind: 'repeater', use: 'closed', onAir: false }]);
    const parsed = parseSavedChannelsCsv(csv);

    expect(parsed.kinds[0]).toBe('repeater');
    expect(parsed.uses[0]).toBe('closed');
    expect(parsed.onAir[0]).toBe(false);
  });

  it('imports RepeaterBook CSV as repeater library rows', () => {
    const parsed = parseSavedChannelsCsv(repeaterBookCsv);

    expect(parsed.source).toBe('repeaterbook');
    expect(parsed.kinds).toEqual(['repeater']);
    expect(parsed.channels[0]?.name).toBeUndefined();
    expect(parsed.callsigns[0]).toBe('WJ1L');
    expect(parsed.channels[0]?.receiveFrequency).toBe(Frequency(146_925_000));
    expect(parsed.channels[0]?.transmitFrequency).toBe(Frequency(146_325_000));
    expect(parsed.uses[0]).toBe('open');
    expect(parsed.onAir[0]).toBe(true);
    expect(parsed.latitudes[0]).toBeCloseTo(43.5018912);
    expect(parsed.longitudes[0]).toBeCloseTo(-70.7260259);
    expect(parsed.replaceLinkedNodes).toBe(false);
    expect(parsed.linkedNodes[0]?.allstarNode).toBeUndefined();
    expect(parsed.linkedNodes[0]?.echolinkNode).toBeUndefined();
    expect(parsed.linkedNodes[0]?.irlpNode).toBeUndefined();
    expect(parsed.linkedNodes[0]?.wiresNode).toBeUndefined();
  });

  it('round-trips repeater coordinates and node numbers through the library CSV', () => {
    const csv = serializeSavedChannelsCsv([
      {
        ...sample,
        kind: 'repeater',
        latitude: 39.0997,
        longitude: -94.5786,
        allstarNode: '5517',
        echolinkNode: '353167',
        irlpNode: undefined,
        wiresNode: '1234',
      },
    ]);
    const parsed = parseSavedChannelsCsv(csv);

    expect(parsed.latitudes[0]).toBeCloseTo(39.0997);
    expect(parsed.longitudes[0]).toBeCloseTo(-94.5786);
    expect(parsed.replaceLinkedNodes).toBe(true);
    expect(parsed.replaceLinkedPresence).toBe(true);
    expect(parsed.linkedNodes[0]).toEqual({
      allstarNode: '5517',
      echolinkNode: '353167',
      irlpNode: undefined,
      wiresNode: '1234',
      allstar: true,
      echolink: true,
      irlp: false,
      wires: true,
    });

    const cleared = parseSavedChannelsCsv(csv.replace('5517', '0'));
    expect(cleared.linkedNodes[0]?.allstarNode).toBeUndefined();
    expect(cleared.linkedNodes[0]?.allstar).toBe(false);
    expect(cleared.latitudes[0]).toBeCloseTo(39.0997);
    expect(cleared.replaceLinkedNodes).toBe(true);
  });

  it('round-trips linked-system presence without a node number', () => {
    const csv = serializeSavedChannelsCsv([
      {
        ...sample,
        kind: 'repeater',
        allstar: true,
        echolink: false,
      },
    ]);
    const parsed = parseSavedChannelsCsv(csv);

    expect(parsed.linkedNodes[0]?.allstar).toBe(true);
    expect(parsed.linkedNodes[0]?.allstarNode).toBeUndefined();
    expect(parsed.linkedNodes[0]?.echolink).toBe(false);
    expect(parsed.replaceLinkedPresence).toBe(true);

    const zeroNode = parseSavedChannelsCsv(csv.replace(',,,,,,1,0,0,0', ',,0,,,,1,0,0,0'));
    expect(zeroNode.linkedNodes[0]?.allstarNode).toBeUndefined();
    expect(zeroNode.linkedNodes[0]?.allstar).toBe(true);
  });

  it('imports website CSV node columns onto repeater rows', () => {
    const csv = `Output Freq,Input Freq,Offset,Uplink Tone,Downlink Tone,"Location",lat,long,Call,Use,Op Status,EchoLink,IRLP,AllStar
145.600000,145.000000,-,79.7,79.7,"Algutsrum",56.68281700,16.56464800,SK7RFL,OPEN,On-Air,353167,,0
`;
    const parsed = parseSavedChannelsCsv(csv);

    expect(parsed.source).toBe('repeaterbook');
    expect(parsed.replaceLinkedNodes).toBe(true);
    expect(parsed.latitudes[0]).toBeCloseTo(56.682817);
    expect(parsed.longitudes[0]).toBeCloseTo(16.564648);
    expect(parsed.linkedNodes[0]).toEqual({
      allstarNode: undefined,
      echolinkNode: '353167',
      irlpNode: undefined,
      wiresNode: undefined,
      allstar: false,
      echolink: true,
      irlp: false,
      wires: false,
    });
  });

  it('leaves blank library coordinates and a Null Island pair unlocated', () => {
    const header = 'name,tx_mhz,rx_mhz,tx_tone_type,tx_tone,rx_tone_type,rx_tone,notes,kind,use,on_air,callsign,latitude,longitude';
    const csv = `${header}
Blank,146.940,146.340,CTCSS,107.2,CTCSS,107.2,,repeater,open,yes,W5KA,,
Zero,146.820,146.220,CTCSS,100.0,CTCSS,100.0,,repeater,open,yes,N5MHI,0,0
Equator,146.640,146.040,CTCSS,88.5,CTCSS,88.5,,repeater,open,yes,KE5RS,0,-97.85
`;
    const parsed = parseSavedChannelsCsv(csv);

    expect(parsed.source).toBe('library');
    expect(parsed.latitudes[0]).toBeUndefined();
    expect(parsed.longitudes[0]).toBeUndefined();
    expect(parsed.latitudes[1]).toBeUndefined();
    expect(parsed.longitudes[1]).toBeUndefined();
    expect(parsed.latitudes[2]).toBe(0);
    expect(parsed.longitudes[2]).toBeCloseTo(-97.85);
  });

  it('imports the Austin RepeaterBook export through the library parser with null coordinates', () => {
    const csv = readFileSync(new URL('../fixtures/austin-repeaters.csv', import.meta.url), 'utf8');
    const parsed = parseSavedChannelsCsv(csv);

    expect(parsed.source).toBe('repeaterbook');
    expect(parsed.latitudes.length).toBeGreaterThan(0);
    expect(parsed.latitudes.every((latitude) => latitude === undefined)).toBe(true);
    expect(parsed.longitudes.every((longitude) => longitude === undefined)).toBe(true);
  });

  it('rejects CSV files missing required columns', () => {
    expect(() => parseSavedChannelsCsv('name,tx_mhz\nA,146.52\n')).toThrow(/missing required column/);
  });
});
