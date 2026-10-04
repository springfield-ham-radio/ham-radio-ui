import { describe, expect, it } from 'vitest';
import {
  addAntennaToStore,
  addStationToStore,
  antennaIsAtStation,
  antennasAtStation,
  antennaDraftErrors,
  applyAntennaTypeToDraft,
  applyLicenseGridToHomeIfEmpty,
  createRadioStation,
  contactAntennaLabel,
  createStationAntenna,
  defaultAntennaDraft,
  defaultAntennaWhatIf,
  defaultHomeStation,
  defaultStationAntennaStore,
  formatAntennaGeometry,
  formatAntennaProduct,
  formatAntennaSummary,
  formatStationAntennaLogLabel,
  formatAntennaBands,
  formatHeadingDeg,
  formatStationLocation,
  HOME_STATION_ID,
  parseStationAntennaStore,
  antennasOnRadio,
  removeAntennaFromStore,
  removeAntennasForRadio,
  removeStationFromStore,
  replaceAntennaInStore,
  resolveAntennaView,
  resolveStationLocation,
  selectAntennaInStore,
  selectedRadioStation,
  selectedStationAntenna,
  selectStationInStore,
  serializeStationAntennaStore,
  stationDraftErrors,
  updateStationAntenna,
} from '../../app/utils/antenna-station.ts';

function sampleDraft() {
  return {
    nickname: 'Backyard Yagi',
    typeId: 'yagi-3el' as const,
    heightAglM: 15,
    headingDeg: 45,
    bands: ['20m', '15m', '10m'] as const,
  };
}

