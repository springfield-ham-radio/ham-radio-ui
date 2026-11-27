import { describe, expect, it } from 'vitest';
import { APRS_AX25_DESTINATION, canonicalAx25Call, formatAx25Call, parseAx25Ui } from '~/utils/aprs-ax25';
import {
  APRS_BEACON_TOCALL,
  aprsBeaconSettingsError,
  encodeAprsBeaconFrame,
  formatAprsBeaconPositionBody,
  parseBeaconAltitudeFeet,
  parseBeaconDecimalDegrees,
  parseSavedRadioAprsBeacon,
} from '~/utils/aprs-beacon';
import { decodeAx25UiAprs } from '~/utils/aprs-decode';
import { createKissDecoderState, encodeKissData, pushKissBytes } from '~/utils/aprs-kiss';
import { encodeAprsMessageFrame } from '~/utils/aprs-message';

const kf5ufj = canonicalAx25Call('KF5UFJ-1');

const beacon: import('~/utils/aprs-beacon').SavedRadioAprsBeacon = {
  latitude: 30.5187,
  longitude: -97.879,
  symbolTable: '/',
  symbolCode: '-',
  comment: 'HamBench',
  altitudeFt: 1180,
  path: 'WIDE1-1,WIDE2-1',
  intervalMinutes: 30,
};

