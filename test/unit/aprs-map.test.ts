import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeAprsMonitorLine } from '../../app/utils/aprs-decode.ts';
import { APRS_MAP_EXAMPLE_TEXT } from '../../app/utils/aprs-map-example.ts';
import { formatAprsHeardAt } from '../../app/utils/aprs-display.ts';
import {
  APRS_OWN_BEACON_RING_COLOR,
  aprsMapBounds,
  aprsMapCaption,
  aprsMapClickResult,
  aprsMapDetailsCall,
  aprsMapFeatures,
  aprsMapOwnBeaconFeature,
  aprsMapPopupLines,
  aprsMapUnlocatedCount,
  aprsOwnBeaconCirclePaint,
  aprsStationLabelLayout,
  aprsStationLabelPaint,
  isPlottableAprsPosition,
  resolveAprsMapOwnBeaconPosition,
} from '../../app/utils/aprs-map.ts';
import { defaultSavedRadioAprsBeacon } from '../../app/utils/aprs-beacon.ts';
import {
  HOME_STATION_ID,
  defaultStationAntennaStore,
  replaceStationInStore,
  updateRadioStation,
} from '../../app/utils/antenna-station.ts';
import { createAprsFoldState, foldAprsLine, type AprsStation } from '../../app/utils/aprs-stations.ts';

function stationsFrom(text: string): AprsStation[] {
  const state = createAprsFoldState();
  const receivedAt = '2026-11-07T18:00:00.000Z';

  for (const line of text.split('\n')) {
    foldAprsLine(state, line, decodeAprsMonitorLine(line), receivedAt);
  }

  return state.stations;
}

function homeAntennaStore() {
  let store = defaultStationAntennaStore();
  const home = store.stations.find((entry) => entry.id === HOME_STATION_ID);

  if (!home) {
    throw new Error('home');
  }

  return replaceStationInStore(
    store,
    updateRadioStation(home, {
      nickname: 'Home',
      latitude: 30.5187,
      longitude: -97.879,
      locationSource: 'coordinates',
    }),
  );
}

describe('APRS map caption', () => {
  it('says heard-only when the own beacon is not plotted', () => {
    expect(
      aprsMapCaption({
        plottedCount: 3,
        heardPlottedCount: 3,
        hasOwnBeacon: false,
        unlocatedCount: 0,
      }),
    ).toBe(
      '3 on the map. Heard this session only. The radio does not export its stored station list.',
    );
  });

  it('includes unlocated count and separates the own beacon from heard pins', () => {
    expect(
      aprsMapCaption({
        plottedCount: 2,
        heardPlottedCount: 1,
        hasOwnBeacon: true,
        unlocatedCount: 1,
      }),
    ).toBe(
      '2 on the map · 1 without a position. Includes this radio’s beacon. Other pins were heard this session only. The radio does not export its stored station list.',
    );
  });

  it('describes beacon-only map without heard traffic', () => {
    expect(
      aprsMapCaption({
        plottedCount: 1,
        heardPlottedCount: 0,
        hasOwnBeacon: true,
        unlocatedCount: 0,
      }),
    ).toBe(
      '1 on the map. Includes this radio’s beacon position; not heard this session. The radio does not export its stored station list.',
    );
  });
});

describe('APRS map click result', () => {
  it('selects a heard callsign when present', () => {
    expect(aprsMapClickResult({ heardCallsign: 'N0CALL', ownBeaconHit: false })).toEqual({
      kind: 'select',
      callsign: 'N0CALL',
    });
  });

  it('ignores an own-beacon hit when a heard station is underneath', () => {
    expect(aprsMapClickResult({ heardCallsign: 'W5XYZ', ownBeaconHit: true })).toEqual({
      kind: 'select',
      callsign: 'W5XYZ',
    });
  });

  it('does not dismiss when only the own beacon was hit', () => {
    expect(aprsMapClickResult({ heardCallsign: undefined, ownBeaconHit: true })).toEqual({ kind: 'own-beacon' });
  });

  it('dismisses on empty map', () => {
    expect(aprsMapClickResult({ heardCallsign: undefined, ownBeaconHit: false })).toEqual({ kind: 'dismiss' });
  });
});

