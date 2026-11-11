import { describe, expect, it } from 'vitest';
import { aprsSerialPortMenuItems } from '../../app/utils/aprs-port-select.ts';

describe('APRS serial port menu', () => {
  it('keeps a missing saved adapter and never emits an empty value', () => {
    const items = aprsSerialPortMenuItems(
      [
        { label: 'usbserial-AI2SP9LC', value: 'usbserial-AI2SP9LC' },
        { label: 'blank', value: '' },
        { label: 'spaces', value: '   ' },
      ],
      'usbserial-unplugged',
      { label: 'usbserial-unplugged (saved, not connected)', value: 'usbserial-unplugged' },
    );

    expect(items.map((item) => item.value)).toEqual(['usbserial-unplugged', 'usbserial-AI2SP9LC']);
    expect(items.every((item) => item.value.trim().length > 0)).toBe(true);
    expect(items.some((item) => item.label.includes('saved, not connected'))).toBe(true);
  });

  it('lists the memory adapter as a normal APRS choice and adds nothing when unset', () => {
    const listed = [{ label: 'usbserial-AI2SP9LC', value: 'usbserial-AI2SP9LC' }];

    expect(aprsSerialPortMenuItems(listed, 'usbserial-AI2SP9LC')).toEqual(listed);
    expect(aprsSerialPortMenuItems(listed, undefined)).toEqual(listed);
    expect(aprsSerialPortMenuItems(listed, '')).toEqual(listed);
  });
});
