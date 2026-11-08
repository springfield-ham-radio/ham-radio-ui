import { describe, expect, it } from 'vitest';
import { canonicalAx25Call, encodeAx25Ui, parseAx25Ui } from '../../app/utils/aprs-ax25.ts';
import { decodeAprsMonitorLine, decodeAx25UiAprs } from '../../app/utils/aprs-decode.ts';
import { aprsWeatherLines } from '../../app/utils/aprs-display.ts';
import { createAprsFoldState, foldAprsLine } from '../../app/utils/aprs-stations.ts';

describe('APRS monitor decode', () => {
  it('decodes an uncompressed position and leaves the comment', () => {
    const packet = decodeAprsMonitorLine('N0CALL>APRS,WIDE1-1:!4903.50N/07201.75W-Test /A=000180');

    expect(packet.kind).toBe('position');
    expect(packet.source).toBe('N0CALL');
    expect(packet.path).toEqual(['WIDE1-1']);
    expect(packet.position?.label).toBe('49° 03.50′ N 72° 01.75′ W');
    expect(packet.comment).toBe('Test');
    expect(packet.altitude).toBe('180 ft');
  });

  it('decodes the APRS 1.0.1 Mic-E examples', () => {
    const returning = decodeAprsMonitorLine('N0CALL>S32U6T:`(_fn"Oj/');

    expect(returning.kind).toBe('mic-e');
    expect(returning.positionComment).toBe('M3: Returning');
    expect(returning.position?.label).toBe('33° 25.64′ N 12° 07.74′ W');
    expect(returning.speedKnots).toBe(20);
    expect(returning.courseDegrees).toBe(251);

    const offset = decodeAprsMonitorLine('N0CALL>S32UVT:`(_fn"Oj/');

    expect(offset.position?.label).toBe('33° 25.64′ N 112° 07.74′ W');
    expect(offset.speedKnots).toBe(20);
    expect(offset.courseDegrees).toBe(251);
    expect(offset.position?.symbolCode).toBe('j');
    expect(offset.position?.symbolTable).toBe('/');

    const info = '`kX\u001cp:t>/"5p}';
    const station = decodeAprsMonitorLine(`N0CALL-9>SU3P0P,WIDE1-1:${info}`);

    expect(station.source).toBe('N0CALL-9');
    expect(station.positionComment).toBe('M1: En Route');
    expect(station.position?.label).toBe('35° 30.00′ N 79° 00.00′ W');
    expect(station.speedKnots).toBe(43);
    expect(station.courseDegrees).toBe(88);
    expect(station.altitude).toBe('180 m');
  });

  it('decodes a message without inventing a position', () => {
    const packet = decodeAprsMonitorLine('W1AW>APRS::KB1ABC-5 :Hello{1');

    expect(packet.kind).toBe('message');
    expect(packet.messageAddressee).toBe('KB1ABC-5');
    expect(packet.messageText).toBe('Hello');
    expect(packet.messageKind).toBe('text');
    expect(packet.position).toBeUndefined();
  });

  it('decodes weather with the units carried in the packet', () => {
    const packet = decodeAprsMonitorLine('WX>APRS:_10090556c220s004g005t077r010p020P030h50b10130');

    expect(packet.kind).toBe('weather');
    expect(aprsWeatherLines(packet.weather ?? {})).toEqual([
      'Wind 220°',
      'Wind speed 4 mph',
      'Gust 5 mph',
      'Temperature 77 °F',
      'Rain last hour 0.10 in',
      'Rain 24 h 0.20 in',
      'Rain since midnight 0.30 in',
      'Humidity 50%',
      'Pressure 1013.0 hPa',
    ]);
  });

  it('keeps malformed, NMEA, and unsupported lines without a fake position', () => {
    expect(decodeAprsMonitorLine('not a packet').kind).toBe('unparsed');
    expect(decodeAprsMonitorLine('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47').kind).toBe('nmea');
    expect(decodeAprsMonitorLine('N0CALL>APRS:T#001,002,003').unsupportedReason).toBe('Telemetry is not decoded');
    expect(decodeAprsMonitorLine('N0CALL>T4SQZZ:`(_fn"Oj/').unsupportedReason).toBe('Mic-E position ambiguity is not expanded');
    expect(decodeAprsMonitorLine('N0CALL>APRS:}W1AW>APRS:!4903.50N/07201.75W-').unsupportedReason).toBe(
      'Third-party packet is not decoded',
    );
  });
});