describe('APRS map own beacon', () => {
  it('builds a distinct own-beacon feature labeled with My callsign', () => {
    const position = resolveAprsMapOwnBeaconPosition('kf5ufj-1', undefined, homeAntennaStore());

    expect(position).toMatchObject({
      callsign: 'KF5UFJ-1',
      latitude: 30.5187,
      longitude: -97.879,
    });
    expect(position?.label).toContain('30°');

    const feature = aprsMapOwnBeaconFeature(position);

    expect(feature?.properties.callsign).toBe('KF5UFJ-1');
    expect(feature?.geometry.coordinates).toEqual([-97.879, 30.5187]);
    expect(aprsMapFeatures([], 'KF5UFJ-1').features.some((entry) => entry.properties.callsign === 'KF5UFJ-1')).toBe(
      false,
    );
  });

  it('prefers saved aprsBeacon over station prefill', () => {
    const stored = {
      ...defaultSavedRadioAprsBeacon(),
      latitude: 31.1,
      longitude: -96.2,
    };
    const position = resolveAprsMapOwnBeaconPosition('KF5UFJ-1', stored, homeAntennaStore());

    expect(position?.latitude).toBe(31.1);
    expect(position?.longitude).toBe(-96.2);
  });

  it('extends fit bounds with the own-beacon point', () => {
    const stationMap = aprsMapFeatures(stationsFrom(`${APRS_MAP_EXAMPLE_TEXT}\n`));
    const withOwn = aprsMapBounds(stationMap, { latitude: 45.5, longitude: -122.6 });
    const withoutOwn = aprsMapBounds(stationMap);

    expect(withOwn?.maxLatitude).toBeGreaterThan(withoutOwn?.maxLatitude ?? 0);
    expect(aprsMapBounds({ type: 'FeatureCollection', features: [] }, { latitude: 30, longitude: -97 })).toEqual({
      minLongitude: -97,
      minLatitude: 30,
      maxLongitude: -97,
      maxLatitude: 30,
    });
  });

  it('styles the own-beacon marker with an accent ring', () => {
    const paint = aprsOwnBeaconCirclePaint();

    expect(paint['circle-stroke-color']).toBe(APRS_OWN_BEACON_RING_COLOR);
    expect(paint['circle-stroke-width']).toBeGreaterThan(2);
  });
});

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

const EXPECTED_LABEL_LAYOUT_SIZE = [
  'interpolate',
  ['linear'],
  ['zoom'],
  8,
  ['case', ['==', ['get', 'selected'], 1], 14, 12],
  12,
  ['case', ['==', ['get', 'selected'], 1], 16, 14],
  16,
  ['case', ['==', ['get', 'selected'], 1], 18, 16],
] as const;

const EXPECTED_LABEL_HALO_WIDTH = ['case', ['==', ['get', 'selected'], 1], 2, 1.75] as const;

describe('APRS map callsign labels', () => {
  it('uses Noto Sans Bold and keeps callsign field layout', () => {
    const layout = aprsStationLabelLayout();

    expect(layout['text-font']).toEqual(['Noto Sans Bold']);
    expect(layout['text-field']).toEqual(['get', 'callsign']);
    expect(layout['text-anchor']).toBe('top');
  });

  it('zoom-interpolates text-size with a selected bump at each stop', () => {
    const size = aprsStationLabelLayout()['text-size'];

    expect(size).toEqual(EXPECTED_LABEL_LAYOUT_SIZE);

    const unselectedStops = [12, 14, 16];
    const selectedStops = [14, 16, 18];

    for (const [index, unselected] of unselectedStops.entries()) {
      expect(unselected).toBeGreaterThan(11);
      const selected = selectedStops[index];
      expect(selected! - unselected).toBe(2);
    }
  });

  it('offsets labels below the circle with room for halo and stroke', () => {
    const layout = aprsStationLabelLayout();
    const yOffsetEms = layout['text-offset']?.[1];

    expect(layout['text-offset']).toEqual([0, 1.4]);

    const cases = [
      { fontSize: 12, radius: 6, halo: 1.75, label: 'unselected at zoom ≤ 8' },
      { fontSize: 14, radius: 8, halo: 2, label: 'selected at zoom ≤ 8' },
    ] as const;

    for (const { fontSize, radius, halo } of cases) {
      const gapPx = yOffsetEms! * fontSize - halo - (radius + 2);
      expect(gapPx, `clearance for ${cases.find((c) => c.fontSize === fontSize)?.label}`).toBeGreaterThanOrEqual(4);
    }
  });

  it('paints near-white type on a solid slate halo without blur', () => {
    const paint = aprsStationLabelPaint();

    expect(paint['text-color']).toBe('#f8fafc');
    expect(paint['text-halo-color']).toBe('#0f172a');
    expect(paint['text-halo-blur']).toBe(0);
    expect(paint['text-halo-width']).toEqual(EXPECTED_LABEL_HALO_WIDTH);

    for (const width of [1.75, 2]) {
      expect(width).toBeGreaterThanOrEqual(1.5);
      expect(width).toBeLessThanOrEqual(2);
      expect(width).toBeLessThanOrEqual(12 / 4);
    }
  });
});

