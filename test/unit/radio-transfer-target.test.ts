import { readFileSync } from 'node:fs';
import { createSSRApp, defineComponent } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';
import RadioTransferTargetHeader from '../../app/components/RadioTransferTargetHeader.vue';
import {
  radioTransferDialogDescription,
  radioTransferDialogTitle,
  radioTransferManufacturerModelLine,
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

describe('RadioTransferTargetHeader', () => {
  it('renders the transfer target and Guest badge for read guest cards', async () => {
    const UCard = defineComponent({ template: '<div class="u-card"><slot /></div>' });
    const UBadge = defineComponent({ template: '<span class="u-badge"><slot /></span>' });

    const app = createSSRApp({
      components: { RadioTransferTargetHeader },
      template: `<RadioTransferTargetHeader
        :radio="{ name: 'Fixture UV-5R', manufacturer: 'Baofeng', model: 'baofeng-uv5r', serialPort: '/dev/fixture' }"
        :configurations="configs"
        guest
      />`,
      setup() {
        return { configs };
      },
    });
    app.component('UCard', UCard);
    app.component('UBadge', UBadge);

    const html = await renderToString(app);

    expect(html).toContain('Fixture UV-5R');
    expect(html).toContain('Baofeng UV-5R');
    expect(html).toContain('u-badge');
    expect(html).toContain('Guest');
    expect(html).not.toContain('Baofeng · Baofeng');
  });
});

describe('read/write transfer dialogs', () => {
  it('place the transfer target header above the serial port after the write review', () => {
    const readDialog = readFileSync('app/components/RadioReadDialog.vue', 'utf8');
    const writeDialog = readFileSync('app/components/RadioWriteDialog.vue', 'utf8');
    const portDialog = readFileSync('app/components/RadioPortDialog.vue', 'utf8');

    expect(readDialog).toContain('RadioTransferTargetHeader');
    expect(readDialog).toContain('radioTransferDialogTitle');
    expect(writeDialog).toContain('RadioTransferTargetHeader');
    expect(writeDialog).toContain(':guest="transferGuest"');

    const reviewIndex = portDialog.indexOf('name="review"');
    const targetIndex = portDialog.indexOf('name="target"');
    const serialIndex = portDialog.indexOf('label="Serial port"');

    expect(reviewIndex).toBeGreaterThan(-1);
    expect(targetIndex).toBeGreaterThan(reviewIndex);
    expect(serialIndex).toBeGreaterThan(targetIndex);
    expect(portDialog).not.toContain('Choose another adapter if this cable is plugged in somewhere else.');
  });

  it('restores description sentences that name the target radio', () => {
    expect(radioTransferDialogDescription('write', "Rob's TH-F6")).toContain("Rob's TH-F6");
    expect(radioTransferDialogDescription('read', "Rob's TH-F6")).toContain("Rob's TH-F6");
  });
});