describe('APRS position beacon encode', () => {
  it('formats messaging-capable uncompressed position with altitude', () => {
    expect(formatAprsBeaconPositionBody(beacon)).toBe('=3031.12N/09752.74W-HamBench /A=001180');
  });

  it('formats southern and eastern hemispheres', () => {
    const southEast = {
      ...beacon,
      latitude: -33.8688,
      longitude: 151.2093,
      comment: 'Sydney',
      altitudeFt: undefined,
    };
    expect(formatAprsBeaconPositionBody(southEast)).toBe('=3352.13S/15112.56E-Sydney');
    const packet = decodeAx25UiAprs({
      destination: { call: 'APRS', ssid: 0 },
      source: { call: 'N0CALL', ssid: 0 },
      path: [],
      info: formatAprsBeaconPositionBody(southEast)!,
    });
    expect(packet.position?.label).toContain('S');
    expect(packet.position?.label).toContain('E');
  });

  it('places alternate symbol table between lat and lon and code after longitude', () => {
    const radio = { ...beacon, symbolTable: '\\', symbolCode: 'Y', comment: 'Alt', altitudeFt: undefined };
    const smallCircle = { ...beacon, symbolTable: '\\', symbolCode: 'o', comment: undefined, altitudeFt: undefined };
    expect(formatAprsBeaconPositionBody(radio)).toBe('=3031.12N\\09752.74WYAlt');
    expect(formatAprsBeaconPositionBody(smallCircle)).toBe('=3031.12N\\09752.74Wo');
    for (const body of [formatAprsBeaconPositionBody(radio)!, formatAprsBeaconPositionBody(smallCircle)!]) {
      const packet = decodeAx25UiAprs({
        destination: { call: 'APRS', ssid: 0 },
        source: { call: 'N0CALL', ssid: 0 },
        path: [],
        info: body,
      });
      expect(packet.kind).toBe('position');
      expect(packet.position?.symbolTable).toBe('\\');
    }
    expect(decodeAx25UiAprs({
      destination: { call: 'APRS', ssid: 0 },
      source: { call: 'N0CALL', ssid: 0 },
      path: [],
      info: formatAprsBeaconPositionBody(radio)!,
    }).position?.symbolCode).toBe('Y');
    expect(decodeAx25UiAprs({
      destination: { call: 'APRS', ssid: 0 },
      source: { call: 'N0CALL', ssid: 0 },
      path: [],
      info: formatAprsBeaconPositionBody(smallCircle)!,
    }).position?.symbolCode).toBe('o');
  });

  it('omits altitude when blank', () => {
    const { altitudeFt: _altitudeFt, ...rest } = beacon;
    expect(formatAprsBeaconPositionBody(rest)).toBe('=3031.12N/09752.74W-HamBench');
  });

  it('builds AX.25 with APZHMB and digipeater path without the H bit on digipeaters', () => {
    expect(kf5ufj).toBeDefined();
    const frame = kf5ufj ? encodeAprsBeaconFrame(kf5ufj, beacon) : undefined;
    expect(frame).toBeDefined();
    const ui = frame ? parseAx25Ui(frame) : undefined;
    expect(ui?.destination.call).toBe('APZHMB');
    expect(formatAx25Call(ui!.destination)).toBe(APRS_BEACON_TOCALL);
    expect(ui?.path.map((hop) => formatAx25Call(hop))).toEqual(['WIDE1-1', 'WIDE2-1']);
    expect(ui?.path.every((hop) => hop.repeated !== true)).toBe(true);
    for (let index = 0; index < ui!.path.length; index += 1) {
      const ssidByte = frame![(2 + index) * 7 + 6];
      expect(ssidByte! & 0x80).toBe(0);
    }
  });

  it('round-trips through the decoder', () => {
    const frame = kf5ufj ? encodeAprsBeaconFrame(kf5ufj, beacon) : undefined;
    const ui = frame ? parseAx25Ui(frame) : undefined;
    expect(ui).toBeDefined();
    const packet = ui ? decodeAx25UiAprs(ui) : undefined;
    expect(packet?.kind).toBe('position');
    expect(packet?.source).toBe('KF5UFJ-1');
    expect(packet?.destination).toBe(APRS_BEACON_TOCALL);
    expect(packet?.position?.label).toBe('30° 31.12′ N 97° 52.74′ W');
    expect(packet?.comment).toBe('HamBench');
    expect(packet?.altitude).toBe('1,180 ft');
  });

  it('still parses after KISS wrapping', () => {
    const frame = kf5ufj ? encodeAprsBeaconFrame(kf5ufj, beacon) : undefined;
    const kiss = frame ? encodeKissData(frame) : undefined;
    expect(kiss).toBeDefined();
  });

  it('leaves message destination APRS with an empty path', () => {
    const source = canonicalAx25Call('KF5UFJ-1');
    const kiss = source
      ? encodeAprsMessageFrame(source, { addressee: 'W1AW-1', kind: 'text', text: 'Hi', id: 'a' })
      : undefined;
    const payload = kiss ? pushKissBytes(createKissDecoderState(), kiss, 0).frames[0]?.data : undefined;
    const ax25 = payload ? parseAx25Ui(payload) : undefined;
    expect(ax25).toBeDefined();
    expect(formatAx25Call(ax25!.destination)).toBe(APRS_AX25_DESTINATION);
    expect(ax25?.path).toEqual([]);
  });

  it('rejects ambiguous coordinates, bad comments, and extra digipeaters', () => {
    expect(formatAprsBeaconPositionBody({ ...beacon, latitude: 91 })).toBeUndefined();
    expect(formatAprsBeaconPositionBody({ ...beacon, comment: '{bad' })).toBeUndefined();
    expect(formatAprsBeaconPositionBody({ ...beacon, comment: '/A=000100' })).toBeUndefined();
    expect(formatAprsBeaconPositionBody({ ...beacon, comment: '090/045 test' })).toBeUndefined();
    expect(
      encodeAprsBeaconFrame(kf5ufj!, { ...beacon, path: 'WIDE1-1,WIDE2-1,WIDE3-1' }),
    ).toBeUndefined();
  });

  it('clamps interval minutes when parsing storage', () => {
    expect(parseSavedRadioAprsBeacon({ ...beacon, intervalMinutes: 5 })?.intervalMinutes).toBe(10);
  });

  it('rejects non-numeric altitude text instead of dropping it', () => {
    expect(parseBeaconAltitudeFeet('abc')).toEqual({ error: 'Enter altitude in feet from 0 to 999999' });
    expect(parseBeaconAltitudeFeet('1180')).toEqual({ feet: 1180 });
    expect(parseBeaconAltitudeFeet('')).toEqual({});
    expect(parseBeaconAltitudeFeet('12.5').error).toBeDefined();
    expect(aprsBeaconSettingsError(beacon)).toBeUndefined();
  });

  it('treats blank decimal-degree text as invalid coordinates', () => {
    expect(parseBeaconDecimalDegrees('', '-97')).toBeUndefined();
    expect(parseBeaconDecimalDegrees('30.5', '   ')).toBeUndefined();
    expect(parseBeaconDecimalDegrees('  ', '0')).toBeUndefined();
    expect(parseBeaconDecimalDegrees('30.5187', '-97.879')).toEqual({ latitude: 30.5187, longitude: -97.879 });
  });
});