describe('APRS map details card state', () => {
  it('opens and switches on choose', () => {
    expect(aprsMapDetailsCall(undefined, { type: 'choose', callsign: 'N0CALL' })).toBe('N0CALL');
    expect(aprsMapDetailsCall('N0CALL', { type: 'choose', callsign: 'W5XYZ' })).toBe('W5XYZ');
  });

  it('re-chooses the same callsign for reopen after dismiss', () => {
    expect(aprsMapDetailsCall('N0CALL', { type: 'choose', callsign: 'N0CALL' })).toBe('N0CALL');
  });

  it('dismisses', () => {
    expect(aprsMapDetailsCall('N0CALL', { type: 'dismiss' })).toBeUndefined();
  });

  it('retains an open callsign while it stays in the list', () => {
    expect(
      aprsMapDetailsCall('K5KTF-4', { type: 'retain', callsigns: ['K5KTF-4', 'W5XYZ'] }),
    ).toBe('K5KTF-4');
  });

  it('clears when the open callsign is gone', () => {
    expect(aprsMapDetailsCall('N0CALL', { type: 'retain', callsigns: ['W5XYZ'] })).toBeUndefined();
  });

  it('does not open the first row through retain alone', () => {
    expect(aprsMapDetailsCall(undefined, { type: 'retain', callsigns: ['W5XYZ'] })).toBeUndefined();
  });

  it('retains detailsCall when the callsign stays in the list without a plottable position', () => {
    expect(aprsMapDetailsCall('N0MSG', { type: 'retain', callsigns: ['N0MSG', 'W5XYZ'] })).toBe('N0MSG');
  });
});