describe('APRS station updates', () => {
  it('keeps a decoded position when a later message has none', () => {
    const state = createAprsFoldState();
    foldAprsLine(state, 'pos', decodeAprsMonitorLine('N0CALL>APRS:!4903.50N/07201.75W-Test'), '2026-01-01T00:00:00.000Z');
    foldAprsLine(state, 'msg', decodeAprsMonitorLine('N0CALL>APRS::KB1ABC-5 :Hello'), '2026-01-01T00:00:05.000Z');

    const station = state.stations[0];

    expect(station?.position?.value.label).toContain('49° 03.50′ N');
    expect(station?.message?.value.text).toBe('Hello');
    expect(station?.packetCount).toBe(2);
    expect(station?.lastHeardAt).toBe('2026-01-01T00:00:05.000Z');
  });

  it('does not replace the sender position with an object position', () => {
    const state = createAprsFoldState();
    foldAprsLine(state, 'pos', decodeAprsMonitorLine('N0CALL>APRS:!4903.50N/07201.75W-Test'), '2026-01-01T00:00:00.000Z');
    foldAprsLine(
      state,
      'obj',
      decodeAprsMonitorLine('N0CALL>APRS:;OBJECT   *092345z3600.00N/07200.00W-'),
      '2026-01-01T00:00:10.000Z',
    );

    expect(state.stations[0]?.position?.value.label).toContain('49° 03.50′ N');
    expect(state.stations[0]?.reportedName?.value).toBe('OBJECT');
    expect(state.stations[0]?.reportedPosition?.value.label).toContain('36° 00.00′ N');
  });

  it('decodes the K5KTF-4 position from an AX.25 UI frame without inventing weather', () => {
    const source = canonicalAx25Call('K5KTF-4');
    const via = canonicalAx25Call('WIDE1-1');
    const info = '!3031.12NI09752.74W&K5KTF TX/RX-iGate';
    const frame = source && via ? encodeAx25Ui(source, info, [{ ...via, repeated: true }]) : undefined;
    const ax25 = frame ? parseAx25Ui(frame) : undefined;
    const packet = ax25 ? decodeAx25UiAprs(ax25) : undefined;

    expect(packet?.kind).toBe('position');
    expect(packet?.source).toBe('K5KTF-4');
    expect(packet?.destination).toBe('APRS');
    expect(packet?.path).toEqual(['WIDE1-1*']);
    expect(packet?.position?.symbolTable).toBe('I');
    expect(packet?.position?.symbolCode).toBe('&');
    expect(packet?.position?.label).toBe('30° 31.12′ N 97° 52.74′ W');
    expect(packet?.comment).toBe('K5KTF TX/RX-iGate');
    expect(packet?.weather).toBeUndefined();
    expect(packet?.raw).toBe('K5KTF-4>APRS,WIDE1-1*:!3031.12NI09752.74W&K5KTF TX/RX-iGate');
  });

  it('keeps a status frame off the map and drops a frame that is not UI', () => {
    const source = canonicalAx25Call('N0HRD');
    const status = source ? encodeAx25Ui(source, '>On duty') : undefined;
    const parsed = status ? parseAx25Ui(status) : undefined;
    const packet = parsed ? decodeAx25UiAprs(parsed) : undefined;

    expect(packet?.kind).toBe('status');
    expect(packet?.statusText).toBe('On duty');
    expect(packet?.position).toBeUndefined();
    expect(parseAx25Ui(Uint8Array.of(0x00, 0x03))).toBeUndefined();
  });

  it('stores a malformed line and does not create a station for it', () => {
    const state = createAprsFoldState();
    foldAprsLine(state, 'garbage !!!', decodeAprsMonitorLine('garbage !!!'), '2026-01-01T00:00:00.000Z');

    expect(state.stations).toEqual([]);
    expect(state.log[0]).toMatchObject({ text: 'garbage !!!', disposition: 'unparsed' });
  });

  it('sorts by last heard and drops the oldest station past the cap', async () => {
    const { APRS_STATION_LIMIT } = await import('../../app/utils/aprs-stations.ts');
    const state = createAprsFoldState();

    for (let index = 0; index < APRS_STATION_LIMIT + 1; index += 1) {
      const call = `N${index.toString().padStart(4, '0')}`.slice(0, 6);
      const stamp = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
      foldAprsLine(state, call, decodeAprsMonitorLine(`${call}>APRS:>heard`), stamp);
    }

    expect(state.stations).toHaveLength(APRS_STATION_LIMIT);
    expect(state.stations.some((station) => station.callsign === 'N0000')).toBe(false);
    expect(state.stations[0]?.lastHeardAt > (state.stations.at(-1)?.lastHeardAt ?? '')).toBe(true);
  });
});
