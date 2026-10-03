import { describe, expect, it } from 'vitest';
import {
  equipmentCoversAdifBand,
  equipmentListedForBand,
  formatEquipmentBands,
  radioBandsFromConfig,
} from '../../app/utils/radio-bands.ts';

describe('radio-bands', () => {
  it('reads transmit bands from a radio module', () => {
    expect(radioBandsFromConfig({ bands: ['2m', '70cm', '2M'] })).toEqual(['2m', '70cm']);
    expect(radioBandsFromConfig(undefined)).toEqual([]);
    expect(radioBandsFromConfig({ bands: '2m' })).toEqual([]);
  });

  it('formats bands with antenna labels', () => {
    expect(formatEquipmentBands(['2m', '70cm', '1.25m'])).toBe('2 m, 70 cm, 1.25 m');
  });

  it('compares equipment bands to the contact band', () => {
    expect(equipmentCoversAdifBand(['2m', '70cm'], '70cm')).toBe(true);
    expect(equipmentCoversAdifBand(['2m', '70cm'], '40m')).toBe(false);
    expect(equipmentCoversAdifBand([], '40m')).toBeUndefined();
    expect(equipmentCoversAdifBand(['40m'], undefined)).toBeUndefined();
  });

  it('lists only equipment configured for the contact band', () => {
    const items = [
      { name: 'Whip', bands: ['2m', '70cm'] },
      { name: 'Dipole', bands: ['40m', '20m'] },
      { name: 'Handheld', bands: [] as string[] },
    ];

    expect(equipmentListedForBand(items, '40m').map((item) => item.name)).toEqual(['Dipole', 'Handheld']);
    expect(equipmentListedForBand(items, undefined).map((item) => item.name)).toEqual([
      'Whip',
      'Dipole',
      'Handheld',
    ]);
  });
});
