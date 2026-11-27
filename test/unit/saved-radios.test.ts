import { describe, expect, it } from 'vitest';
import { HOME_STATION_ID } from '../../app/utils/antenna-station.ts';
import {
  applyRadioPrivilege,
  clearSavedRadioStationLinks,
  createSavedRadio,
  draftFromSavedRadio,
  parseSavedRadio,
  parseSavedRadioStore,
  savedRadioModelLabel,
  patchSavedRadioAprsBeacon,
  removeSavedRadio,
  savedRadioDraftHasIssues,
  savedRadioDraftIssues,
  serializeSavedRadioStore,
  txPowerTextForSavedRadio,
  txPowerWattsFieldError,
  txPowerWattsFromText,
  rememberSavedRadioSerialPort,
  rememberSavedRadioAprsCall,
  updateSavedRadio,
  upsertSavedRadio,
  type SavedRadio,
  type SavedRadioDraft,
} from '../../app/utils/saved-radios.ts';

const mobile: SavedRadio = {
  id: 'radio-mobile',
  name: 'Mobile',
  manufacturer: 'Baofeng',
  model: 'baofeng-uv5r',
  serialPort: '/dev/cu.usbserial-1',
  createdAt: 1,
  updatedAt: 2,
};

const base: SavedRadio = {
  id: 'radio-base',
  name: 'Base',
  manufacturer: 'Kenwood',
  model: 'kenwood-tm-d710a',
  baudRate: 9600,
  serialPort: '/dev/cu.usbserial-2',
  createdAt: 3,
  updatedAt: 4,
};

