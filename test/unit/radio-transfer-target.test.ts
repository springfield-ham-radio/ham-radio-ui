import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { radioTransferTargetDisplay } from '../../app/utils/radio-transfer-target.ts';
import type { SavedRadio } from '../../app/utils/saved-radios.ts';

const configs = [{ id: { model: 'baofeng-uv5r', name: 'Baofeng UV-5R' } }] as const;

const saved: SavedRadio = {
  id: 'radio-1',
  name: '  Shack HT  ',
  manufacturer: ' Baofeng ',
  model: 'baofeng-uv5r',
  serialPort: '/dev/ttyUSB0',
  createdAt: 1,
  updatedAt: 2,
};

describe('radioTransferTargetDisplay', () => {
  it('trims card name and manufacturer and resolves catalog model label', () => {
    expect(radioTransferTargetDisplay(saved, configs)).toEqual({
      cardName: 'Shack HT',
      manufacturer: 'Baofeng',
      modelLabel: 'Baofeng UV-5R',
    });
  });

  it('falls back to manufacturer and model id when driver is missing from catalog', () => {
    expect(radioTransferTargetDisplay(saved, [])).toEqual({
      cardName: 'Shack HT',
      manufacturer: 'Baofeng',
      modelLabel: 'Baofeng baofeng-uv5r',
    });
  });

  it('works for guest radios opened from read from radio', () => {
    expect(
      radioTransferTargetDisplay(
        {
          name: 'Guest clone',
          manufacturer: 'Kenwood',
          model: 'kenwood-tm-d710a',
          serialPort: '/dev/cu.usbserial-guest',
        },
        [{ id: { model: 'kenwood-tm-d710a', name: 'Kenwood TM-D710A' } }],
      ),
    ).toEqual({
      cardName: 'Guest clone',
      manufacturer: 'Kenwood',
      modelLabel: 'Kenwood TM-D710A',
    });
  });
});

describe('read/write transfer dialogs', () => {
  it('show the transfer target header in the port dialog target slot', () => {
    const readDialog = readFileSync('app/components/RadioReadDialog.vue', 'utf8');
    const writeDialog = readFileSync('app/components/RadioWriteDialog.vue', 'utf8');
    const portDialog = readFileSync('app/components/RadioPortDialog.vue', 'utf8');

    expect(readDialog).toContain('RadioTransferTargetHeader');
    expect(readDialog).toContain('#target');
    expect(writeDialog).toContain('RadioTransferTargetHeader');
    expect(writeDialog).toContain(':guest="transferGuest"');
    expect(portDialog).toContain('name="target"');
  });
});
