import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  radioTransferDialogTitle,
  radioTransferManufacturerModelLine,
  radioTransferModalSubtitle,
  radioTransferTargetDisplay,
  resolveRadioTransferTarget,
} from '../../app/utils/radio-transfer-target.ts';
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

describe('radioTransferManufacturerModelLine', () => {
  it('omits duplicate manufacturer when the model label already starts with it', () => {
    expect(
      radioTransferManufacturerModelLine({
        manufacturer: 'Baofeng',
        modelLabel: 'Baofeng UV-5R',
      }),
    ).toBe('Baofeng UV-5R');
  });

  it('joins manufacturer and model when the label does not repeat the manufacturer', () => {
    expect(
      radioTransferManufacturerModelLine({
        manufacturer: 'Yaesu',
        modelLabel: 'FT-991A',
      }),
    ).toBe('Yaesu · FT-991A');
  });
});

describe('radioTransferDialogTitle', () => {
  it('includes the card name when a target is known', () => {
    expect(radioTransferDialogTitle('write', "Rob's TH-F6")).toBe("Write to Rob's TH-F6");
    expect(radioTransferDialogTitle('read', "Rob's TH-F6")).toBe("Read from Rob's TH-F6");
  });
});

describe('radioTransferModalSubtitle', () => {
  it('shows manufacturer and model without the card name', () => {
    expect(radioTransferModalSubtitle(saved, configs)).toBe('Baofeng UV-5R');
  });
});

describe('resolveRadioTransferTarget', () => {
  it('uses the transfer card id, not another open card', () => {
    const focusedGuest = {
      name: 'Wrong card',
      manufacturer: 'Baofeng',
      model: 'baofeng-uv5r',
      serialPort: '/dev/ttyUSB1',
    };
    const transferGuest = {
      name: "Rob's TH-F6",
      manufacturer: 'Kenwood',
      model: 'kenwood-tm-d710a',
      serialPort: '/dev/ttyUSB2',
    };

    const target = resolveRadioTransferTarget(
      'transfer-card-id',
      () => undefined,
      (id) => {
        if (id === 'transfer-card-id') {
          return { guest: transferGuest };
        }

        if (id === 'focused-card-id') {
          return { guest: focusedGuest };
        }

        return undefined;
      },
    );

    expect(target?.name).toBe("Rob's TH-F6");
  });
});

describe('read/write transfer dialogs', () => {
  it('use transfer card helpers and no target header card in the body', () => {
    const readDialog = readFileSync('app/components/RadioReadDialog.vue', 'utf8');
    const writeDialog = readFileSync('app/components/RadioWriteDialog.vue', 'utf8');
    const portDialog = readFileSync('app/components/RadioPortDialog.vue', 'utf8');

    expect(readDialog).toContain('resolveRadioTransferTarget');
    expect(readDialog).toContain('radioTransferModalSubtitle');
    expect(readDialog).not.toContain('RadioTransferTargetHeader');
    expect(writeDialog).not.toContain('RadioTransferTargetHeader');
    expect(portDialog).not.toContain('name="target"');
    expect(readDialog).toContain('UBadge');
  });
});