describe('APRS map click-only details wiring', () => {
  it('uses detailsCall, dismiss, and no hover popup in AprsMap', () => {
    const aprsMap = readFileSync(new URL('../../app/components/AprsMap.vue', import.meta.url), 'utf8');

    expect(aprsMap).toContain('detailsCall');
    expect(aprsMap).toContain("emit('dismiss')");
    expect(aprsMap).toContain("event.key !== 'Escape'");
    expect(aprsMap).toContain('aprsMapClickResult');
    expect(aprsMap).toContain('queryRenderedFeatures(event.point, { layers: [CIRCLE_ID, LABEL_ID] })');
    expect(aprsMap).toContain('queryRenderedFeatures(event.point, { layers: [OWN_CIRCLE_ID, OWN_LABEL_ID] })');
    expect(aprsMap).toContain('suppressPopupCloseEmit');
    expect(aprsMap).toMatch(/function closePopup\(\)[\s\S]*suppressPopupCloseEmit = true[\s\S]*popup\.remove/);
    expect(aprsMap).toMatch(/popup\.on\('close'[\s\S]*if \(suppressPopupCloseEmit\)/);
    const closePopupSource = aprsMap.match(/function closePopup\(\)[\s\S]*?^}/m)?.[0] ?? '';
    expect(closePopupSource.length).toBeGreaterThan(0);
    expect(closePopupSource).not.toContain("emit('dismiss')");
    expect(aprsMap).toContain("removeEventListener('keydown', onWindowKeydown)");
    expect(aprsMap).toContain('instance.off(');
    expect(aprsMap).toContain('onPointerEnter');
    expect(aprsMap).toContain("instance.off('click', onMapClick)");
    expect(aprsMap).not.toContain('onLayerClick');
    expect(aprsMap).not.toContain('mousemove');
    expect(aprsMap).not.toMatch(/mouseenter[\s\S]*aprsMapPopupLines/);
    expect(aprsMap).toMatch(/if \(!station \|\| !feature/);
  });

  it('passes detailsCall and listens for dismiss in RadioAprs', () => {
    const radioAprs = readFileSync(new URL('../../app/components/RadioAprs.vue', import.meta.url), 'utf8');

    expect(radioAprs).toContain('aprsMapCaption');
    expect(radioAprs).toContain(':own-beacon="ownMapBeacon"');
    expect(radioAprs).toContain(':details-call="detailsCall"');
    expect(radioAprs).toContain('@dismiss="dismissMapDetails"');
    expect(radioAprs).toContain('aprsMapDetailsCall');
    expect(radioAprs).toMatch(/detailsCall\.value = aprsMapDetailsCall[\s\S]*type: 'retain'/);
  });

  it('keeps callsign labels on the symbol layer', () => {
    const source = readFileSync(new URL('../../app/utils/aprs-map.ts', import.meta.url), 'utf8');

    expect(source).toContain("'text-field': ['get', 'callsign']");
  });

  it('syncs the details popup while the style is still settling', () => {
    const aprsMap = readFileSync(new URL('../../app/components/AprsMap.vue', import.meta.url), 'utf8');
    const popupWatchSource = aprsMap.match(/watch\(popupKey[\s\S]*?^watch\(/m)?.[0] ?? '';
    const detailsCallWatchSource =
      aprsMap.match(/watch\(\s*\n?\s*\(\) => props\.detailsCall[\s\S]*?^\);/m)?.[0] ?? '';

    expect(popupWatchSource.length).toBeGreaterThan(0);
    expect(detailsCallWatchSource.length).toBeGreaterThan(0);
    expect(popupWatchSource).toContain('syncPopupWhenDetailsChange(instance)');
    expect(detailsCallWatchSource).toContain('syncPopupWhenDetailsChange(instance)');
    expect(popupWatchSource).not.toContain('isStyleLoaded');
    expect(detailsCallWatchSource).not.toContain('isStyleLoaded');
  });

  it('keeps isStyleLoaded on the collection watcher only', () => {
    const aprsMap = readFileSync(new URL('../../app/components/AprsMap.vue', import.meta.url), 'utf8');
    const collectionWatchSource = aprsMap.match(/watch\(\[collection, ownCollection\][\s\S]*?^watch\(/m)?.[0] ?? '';

    expect(collectionWatchSource.length).toBeGreaterThan(0);
    expect(collectionWatchSource).toContain('isStyleLoaded');
    expect(collectionWatchSource).toContain('setData(instance)');
  });

  it('does not dismiss details when easeTo starts from focus', () => {
    const aprsMap = readFileSync(new URL('../../app/components/AprsMap.vue', import.meta.url), 'utf8');
    const onMoveStartSource = aprsMap.match(/function onMoveStart\([\s\S]*?^}/m)?.[0] ?? '';

    expect(onMoveStartSource.length).toBeGreaterThan(0);
    expect(onMoveStartSource).not.toContain("emit('dismiss')");
    expect(onMoveStartSource).toContain('originalEvent');
  });

  it('retries popup sync on idle when style is not loaded yet', () => {
    const aprsMap = readFileSync(new URL('../../app/components/AprsMap.vue', import.meta.url), 'utf8');
    const syncWhenDetailsSource =
      aprsMap.match(/function syncPopupWhenDetailsChange\([\s\S]*?^}/m)?.[0] ?? '';

    expect(syncWhenDetailsSource.length).toBeGreaterThan(0);
    expect(syncWhenDetailsSource).toContain("instance.once('idle', attempt)");
    expect(syncWhenDetailsSource).toContain('syncPopup(instance)');
  });
});

describe('APRS map details open while map already mounted', () => {
  it('keeps detailsCall through choose then retain in one session', () => {
    let open = aprsMapDetailsCall(undefined, { type: 'choose', callsign: 'N0CALL' });

    expect(open).toBe('N0CALL');

    open = aprsMapDetailsCall(open, { type: 'retain', callsigns: ['N0CALL', 'W5XYZ'] });
    expect(open).toBe('N0CALL');

    open = aprsMapDetailsCall(open, { type: 'dismiss' });
    expect(open).toBeUndefined();

    open = aprsMapDetailsCall(open, { type: 'choose', callsign: 'N0CALL' });
    expect(open).toBe('N0CALL');
  });
});
