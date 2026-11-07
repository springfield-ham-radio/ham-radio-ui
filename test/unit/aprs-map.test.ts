import { describe, expect, it } from 'vitest';
import { decodeAprsMonitorLine } from '../../app/utils/aprs-decode.ts';
import { APRS_MAP_EXAMPLE_TEXT } from '../../app/utils/aprs-map-example.ts';
import { formatAprsHeardAt } from '../../app/utils/aprs-display.ts';
import { aprsMapBounds, aprsMapFeatures, aprsMapPopupLines, aprsMapUnlocatedCount, isPlottableAprsPosition } from '../../app/utils/aprs-map.ts';
import { createAprsFoldState, foldAprsLine, type AprsStation } from '../../app/utils/aprs-stations.ts';

function stationsFrom(text: string): AprsStation[] {
  const state = createAprsFoldState();
  const receivedAt = '2026-11-07T18:00:00.000Z';

  for (const line of text.split('\n')) {
    foldAprsLine(state, line, decodeAprsMonitorLine(line), receivedAt);
  }

  return state.stations;
}

describe('APRS map points', () => {
  it('plots only stations with their own finite position', () => {
    const stations = stationsFrom(`${APRS_MAP_EXAMPLE_TEXT}\n`);
    const map = aprsMapFeatures(stations, 'K5KTF-4');

    expect(map.features.map((feature) => feature.properties.callsign).sort()).toEqual(['K5KTF-4', 'W5XYZ']);
    expect(aprsMapUnlocatedCount(stations)).toBe(2);
    const k5ktf = map.features.find((feature) => feature.properties.callsign === 'K5KTF-4');

    expect(k5ktf?.properties).toMatchObject({ selected: 1, label: '30° 31.12′ N 97° 52.74′ W' });
    expect(k5ktf?.geometry.coordinates[0]).toBeCloseTo(-(97 + 52.74 / 60), 5);
    expect(k5ktf?.geometry.coordinates[1]).toBeCloseTo(30 + 31.12 / 60, 5);
    expect(isPlottableAprsPosition({ latitude: 91, longitude: 0 })).toBe(false);
    expect(isPlottableAprsPosition({ latitude: Number.NaN, longitude: 0 })).toBe(false);
  });

  it('moves one station without adding a second marker', () => {
    const state = createAprsFoldState();
    const first = 'N0CALL>APRS:!4903.50N/07201.75W-Start';
    const moved = 'N0CALL>APRS:!4904.00N/07202.00W-Moved';
    foldAprsLine(state, first, decodeAprsMonitorLine(first), '2026-11-07T18:00:00.000Z');
    foldAprsLine(state, moved, decodeAprsMonitorLine(moved), '2026-11-07T18:01:00.000Z');

    const map = aprsMapFeatures(state.stations);

    expect(map.features).toHaveLength(1);
    expect(map.features[0]?.geometry.coordinates[1]).toBeCloseTo(49 + 4 / 60, 5);
    expect(map.features[0]?.properties.label).toContain('04.00');
    expect(aprsMapBounds(map)?.minLatitude).toBeCloseTo(49 + 4 / 60, 5);
  });

  it('does not plot an object position or an empty list', () => {
    const station: AprsStation = {
      callsign: 'N0CALL',
      packetCount: 1,
      lastHeardAt: '2026-11-07T18:00:00.000Z',
      reportedName: { value: 'OBJECT', heardAt: '2026-11-07T18:00:00.000Z' },
      reportedPosition: {
        value: { latitude: 30, longitude: -97, label: '30° 00.00′ N 97° 00.00′ W', symbolTable: '/', symbolCode: '/' },
        heardAt: '2026-11-07T18:00:00.000Z',
      },
      lastPacket: decodeAprsMonitorLine('not a packet'),
    };

    expect(aprsMapFeatures([station]).features).toEqual([]);
    expect(aprsMapBounds(aprsMapFeatures([]))).toBeUndefined();
    expect(aprsMapPopupLines(station)).toEqual(['N0CALL', `Last heard ${formatAprsHeardAt('2026-11-07T18:00:00.000Z')}`]);
    expect(aprsMapPopupLines(station).join(' ')).not.toContain('97');
  });

  it('includes a comment in the selection text only when it was decoded', () => {
    const stations = stationsFrom('K5KTF-4>APRS:!3031.12N/09752.74W-K5KTF TX/RX-iGate\n');
    const station = stations[0];

    expect(station).toBeDefined();
    expect(aprsMapPopupLines(station!).slice(0, 3)).toEqual([
      'K5KTF-4',
      '30° 31.12′ N 97° 52.74′ W',
      `Last heard ${formatAprsHeardAt('2026-11-07T18:00:00.000Z')}`,
    ]);
    expect(aprsMapPopupLines(station!)).toContain('K5KTF TX/RX-iGate');
  });
});
