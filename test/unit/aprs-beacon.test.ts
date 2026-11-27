import { describe, expect, it } from 'vitest';
import { APRS_AX25_DESTINATION, canonicalAx25Call, formatAx25Call, parseAx25Ui } from '~/utils/aprs-ax25';
import {
  APRS_BEACON_TOCALL,
  encodeAprsBeaconFrame,
  formatAprsBeaconPositionBody,
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

  it('omits altitude when blank', () => {
    const { altitudeFt: _altitudeFt, ...rest } = beacon;
    expect(formatAprsBeaconPositionBody(rest)).toBe('=3031.12N/09752.74W-HamBench');
  });

  it('builds AX.25 with APZHMB and digipeater path', () => {
    expect(kf5ufj).toBeDefined();
    const frame = kf5ufj ? encodeAprsBeaconFrame(kf5ufj, beacon) : undefined;
    expect(frame).toBeDefined();
    const ui = frame ? parseAx25Ui(frame) : undefined;
    expect(ui?.destination.call).toBe('APZHMB');
    expect(formatAx25Call(ui!.destination)).toBe(APRS_BEACON_TOCALL);
    expect(ui?.path.map((hop) => formatAx25Call(hop))).toEqual(['WIDE1-1', 'WIDE2-1']);
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
});