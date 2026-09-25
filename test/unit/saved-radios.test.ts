import { describe, expect, it } from 'vitest';
import {
  applyRadioPrivilege,
  createSavedRadio,
  draftFromSavedRadio,
  parseSavedRadioStore,
  savedRadioModelLabel,
  removeSavedRadio,
  savedRadioDraftHasIssues,
  savedRadioDraftIssues,
  serializeSavedRadioStore,
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

  it('should prefer an installed driver name over the stored model id', () => {
    expect(
      savedRadioModelLabel(mobile, [{ id: { model: 'baofeng-uv5r', name: 'Baofeng UV-5R' } }]),
    ).toBe('Baofeng UV-5R');
    expect(savedRadioModelLabel(mobile, [])).toBe('Baofeng baofeng-uv5r');
  });
});