describe('saved radios', () => {
  it('should fall back to an empty list when storage is empty or invalid', () => {
    expect(parseSavedRadioStore(null)).toEqual({ radios: [] });
    expect(parseSavedRadioStore('')).toEqual({ radios: [] });
    expect(parseSavedRadioStore('{')).toEqual({ radios: [] });
    expect(parseSavedRadioStore('[]')).toEqual({ radios: [] });
    expect(parseSavedRadioStore(JSON.stringify({ radios: [{ name: 'Mobile' }] }))).toEqual({ radios: [] });
  });

  it('should keep valid radios and drop a blank name or port', () => {
    const store = parseSavedRadioStore(
      JSON.stringify({
        radios: [
          mobile,
          { ...mobile, id: 'blank', name: '   ', serialPort: '/dev/cu.usbserial-1' },
          { ...base, extra: true, baudRate: 12.5 },
        ],
      }),
    );

    expect(store.radios.map((radio) => radio.baudRate)).toEqual([undefined, undefined]);
    expect(store.radios.map((radio) => radio.id)).toEqual([mobile.id, base.id]);
  });

  it('should default new radios to SSID 0 and accept off', () => {
    const radio = createSavedRadio({
      name: 'Fresh',
      manufacturer: 'Kenwood',
      model: 'kenwood-tm-d710a',
      serialPort: '/dev/cu.new',
    });
    expect(radio.packetSsid).toBe(0);
    expect(radio.packetAcceptIncoming).toBe(false);
    expect(radio.aprsMyCall).toBeUndefined();
    expect(radio.stationId).toBe(HOME_STATION_ID);
  });

  it('should round-trip radios through serialize and parse', () => {
    const store = { radios: [mobile, base] };

    expect(parseSavedRadioStore(serializeSavedRadioStore(store))).toEqual(store);
  });

  it('should require a unique name, model, and port, and baud only when several rates exist', () => {
    const draft: SavedRadioDraft = {
      name: ' mobile ',
      manufacturer: 'Baofeng',
      model: 'baofeng-uv5r',
      serialPort: '/dev/cu.usbserial-1',
    };

    expect(savedRadioDraftHasIssues(savedRadioDraftIssues(draft, { radios: [mobile] }))).toBe(true);
    expect(
      savedRadioDraftIssues(draft, { radios: [mobile], ignoreId: mobile.id }).name,
    ).toBeUndefined();
    expect(
      savedRadioDraftIssues(
        { ...draft, name: 'Base', baudRate: undefined },
        { radios: [], baudRates: [9600, 19200] },
      ).baudRate,
    ).toBe('Choose a baud rate');
    expect(
      savedRadioDraftIssues(
        { ...draft, name: 'Base', baudRate: 19200 },
        { radios: [], baudRates: [9600, 19200] },
      ),
    ).toEqual({});
    expect(
      savedRadioDraftIssues({ ...draft, name: 'Handheld' }, { radios: [], baudRates: [9600] }).baudRate,
    ).toBeUndefined();
  });

  it('should add, update, and remove radios', () => {
    const created = createSavedRadio(
      { name: ' Mobile ', manufacturer: 'Baofeng', model: 'baofeng-uv5r', serialPort: ' /dev/cu.usbserial-1 ' },
      10,
      'radio-mobile',
    );

    expect(created.name).toBe('Mobile');
    expect(created.serialPort).toBe('/dev/cu.usbserial-1');
    expect(created.baudRate).toBeUndefined();

    const updated = updateSavedRadio(created, {
      ...draftFromSavedRadio(created),
      name: 'Truck',
      baudRate: 9600,
    }, 11);

    expect(updated.baudRate).toBe(9600);
    expect(updated.createdAt).toBe(10);
    expect(updated.updatedAt).toBe(11);

    const cleared = updateSavedRadio(updated, { ...draftFromSavedRadio(updated), baudRate: undefined }, 12);

    expect(cleared.baudRate).toBeUndefined();

    const store = upsertSavedRadio(upsertSavedRadio({ radios: [] }, created), base);

    expect(removeSavedRadio(store, created.id).radios).toEqual([base]);
  });

  it('round-trips and validates aprsMyCall on saved radios', () => {
    const withCall: SavedRadio = { ...base, aprsMyCall: 'KF5UFJ-1' };
    const cleared: SavedRadio = { ...mobile, aprsMyCall: '' };

    expect(parseSavedRadioStore(serializeSavedRadioStore({ radios: [withCall] })).radios[0]).toEqual(withCall);
    expect(parseSavedRadioStore(serializeSavedRadioStore({ radios: [cleared] })).radios[0]).toEqual(cleared);

    expect(parseSavedRadio({ ...base, aprsMyCall: '1BAD' })?.aprsMyCall).toBeUndefined();
    expect(parseSavedRadio({ ...base, aprsMyCall: 'KF5UFJ-99' })?.aprsMyCall).toBeUndefined();
    expect(parseSavedRadio({ ...base, aprsMyCall: 'kf5ufj-0' })?.aprsMyCall).toBe('KF5UFJ');

    const edited = updateSavedRadio(withCall, draftFromSavedRadio(withCall), 50);
    expect(edited.aprsMyCall).toBe('KF5UFJ-1');

    const wrote = rememberSavedRadioAprsCall(base, 'kf5ufj-1', 60);
    expect(wrote.aprsMyCall).toBe('KF5UFJ-1');
    expect(wrote.updatedAt).toBe(60);
    expect(rememberSavedRadioAprsCall(wrote, 'KF5UFJ-1', 61)).toBe(wrote);
    expect(rememberSavedRadioAprsCall(wrote, 'KF', 62)).toBe(wrote);

    const blank = rememberSavedRadioAprsCall(wrote, '', 63);
    expect(blank.aprsMyCall).toBe('');
    expect(blank.updatedAt).toBe(63);
  });

  it('keeps the APRS port independent of the memory port', () => {
    const withAprs: SavedRadio = {
      ...base,
      serialPort: '/dev/cu.programming',
      baudRate: 57600,
      aprsSerialPort: '/dev/cu.pg5g',
      aprsBaudRate: 19200,
    };

    expect(parseSavedRadioStore(serializeSavedRadioStore({ radios: [withAprs] })).radios[0]).toEqual(withAprs);

    const packetized = { ...withAprs, packetSsid: 7, packetAcceptIncoming: true };
    expect(parseSavedRadioStore(serializeSavedRadioStore({ radios: [packetized] })).radios[0]).toEqual(packetized);

    const memory = rememberSavedRadioSerialPort(withAprs, '/dev/cu.other', 30);
    expect(memory.serialPort).toBe('/dev/cu.other');
    expect(memory.aprsSerialPort).toBe('/dev/cu.pg5g');
    expect(memory.baudRate).toBe(57600);
    expect(memory.aprsBaudRate).toBe(19200);

    const aprs = updateSavedRadio(withAprs, { ...draftFromSavedRadio(withAprs), aprsSerialPort: '/dev/cu.com', aprsBaudRate: 38400 }, 31);
    expect(aprs.serialPort).toBe('/dev/cu.programming');
    expect(aprs.baudRate).toBe(57600);
    expect(aprs.aprsSerialPort).toBe('/dev/cu.com');
    expect(aprs.aprsBaudRate).toBe(38400);

    const samePort = 'usbserial-AI2SP9LC';
    const shared = updateSavedRadio(
      withAprs,
      { ...draftFromSavedRadio(withAprs), serialPort: samePort, aprsSerialPort: samePort },
      32,
    );

    expect(shared.serialPort).toBe(samePort);
    expect(shared.aprsSerialPort).toBe(samePort);
    expect(
      savedRadioDraftIssues(draftFromSavedRadio(shared), { radios: [], aprsBaudRates: [9600, 19200] }).aprsSerialPort,
    ).toBeUndefined();

    const cleared = updateSavedRadio(shared, { ...draftFromSavedRadio(shared), aprsSerialPort: '' }, 33);

    expect(cleared.aprsSerialPort).toBeUndefined();
    expect(cleared.serialPort).toBe(samePort);
    expect(cleared.baudRate).toBe(57600);
  });

  it('should remember a chosen serial port on the saved radio', () => {
    const blank = { ...mobile, serialPort: '' };
    const first = rememberSavedRadioSerialPort(blank, ' usbserial-A703DBTL ', 20);
    const replaced = rememberSavedRadioSerialPort(first, 'usbmodem31101', 21);
    const same = rememberSavedRadioSerialPort(replaced, ' usbmodem31101 ', 22);
    const empty = rememberSavedRadioSerialPort(replaced, '  ', 23);

    expect(first.serialPort).toBe('usbserial-A703DBTL');
    expect(first.updatedAt).toBe(20);
    expect(first.createdAt).toBe(mobile.createdAt);
    expect(replaced.serialPort).toBe('usbmodem31101');
    expect(replaced.updatedAt).toBe(21);
    expect(same).toBe(replaced);
    expect(empty).toBe(replaced);
  });

  it('should store the license selected for channel warnings', () => {
    const withLicense = applyRadioPrivilege(mobile, { personId: 'ada', licenseId: 'lic-ada' });
    const handheld: SavedRadio = { ...base };
    delete handheld.baudRate;
    const frsOnly = applyRadioPrivilege(handheld, { personId: 'sam' });
    const cleared = applyRadioPrivilege(withLicense, undefined);

    expect(withLicense.privilegePersonId).toBe('ada');
    expect(withLicense.privilegeLicenseId).toBe('lic-ada');
    expect(withLicense.updatedAt).toBe(mobile.updatedAt);
    expect(frsOnly.privilegePersonId).toBe('sam');
    expect(frsOnly.privilegeLicenseId).toBeUndefined();
    expect(cleared.privilegePersonId).toBeUndefined();
    expect(parseSavedRadioStore(serializeSavedRadioStore({ radios: [withLicense, frsOnly] })).radios).toEqual([
      withLicense,
      frsOnly,
    ]);
  });

  it('should store transmit power and fill a contact from the selected radio', () => {
    const withPower = { ...mobile, txPowerWatts: 5 };
    const created = createSavedRadio(
      { name: 'Mobile', manufacturer: 'Baofeng', model: 'baofeng-uv5r', serialPort: '/dev/cu.usbserial-1', txPowerWatts: 5 },
      10,
      'radio-mobile',
    );

    expect(created.txPowerWatts).toBe(5);
    expect(parseSavedRadioStore(serializeSavedRadioStore({ radios: [withPower] })).radios[0]?.txPowerWatts).toBe(5);
    expect(parseSavedRadio({ ...withPower, txPowerWatts: 0 })?.txPowerWatts).toBeUndefined();
    expect(draftFromSavedRadio(created).txPowerWatts).toBe(5);
    expect(updateSavedRadio(created, { ...draftFromSavedRadio(created), txPowerWatts: undefined }).txPowerWatts).toBeUndefined();
    expect(txPowerWattsFromText('5')).toBe(5);
    expect(txPowerWattsFromText('')).toBeUndefined();
    expect(txPowerWattsFieldError('nope')).toBe('Enter a TX power in watts');
    expect(txPowerWattsFieldError('')).toBeUndefined();
    expect(savedRadioDraftIssues({ ...draftFromSavedRadio(created), txPowerWatts: -1 }, { radios: [] }).txPowerWatts).toBe(
      'Enter a TX power in watts',
    );
    expect(txPowerTextForSavedRadio('Mobile', [withPower])).toBe('5');
    expect(txPowerTextForSavedRadio('Base', [withPower])).toBe('');
  });

  it('should prefer an installed driver name over the stored model id', () => {
    expect(
      savedRadioModelLabel(mobile, [{ id: { model: 'baofeng-uv5r', name: 'Baofeng UV-5R' } }]),
    ).toBe('Baofeng UV-5R');
    expect(savedRadioModelLabel(mobile, [])).toBe('Baofeng baofeng-uv5r');
  });

  it('round-trips APRS beacon settings without disturbing packet identity fields', () => {
    const beacon = {
      latitude: 30.5187,
      longitude: -97.879,
      symbolTable: '/',
      symbolCode: '-',
      comment: 'Home',
      altitudeFt: 1180,
      path: 'WIDE1-1,WIDE2-1',
      intervalMinutes: 5,
    };
    const withBeacon = patchSavedRadioAprsBeacon(
      { ...mobile, packetSsid: 7, packetAcceptIncoming: true, aprsSerialPort: '/dev/cu.pg5g', aprsBaudRate: 9600 },
      beacon,
    );

    expect(withBeacon.packetSsid).toBe(7);
    expect(withBeacon.packetAcceptIncoming).toBe(true);
    expect(withBeacon.aprsBeacon?.intervalMinutes).toBe(10);
    expect(parseSavedRadioStore(serializeSavedRadioStore({ radios: [withBeacon] })).radios[0]?.aprsBeacon).toEqual(
      withBeacon.aprsBeacon,
    );
    expect(patchSavedRadioAprsBeacon(withBeacon, undefined).aprsBeacon).toBeUndefined();
  });

  it('round-trips aprsMyCall and aprsBeacon on the same saved radio', () => {
    const beacon = {
      latitude: 30.5187,
      longitude: -97.879,
      symbolTable: '/',
      symbolCode: '-',
      comment: 'Home',
      path: 'WIDE1-1,WIDE2-1',
      intervalMinutes: 30,
    };
    const both = patchSavedRadioAprsBeacon(
      rememberSavedRadioAprsCall({ ...mobile, packetSsid: 3 }, 'KF5UFJ-7'),
      beacon,
    );

    expect(both.aprsMyCall).toBe('KF5UFJ-7');
    expect(both.aprsBeacon?.comment).toBe('Home');

    const roundTrip = parseSavedRadioStore(serializeSavedRadioStore({ radios: [both] })).radios[0];

    expect(roundTrip?.aprsMyCall).toBe('KF5UFJ-7');
    expect(roundTrip?.aprsBeacon).toEqual(both.aprsBeacon);
    expect(roundTrip?.packetSsid).toBe(3);
  });

  it('stores stationId on saved radios without disturbing APRS fields', () => {
    const beacon = {
      latitude: 30.5187,
      longitude: -97.879,
      symbolTable: '/',
      symbolCode: '-',
      path: 'WIDE1-1,WIDE2-1',
      intervalMinutes: 30,
    };
    const linked: SavedRadio = {
      ...base,
      stationId: 'station-cabin',
      aprsMyCall: 'KF5UFJ-1',
      privilegePersonId: 'ada',
      privilegeLicenseId: 'lic-ada',
      packetSsid: 2,
      packetAcceptIncoming: true,
      aprsBeacon: beacon,
    };

    expect(parseSavedRadioStore(serializeSavedRadioStore({ radios: [linked] })).radios[0]).toEqual(linked);
    expect(parseSavedRadio({ ...linked, stationId: '  ' })?.stationId).toBeUndefined();
    expect(parseSavedRadio({ ...linked, stationId: 'station-gone' })?.stationId).toBe('station-gone');

    const none = createSavedRadio(
      { name: 'HT', manufacturer: 'Kenwood', model: 'kenwood-th-d74', serialPort: '/dev/cu.ht', stationId: '' },
      1,
      'radio-ht',
    );
    expect(none.stationId).toBeUndefined();

    const updated = updateSavedRadio(linked, { ...draftFromSavedRadio(linked), stationId: '' }, 50);
    expect(updated.stationId).toBeUndefined();
    expect(updated.aprsMyCall).toBe('KF5UFJ-1');
    expect(updated.aprsBeacon).toEqual(beacon);
    expect(updated.updatedAt).toBe(50);

    const relinked = updateSavedRadio(updated, { ...draftFromSavedRadio(updated), stationId: HOME_STATION_ID }, 51);
    expect(relinked.stationId).toBe(HOME_STATION_ID);
  });

  it('clears stationId when a site is removed', () => {
    const atHome: SavedRadio = { ...mobile, stationId: HOME_STATION_ID };
    const atCabin: SavedRadio = { ...base, stationId: 'station-cabin' };
    const store = { radios: [atHome, atCabin] };

    const cleared = clearSavedRadioStationLinks(store, 'station-cabin');
    expect(cleared.radios[0]?.stationId).toBe(HOME_STATION_ID);
    expect(cleared.radios[1]?.stationId).toBeUndefined();
    expect(cleared.radios[1]?.updatedAt).toBe(atCabin.updatedAt);

    expect(clearSavedRadioStationLinks(store, 'missing')).toBe(store);
  });
});