describe('station antennas', () => {
  it('should default the store to Home with no antennas', () => {
    const store = defaultStationAntennaStore();

    expect(store.stations).toHaveLength(1);
    expect(store.stations[0]?.id).toBe(HOME_STATION_ID);
    expect(store.stations[0]?.nickname).toBe('Home');
    expect(store.selectedStationId).toBe(HOME_STATION_ID);
    expect(store.antennas).toEqual([]);
    expect(store.selectedId).toBe(undefined);
  });

  it('should fill a dipole draft from the generic type', () => {
    const draft = defaultAntennaDraft('dipole');

    expect(draft.typeId).toBe('dipole');
    expect(draft.heightAglM).toBe(10);
    expect(draft.headingDeg).toBe(45);
    expect(draft.bands).toEqual(['40m']);
    expect(draft.trapped).toBe(false);
  });

  it('should default a tribander Yagi to trapped 20/15/10', () => {
    const draft = defaultAntennaDraft('yagi-3el');

    expect(draft.bands).toEqual(['20m', '15m', '10m']);
    expect(draft.trapped).toBe(true);
  });

  it('should default a dual-band vertical to 2 m / 70 cm without heading', () => {
    const draft = defaultAntennaDraft('dual-band-vertical');

    expect(draft.typeId).toBe('dual-band-vertical');
    expect(draft.heightAglM).toBe(8);
    expect(draft.headingDeg).toBe(undefined);
    expect(draft.bands).toEqual(['2m', '70cm']);
  });

  it('should default a 2 m Yagi to 2 m with a boom heading', () => {
    const draft = defaultAntennaDraft('vhf-yagi');

    expect(draft.bands).toEqual(['2m']);
    expect(draft.headingDeg).toBe(45);
  });

  it('should omit heading on an omni what-if', () => {
    const whatIf = defaultAntennaWhatIf(defaultAntennaDraft('quarter-wave-vertical'));

    expect(whatIf.typeId).toBe('quarter-wave-vertical');
    expect(whatIf.headingDeg).toBe(undefined);
  });

  it('should name an antenna after its type when the nickname is blank', () => {
    const antenna = createStationAntenna(
      { ...sampleDraft(), nickname: '  ' },
      { id: 'ant-1', now: 1 },
    );

    expect(antenna.nickname).toBe('3-element Yagi');
    expect(antenna.id).toBe('ant-1');
  });

  it('should drop heading when saving a vertical', () => {
    const antenna = createStationAntenna(
      {
        nickname: 'Driveway',
        typeId: 'quarter-wave-vertical',
        heightAglM: 2,
        headingDeg: 180,
        bands: ['40m'],
      },
      { id: 'ant-v', now: 1 },
    );

    expect(antenna.headingDeg).toBe(undefined);
  });

  it('should reject a missing height and a non-numeric heading', () => {
    expect(antennaDraftErrors({ ...sampleDraft(), heightAglM: Number.NaN })?.heightAglM).toBeTypeOf('string');
    expect(antennaDraftErrors({ ...sampleDraft(), headingDeg: Number.NaN })?.headingDeg).toBeTypeOf('string');
    expect(antennaDraftErrors(sampleDraft())).toBe(undefined);
  });

  it('should wrap a heading of 360 to 0', () => {
    const antenna = createStationAntenna({ ...sampleDraft(), headingDeg: 360 }, { id: 'ant-1', now: 1 });

    expect(antenna.headingDeg).toBe(0);
  });

  it('should reset height and bands when the type changes', () => {
    const next = applyAntennaTypeToDraft(sampleDraft(), 'dipole');

    expect(next.typeId).toBe('dipole');
    expect(next.heightAglM).toBe(10);
    expect(next.bands).toEqual(['40m']);
    expect(next.trapped).toBe(false);
    expect(next.nickname).toBe('Backyard Yagi');
  });

  it('should round-trip the store and ignore unknown fields', () => {
    const antenna = createStationAntenna(sampleDraft(), { id: 'ant-1', now: 10 });
    const store = addAntennaToStore(defaultStationAntennaStore(), antenna);
    const parsed = parseStationAntennaStore(
      JSON.stringify({
        antennas: JSON.parse(serializeStationAntennaStore(store)).antennas.map((entry: object) => ({
          ...entry,
          extra: true,
        })),
        selectedId: 'ant-1',
        extra: true,
      }),
    );

    expect(parsed.selectedId).toBe('ant-1');
    expect(parsed.antennas).toHaveLength(1);
    expect(parsed.antennas[0]?.nickname).toBe('Backyard Yagi');
    expect(parsed.antennas[0]?.typeId).toBe('yagi-3el');
    expect(parsed.antennas[0]?.trapped).toBe(true);
  });

  it('should treat a stored tribander without a trapped flag as trapped', () => {
    const parsed = parseStationAntennaStore(
      JSON.stringify({
        selectedId: 'ant-1',
        antennas: [
          {
            id: 'ant-1',
            typeId: 'yagi-3el',
            nickname: 'Tribander',
            heightAglM: 15,
            headingDeg: 45,
            bands: ['20m', '15m', '10m'],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      }),
    );

    expect(parsed.antennas[0]?.trapped).toBe(true);
  });

  it('should keep an 80/40 dipole trapped and ignore traps on a magloop', () => {
    const dipole = createStationAntenna(
      {
        nickname: '80/40',
        typeId: 'dipole',
        heightAglM: 12,
        headingDeg: 90,
        bands: ['80m', '40m'],
        trapped: true,
      },
      { id: 'ant-d', now: 1 },
    );

    expect(dipole.trapped).toBe(true);
    expect(formatAntennaBands(dipole.bands, dipole.trapped === true)).toBe('80 m, 40 m · traps at 40 m');

    const parsed = parseStationAntennaStore(
      JSON.stringify({
        selectedId: 'ant-m',
        antennas: [
          {
            id: 'ant-m',
            typeId: 'magloop',
            heightAglM: 2,
            bands: ['40m', '20m'],
            trapped: true,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      }),
    );

    expect(parsed.antennas[0]?.trapped).toBe(undefined);
  });

  it('should keep 2 m / 70 cm tags and drop unknown bands', () => {
    const parsed = parseStationAntennaStore(
      JSON.stringify({
        selectedId: 'ant-v',
        antennas: [
          {
            id: 'ant-v',
            typeId: 'dual-band-vertical',
            nickname: 'Roof vertical',
            heightAglM: 8,
            bands: ['2m', '70cm', '23cm'],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      }),
    );

    expect(parsed.antennas[0]?.bands).toEqual(['2m', '70cm']);
  });

  it('should fall back to defaults when storage is empty or invalid', () => {
    expect(parseStationAntennaStore(null).stations[0]?.id).toBe(HOME_STATION_ID);
    expect(parseStationAntennaStore('').antennas).toEqual([]);
    expect(parseStationAntennaStore('{').stations[0]?.nickname).toBe('Home');
    expect(parseStationAntennaStore('[]').selectedStationId).toBe(HOME_STATION_ID);
  });

  it('should drop unknown types and fall selectedId back to the first remaining antenna', () => {
    const parsed = parseStationAntennaStore(
      JSON.stringify({
        selectedId: 'gone',
        antennas: [
          { id: 'bad', typeId: 'A3S', heightAglM: 10, createdAt: 1, updatedAt: 1 },
          {
            id: 'ant-1',
            typeId: 'dipole',
            nickname: '40m',
            heightAglM: 12,
            headingDeg: 90,
            bands: ['40m'],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      }),
    );

    expect(parsed.antennas.map((antenna) => antenna.id)).toEqual(['ant-1']);
    expect(parsed.selectedId).toBe('ant-1');
  });

  it('should select the added antenna and move selection after remove', () => {
    const first = createStationAntenna(sampleDraft(), { id: 'ant-1', now: 1 });
    const second = createStationAntenna({ ...sampleDraft(), nickname: 'Spare' }, { id: 'ant-2', now: 2 });
    let store = addAntennaToStore(defaultStationAntennaStore(), first);
    store = addAntennaToStore(store, second);

    expect(selectedStationAntenna(store)?.id).toBe('ant-2');

    store = selectAntennaInStore(store, 'ant-1');
    expect(selectedStationAntenna(store)?.id).toBe('ant-1');

    store = removeAntennaFromStore(store, 'ant-1');
    expect(selectedStationAntenna(store)?.id).toBe('ant-2');
  });

  it('should preserve id and createdAt on update', () => {
    const antenna = createStationAntenna(sampleDraft(), { id: 'ant-1', now: 5 });
    const updated = updateStationAntenna(antenna, { ...sampleDraft(), heightAglM: 18 }, 9);

    expect(updated.id).toBe('ant-1');
    expect(updated.createdAt).toBe(5);
    expect(updated.updatedAt).toBe(9);
    expect(updated.heightAglM).toBe(18);
  });

  it('should move a selected antenna to another station on update', () => {
    const cabin = createRadioStation({ nickname: 'Cabin' }, { id: 'station-cabin', now: 2 });
    const antenna = createStationAntenna(sampleDraft(), { id: 'ant-1', now: 1 });
    let store = addAntennaToStore(defaultStationAntennaStore(), antenna);
    store = addStationToStore(store, cabin);
    store = selectAntennaInStore(store, 'ant-1');

    const updated = updateStationAntenna(antenna, { ...sampleDraft(), stationId: 'station-cabin' }, 9);
    store = replaceAntennaInStore(store, updated);

    expect(updated.stationId).toBe('station-cabin');
    expect(store.antennas[0]?.stationId).toBe('station-cabin');
    expect(store.selectedStationId).toBe('station-cabin');
    expect(store.selectedId).toBe('ant-1');
  });

  it('should resolve a station view from the selected antenna and a what-if from the scratch draft', () => {
    const antenna = createStationAntenna(sampleDraft(), { id: 'ant-1', now: 1 });
    const store = addAntennaToStore(defaultStationAntennaStore(), antenna);
    const station = resolveAntennaView(store, 'station', defaultAntennaWhatIf());
    const whatIf = resolveAntennaView(store, 'what-if', {
      typeId: 'dipole',
      heightAglM: 12,
      headingDeg: 90,
    });

    expect(station?.source).toBe('station');
    expect(station?.nickname).toBe('Backyard Yagi');
    expect(station?.type.id).toBe('yagi-3el');
    expect(station?.trapped).toBe(true);
    expect(station?.gainDbi).toBe(6.5);
    expect(whatIf?.source).toBe('what-if');
    expect(whatIf?.type.id).toBe('dipole');
    expect(whatIf?.heightAglM).toBe(12);
    expect(whatIf?.headingDeg).toBe(90);
    expect(whatIf?.takeoffDeg).toBeTypeOf('number');
  });

  it('should format geometry and omit a nickname that matches the type', () => {
    const antenna = createStationAntenna({ ...sampleDraft(), nickname: '3-element Yagi' }, { id: 'ant-1', now: 1 });

    expect(formatAntennaGeometry(antenna)).toBe('3-element Yagi · 15 m AGL · 045°');
    expect(formatAntennaSummary(antenna)).toBe('3-element Yagi · 15 m AGL · 045°');
    expect(formatAntennaSummary(createStationAntenna(sampleDraft(), { id: 'ant-2', now: 1 }))).toBe(
      'Backyard Yagi · 3-element Yagi · 15 m AGL · 045°',
    );
    expect(formatHeadingDeg(undefined, false)).toBe(undefined);
    expect(formatStationAntennaLogLabel(antenna, 'Home')).toBe('Home · 3-element Yagi · 15 m AGL · 045°');
  });

  it('should store manufacturer and model and drop blank text', () => {
    const antenna = createStationAntenna(
      { ...sampleDraft(), manufacturer: ' Diamond ', model: 'X50A' },
      { id: 'ant-1', now: 1 },
    );

    expect(antenna.manufacturer).toBe('Diamond');
    expect(antenna.model).toBe('X50A');
    expect(formatAntennaProduct(antenna)).toBe('Diamond X50A');
    expect(formatAntennaSummary(antenna)).toBe('Backyard Yagi · Diamond X50A · 3-element Yagi · 15 m AGL · 045°');

    const parsed = parseStationAntennaStore(serializeStationAntennaStore(addAntennaToStore(defaultStationAntennaStore(), antenna)));

    expect(parsed.antennas[0]?.manufacturer).toBe('Diamond');
    expect(parsed.antennas[0]?.model).toBe('X50A');

    const cleared = createStationAntenna({ ...sampleDraft(), manufacturer: '  ', model: '' }, { id: 'ant-2', now: 2 });

    expect(cleared.manufacturer).toBeUndefined();
    expect(cleared.model).toBeUndefined();
    expect(formatAntennaProduct(cleared)).toBeUndefined();
  });

  it('should keep a radio-mounted antenna off the station and drop it with the radio', () => {
    const whip = createStationAntenna(
      {
        nickname: 'Signal Stick',
        typeId: 'dual-band-vertical',
        heightAglM: 1.5,
        bands: ['2m', '70cm'],
        radioId: 'radio-ht',
      },
      { id: 'ant-ht', now: 3 },
    );
    const stationAntenna = createStationAntenna(sampleDraft(), { id: 'ant-home', now: 1 });
    let store = addAntennaToStore(defaultStationAntennaStore(), stationAntenna);
    store = addAntennaToStore(store, whip);

    expect(whip.stationId).toBeUndefined();
    expect(whip.radioId).toBe('radio-ht');
    expect(store.selectedId).toBe('ant-home');
    expect(antennasOnRadio(store, 'radio-ht').map((antenna) => antenna.id)).toEqual(['ant-ht']);
    expect(store.antennas.find((antenna) => antenna.id === 'ant-home')?.stationId).toBe(HOME_STATION_ID);

    const parsed = parseStationAntennaStore(serializeStationAntennaStore(store));

    expect(parsed.antennas.find((antenna) => antenna.id === 'ant-ht')).toMatchObject({
      radioId: 'radio-ht',
      nickname: 'Signal Stick',
    });
    expect(parsed.antennas.find((antenna) => antenna.id === 'ant-ht')?.stationId).toBeUndefined();
    expect(parsed.selectedId).toBe('ant-home');

    store = removeAntennasForRadio(store, 'radio-ht');
    expect(store.antennas.map((antenna) => antenna.id)).toEqual(['ant-home']);
    expect(formatStationAntennaLogLabel(whip, 'UV-5R')).toBe('UV-5R · Signal Stick · Dual-band vertical · 1.5 m AGL');
  });

  it('should never list a radio-mounted antenna at a station, even when a station is removed', () => {
    const whip = createStationAntenna(
      {
        nickname: 'Signal Stick',
        typeId: 'dual-band-vertical',
        heightAglM: 1.5,
        bands: ['2m', '70cm'],
        radioId: 'radio-ht',
      },
      { id: 'ant-ht', now: 3 },
    );
    const homeAntenna = createStationAntenna(sampleDraft(), { id: 'ant-home', now: 1 });
    const portable = createRadioStation({ nickname: 'Portable' }, { id: 'station-portable', now: 2 });
    let store = addStationToStore(defaultStationAntennaStore(), portable);
    store = addAntennaToStore(store, homeAntenna);
    store = addAntennaToStore(store, whip);

    expect(antennaIsAtStation(whip, undefined)).toBe(false);
    expect(antennaIsAtStation(whip, HOME_STATION_ID)).toBe(false);
    expect(antennaIsAtStation(homeAntenna, HOME_STATION_ID)).toBe(true);
    expect(antennaIsAtStation(homeAntenna, undefined)).toBe(false);
    expect(antennasAtStation(store, HOME_STATION_ID).map((antenna) => antenna.id)).toEqual(['ant-home']);
    expect(antennasAtStation(store, 'station-portable')).toEqual([]);

    store = removeStationFromStore(store, HOME_STATION_ID);

    expect(store.antennas.map((antenna) => antenna.id)).toEqual(['ant-ht']);
    expect(antennasAtStation(store)).toEqual([]);
    expect(store.selectedId).toBeUndefined();
    expect(antennasOnRadio(store, 'radio-ht').map((antenna) => antenna.id)).toEqual(['ant-ht']);
  });

  it('should fill a contact with the radio antenna when it is the only one that covers the band', () => {
    const whip = createStationAntenna(
      {
        nickname: 'Signal Stick',
        typeId: 'dual-band-vertical',
        heightAglM: 1.5,
        bands: ['2m', '70cm'],
        radioId: 'radio-ht',
      },
      { id: 'ant-ht', now: 3 },
    );
    const spare = createStationAntenna(
      {
        nickname: 'Rubber duck',
        typeId: 'dual-band-vertical',
        heightAglM: 1.5,
        bands: ['2m', '70cm'],
        radioId: 'radio-ht',
      },
      { id: 'ant-duck', now: 4 },
    );
    const yagi = createStationAntenna(sampleDraft(), { id: 'ant-home', now: 1 });
    const roof = createStationAntenna(
      {
        nickname: 'Roof vertical',
        typeId: 'dual-band-vertical',
        heightAglM: 8,
        bands: ['2m', '70cm'],
        stationId: HOME_STATION_ID,
      },
      { id: 'ant-roof', now: 2 },
    );
    const stations = [{ id: HOME_STATION_ID, nickname: 'Home' }];
    const radio = { id: 'radio-ht', name: 'UV-5R' };

    expect(
      contactAntennaLabel({
        antennas: [yagi, whip],
        stations,
        radio,
        adifBand: '2m',
        selectedStationAntenna: yagi,
      }),
    ).toBe('UV-5R · Signal Stick · Dual-band vertical · 1.5 m AGL');

    expect(
      contactAntennaLabel({
        antennas: [roof, whip, spare],
        stations,
        radio,
        adifBand: '2m',
        selectedStationAntenna: roof,
      }),
    ).toBe('Home · Roof vertical · Dual-band vertical · 8 m AGL');

    expect(
      contactAntennaLabel({
        antennas: [yagi, whip],
        stations,
        radio,
        adifBand: '20m',
        selectedStationAntenna: yagi,
      }),
    ).toBe('Home · Backyard Yagi · 3-element Yagi · 15 m AGL · 045°');
  });
});

describe('radio stations', () => {
  it('should keep a Home location even when createdAt was stored as 0', () => {
    const parsed = parseStationAntennaStore(
      JSON.stringify({
        selectedStationId: HOME_STATION_ID,
        stations: [
          {
            id: HOME_STATION_ID,
            nickname: 'Home',
            gridsquare: 'FN42',
            latitude: 42.5,
            longitude: -71,
            locationSource: 'grid',
            createdAt: 0,
            updatedAt: 0,
          },
        ],
        antennas: [],
      }),
    );

    expect(parsed.stations[0]?.gridsquare).toBe('FN42');
    expect(parsed.stations[0]?.latitude).toBe(42.5);
    expect(parsed.stations[0]?.createdAt).toBe(1);
  });

  it('should attach legacy antennas to Home when stations are missing', () => {
    const parsed = parseStationAntennaStore(
      JSON.stringify({
        selectedId: 'ant-1',
        antennas: [
          {
            id: 'ant-1',
            typeId: 'dipole',
            nickname: '40m',
            heightAglM: 12,
            headingDeg: 90,
            bands: ['40m'],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      }),
    );

    expect(parsed.stations[0]?.id).toBe(HOME_STATION_ID);
    expect(parsed.selectedStationId).toBe(HOME_STATION_ID);
    expect(parsed.antennas[0]?.stationId).toBe(HOME_STATION_ID);
    expect(parsed.selectedId).toBe('ant-1');
  });

  it('should put FN42 at the cell center when the operator edits the grid', () => {
    const location = resolveStationLocation({
      nickname: 'Home',
      gridsquare: 'FN42',
      locationSource: 'grid',
    });

    expect(location.gridsquare).toBe('FN42');
    expect(location.latitude).toBe(42.5);
    expect(location.longitude).toBe(-71);
    expect(location.locationSource).toBe('grid');
  });

  it('should keep exact coordinates and derive a 6-character grid', () => {
    const location = resolveStationLocation({
      nickname: 'Home',
      latitude: 38.627,
      longitude: -90.1994,
      locationSource: 'coordinates',
    });

    expect(location.locationSource).toBe('coordinates');
    expect(location.latitude).toBe(38.627);
    expect(location.longitude).toBe(-90.1994);
    expect(location.gridsquare).toBe('EM48VP');
  });

  it('should reject a blank name and a half-filled lat/lon pair', () => {
    expect(stationDraftErrors({ nickname: '  ' })?.nickname).toBeTypeOf('string');
    expect(stationDraftErrors({ nickname: 'Cabin', latitude: 38.6 })?.longitude).toBeTypeOf('string');
    expect(stationDraftErrors({ nickname: 'Cabin', gridsquare: 'nope' })?.gridsquare).toBeTypeOf('string');
    expect(stationDraftErrors({ nickname: 'Cabin', gridsquare: 'EM48' })).toBe(undefined);
  });

  it('should keep at least one station and delete antennas with a removed site', () => {
    const cabin = createRadioStation({ nickname: 'Cabin', gridsquare: 'FN42' }, { id: 'station-cabin', now: 2 });
    const homeAntenna = createStationAntenna(sampleDraft(), { id: 'ant-home', now: 1 });
    const cabinAntenna = createStationAntenna(
      { ...sampleDraft(), nickname: 'Portable', stationId: 'station-cabin' },
      { id: 'ant-cabin', now: 2 },
    );
    let store = addAntennaToStore(defaultStationAntennaStore(), homeAntenna);
    store = addStationToStore(store, cabin);
    store = addAntennaToStore(store, cabinAntenna);

    expect(store.stations).toHaveLength(2);
    expect(selectedRadioStation(store)?.id).toBe('station-cabin');
    expect(selectedStationAntenna(store)?.id).toBe('ant-cabin');

    store = selectStationInStore(store, HOME_STATION_ID);
    expect(selectedStationAntenna(store)?.id).toBe('ant-home');

    const unchanged = removeStationFromStore(defaultStationAntennaStore(), HOME_STATION_ID);
    expect(unchanged.stations).toHaveLength(1);

    store = removeStationFromStore(store, 'station-cabin');
    expect(store.stations.map((station) => station.id)).toEqual([HOME_STATION_ID]);
    expect(store.antennas.map((antenna) => antenna.id)).toEqual(['ant-home']);
  });

  it('should seed a license grid onto Home only when location is empty', () => {
    const empty = applyLicenseGridToHomeIfEmpty(defaultStationAntennaStore(), 'em48', 5);
    expect(empty.stations[0]?.gridsquare).toBe('EM48');
    expect(empty.stations[0]?.latitude).toBe(38.5);
    expect(empty.stations[0]?.longitude).toBe(-91);
    expect(empty.stations[0]?.locationSource).toBe('grid');
    expect(empty.stations[0]?.updatedAt).toBe(5);

    const alreadySet = applyLicenseGridToHomeIfEmpty(empty, 'FN42', 9);
    expect(alreadySet.stations[0]?.gridsquare).toBe('EM48');
  });

  it('should format a station location line', () => {
    const station = createRadioStation(
      { nickname: 'Home', gridsquare: 'FN42', locationSource: 'grid' },
      { id: HOME_STATION_ID, now: 1 },
    );

    expect(formatStationLocation(station)).toBe('FN42 · 42° 30\' 00.00" N 71° 00\' 00.00" W');
    expect(formatStationLocation(defaultHomeStation())).toBe('Location not set');
  });
});
