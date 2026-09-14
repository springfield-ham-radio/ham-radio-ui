import { describe, it } from 'node:test';
import { expect } from 'chai';
import {
  addAntennaToStore,
  addStationToStore,
  antennaDraftErrors,
  applyAntennaTypeToDraft,
  applyLicenseGridToHomeIfEmpty,
  createRadioStation,
  createStationAntenna,
  defaultAntennaDraft,
  defaultAntennaWhatIf,
  defaultHomeStation,
  defaultStationAntennaStore,
  formatAntennaGeometry,
  formatAntennaSummary,
  formatAntennaBands,
  formatHeadingDeg,
  formatStationLocation,
  HOME_STATION_ID,
  parseStationAntennaStore,
  removeAntennaFromStore,
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

    expect(store.stations).to.have.length(1);
    expect(store.stations[0]?.id).to.equal(HOME_STATION_ID);
    expect(store.stations[0]?.nickname).to.equal('Home');
    expect(store.selectedStationId).to.equal(HOME_STATION_ID);
    expect(store.antennas).to.deep.equal([]);
    expect(store.selectedId).to.equal(undefined);
  });

  it('should fill a dipole draft from the generic type', () => {
    const draft = defaultAntennaDraft('dipole');

    expect(draft.typeId).to.equal('dipole');
    expect(draft.heightAglM).to.equal(10);
    expect(draft.headingDeg).to.equal(45);
    expect(draft.bands).to.deep.equal(['40m']);
    expect(draft.trapped).to.equal(false);
  });

  it('should default a tribander Yagi to trapped 20/15/10', () => {
    const draft = defaultAntennaDraft('yagi-3el');

    expect(draft.bands).to.deep.equal(['20m', '15m', '10m']);
    expect(draft.trapped).to.equal(true);
  });

  it('should default a dual-band vertical to 2 m / 70 cm without heading', () => {
    const draft = defaultAntennaDraft('dual-band-vertical');

    expect(draft.typeId).to.equal('dual-band-vertical');
    expect(draft.heightAglM).to.equal(8);
    expect(draft.headingDeg).to.equal(undefined);
    expect(draft.bands).to.deep.equal(['2m', '70cm']);
  });

  it('should default a 2 m Yagi to 2 m with a boom heading', () => {
    const draft = defaultAntennaDraft('vhf-yagi');

    expect(draft.bands).to.deep.equal(['2m']);
    expect(draft.headingDeg).to.equal(45);
  });

  it('should omit heading on an omni what-if', () => {
    const whatIf = defaultAntennaWhatIf(defaultAntennaDraft('quarter-wave-vertical'));

    expect(whatIf.typeId).to.equal('quarter-wave-vertical');
    expect(whatIf.headingDeg).to.equal(undefined);
  });

  it('should name an antenna after its type when the nickname is blank', () => {
    const antenna = createStationAntenna(
      { ...sampleDraft(), nickname: '  ' },
      { id: 'ant-1', now: 1 },
    );

    expect(antenna.nickname).to.equal('3-element Yagi');
    expect(antenna.id).to.equal('ant-1');
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

    expect(antenna.headingDeg).to.equal(undefined);
  });

  it('should reject a missing height and a non-numeric heading', () => {
    expect(antennaDraftErrors({ ...sampleDraft(), heightAglM: Number.NaN })?.heightAglM).to.be.a('string');
    expect(antennaDraftErrors({ ...sampleDraft(), headingDeg: Number.NaN })?.headingDeg).to.be.a('string');
    expect(antennaDraftErrors(sampleDraft())).to.equal(undefined);
  });

  it('should wrap a heading of 360 to 0', () => {
    const antenna = createStationAntenna({ ...sampleDraft(), headingDeg: 360 }, { id: 'ant-1', now: 1 });

    expect(antenna.headingDeg).to.equal(0);
  });

  it('should reset height and bands when the type changes', () => {
    const next = applyAntennaTypeToDraft(sampleDraft(), 'dipole');

    expect(next.typeId).to.equal('dipole');
    expect(next.heightAglM).to.equal(10);
    expect(next.bands).to.deep.equal(['40m']);
    expect(next.trapped).to.equal(false);
    expect(next.nickname).to.equal('Backyard Yagi');
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

    expect(parsed.selectedId).to.equal('ant-1');
    expect(parsed.antennas).to.have.length(1);
    expect(parsed.antennas[0]?.nickname).to.equal('Backyard Yagi');
    expect(parsed.antennas[0]?.typeId).to.equal('yagi-3el');
    expect(parsed.antennas[0]?.trapped).to.equal(true);
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

    expect(parsed.antennas[0]?.trapped).to.equal(true);
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

    expect(dipole.trapped).to.equal(true);
    expect(formatAntennaBands(dipole.bands, dipole.trapped === true)).to.equal('80 m, 40 m · traps at 40 m');

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

    expect(parsed.antennas[0]?.trapped).to.equal(undefined);
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

    expect(parsed.antennas[0]?.bands).to.deep.equal(['2m', '70cm']);
  });

  it('should fall back to defaults when storage is empty or invalid', () => {
    expect(parseStationAntennaStore(null).stations[0]?.id).to.equal(HOME_STATION_ID);
    expect(parseStationAntennaStore('').antennas).to.deep.equal([]);
    expect(parseStationAntennaStore('{').stations[0]?.nickname).to.equal('Home');
    expect(parseStationAntennaStore('[]').selectedStationId).to.equal(HOME_STATION_ID);
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

    expect(parsed.antennas.map((antenna) => antenna.id)).to.deep.equal(['ant-1']);
    expect(parsed.selectedId).to.equal('ant-1');
  });

  it('should select the added antenna and move selection after remove', () => {
    const first = createStationAntenna(sampleDraft(), { id: 'ant-1', now: 1 });
    const second = createStationAntenna({ ...sampleDraft(), nickname: 'Spare' }, { id: 'ant-2', now: 2 });
    let store = addAntennaToStore(defaultStationAntennaStore(), first);
    store = addAntennaToStore(store, second);

    expect(selectedStationAntenna(store)?.id).to.equal('ant-2');

    store = selectAntennaInStore(store, 'ant-1');
    expect(selectedStationAntenna(store)?.id).to.equal('ant-1');

    store = removeAntennaFromStore(store, 'ant-1');
    expect(selectedStationAntenna(store)?.id).to.equal('ant-2');
  });

  it('should preserve id and createdAt on update', () => {
    const antenna = createStationAntenna(sampleDraft(), { id: 'ant-1', now: 5 });
    const updated = updateStationAntenna(antenna, { ...sampleDraft(), heightAglM: 18 }, 9);

    expect(updated.id).to.equal('ant-1');
    expect(updated.createdAt).to.equal(5);
    expect(updated.updatedAt).to.equal(9);
    expect(updated.heightAglM).to.equal(18);
  });

  it('should move a selected antenna to another station on update', () => {
    const cabin = createRadioStation({ nickname: 'Cabin' }, { id: 'station-cabin', now: 2 });
    const antenna = createStationAntenna(sampleDraft(), { id: 'ant-1', now: 1 });
    let store = addAntennaToStore(defaultStationAntennaStore(), antenna);
    store = addStationToStore(store, cabin);
    store = selectAntennaInStore(store, 'ant-1');

    const updated = updateStationAntenna(antenna, { ...sampleDraft(), stationId: 'station-cabin' }, 9);
    store = replaceAntennaInStore(store, updated);

    expect(updated.stationId).to.equal('station-cabin');
    expect(store.antennas[0]?.stationId).to.equal('station-cabin');
    expect(store.selectedStationId).to.equal('station-cabin');
    expect(store.selectedId).to.equal('ant-1');
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

    expect(station?.source).to.equal('station');
    expect(station?.nickname).to.equal('Backyard Yagi');
    expect(station?.type.id).to.equal('yagi-3el');
    expect(station?.trapped).to.equal(true);
    expect(station?.gainDbi).to.equal(6.5);
    expect(whatIf?.source).to.equal('what-if');
    expect(whatIf?.type.id).to.equal('dipole');
    expect(whatIf?.heightAglM).to.equal(12);
    expect(whatIf?.headingDeg).to.equal(90);
    expect(whatIf?.takeoffDeg).to.be.a('number');
  });

  it('should format geometry and omit a nickname that matches the type', () => {
    const antenna = createStationAntenna({ ...sampleDraft(), nickname: '3-element Yagi' }, { id: 'ant-1', now: 1 });

    expect(formatAntennaGeometry(antenna)).to.equal('3-element Yagi · 15 m AGL · 045°');
    expect(formatAntennaSummary(antenna)).to.equal('3-element Yagi · 15 m AGL · 045°');
    expect(formatAntennaSummary(createStationAntenna(sampleDraft(), { id: 'ant-2', now: 1 }))).to.equal(
      'Backyard Yagi · 3-element Yagi · 15 m AGL · 045°',
    );
    expect(formatHeadingDeg(undefined, false)).to.equal(undefined);
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

    expect(parsed.stations[0]?.gridsquare).to.equal('FN42');
    expect(parsed.stations[0]?.latitude).to.equal(42.5);
    expect(parsed.stations[0]?.createdAt).to.equal(1);
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

    expect(parsed.stations[0]?.id).to.equal(HOME_STATION_ID);
    expect(parsed.selectedStationId).to.equal(HOME_STATION_ID);
    expect(parsed.antennas[0]?.stationId).to.equal(HOME_STATION_ID);
    expect(parsed.selectedId).to.equal('ant-1');
  });

  it('should put FN42 at the cell center when the operator edits the grid', () => {
    const location = resolveStationLocation({
      nickname: 'Home',
      gridsquare: 'FN42',
      locationSource: 'grid',
    });

    expect(location.gridsquare).to.equal('FN42');
    expect(location.latitude).to.equal(42.5);
    expect(location.longitude).to.equal(-71);
    expect(location.locationSource).to.equal('grid');
  });

  it('should keep exact coordinates and derive a 6-character grid', () => {
    const location = resolveStationLocation({
      nickname: 'Home',
      latitude: 38.627,
      longitude: -90.1994,
      locationSource: 'coordinates',
    });

    expect(location.locationSource).to.equal('coordinates');
    expect(location.latitude).to.equal(38.627);
    expect(location.longitude).to.equal(-90.1994);
    expect(location.gridsquare).to.equal('EM48VP');
  });

  it('should reject a blank name and a half-filled lat/lon pair', () => {
    expect(stationDraftErrors({ nickname: '  ' })?.nickname).to.be.a('string');
    expect(stationDraftErrors({ nickname: 'Cabin', latitude: 38.6 })?.longitude).to.be.a('string');
    expect(stationDraftErrors({ nickname: 'Cabin', gridsquare: 'nope' })?.gridsquare).to.be.a('string');
    expect(stationDraftErrors({ nickname: 'Cabin', gridsquare: 'EM48' })).to.equal(undefined);
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

    expect(store.stations).to.have.length(2);
    expect(selectedRadioStation(store)?.id).to.equal('station-cabin');
    expect(selectedStationAntenna(store)?.id).to.equal('ant-cabin');

    store = selectStationInStore(store, HOME_STATION_ID);
    expect(selectedStationAntenna(store)?.id).to.equal('ant-home');

    const unchanged = removeStationFromStore(defaultStationAntennaStore(), HOME_STATION_ID);
    expect(unchanged.stations).to.have.length(1);

    store = removeStationFromStore(store, 'station-cabin');
    expect(store.stations.map((station) => station.id)).to.deep.equal([HOME_STATION_ID]);
    expect(store.antennas.map((antenna) => antenna.id)).to.deep.equal(['ant-home']);
  });

  it('should seed a license grid onto Home only when location is empty', () => {
    const empty = applyLicenseGridToHomeIfEmpty(defaultStationAntennaStore(), 'em48', 5);
    expect(empty.stations[0]?.gridsquare).to.equal('EM48');
    expect(empty.stations[0]?.latitude).to.equal(38.5);
    expect(empty.stations[0]?.longitude).to.equal(-91);
    expect(empty.stations[0]?.locationSource).to.equal('grid');
    expect(empty.stations[0]?.updatedAt).to.equal(5);

    const alreadySet = applyLicenseGridToHomeIfEmpty(empty, 'FN42', 9);
    expect(alreadySet.stations[0]?.gridsquare).to.equal('EM48');
  });

  it('should format a station location line', () => {
    const station = createRadioStation(
      { nickname: 'Home', gridsquare: 'FN42', locationSource: 'grid' },
      { id: HOME_STATION_ID, now: 1 },
    );

    expect(formatStationLocation(station)).to.equal('FN42 · 42° 30\' 00.00" N 71° 00\' 00.00" W');
    expect(formatStationLocation(defaultHomeStation())).to.equal('Location not set');
  });
});
