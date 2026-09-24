import { describe, expect, it } from 'vitest';
import { serialPortSelectItems } from '../../app/utils/serial-port-list.ts';

describe('serial port list', () => {
  const macPorts = [
    '/dev/cu.usbserial-A50285BI',
    '/dev/tty.usbserial-A50285BI',
    '/dev/cu.Bluetooth-Incoming-Port',
    '/dev/tty.Bluetooth-Incoming-Port',
    '/dev/cu.debug-console',
    '/dev/cu.wlan-debug',
    '/dev/cu.usbmodem123456',
  ];

  it('should keep only macOS callout devices and drop the tty twins', () => {
    expect(
      serialPortSelectItems(macPorts, { filterCommonPorts: false }).map((port) => port.value),
    ).toEqual([
      '/dev/cu.usbserial-A50285BI',
      '/dev/cu.Bluetooth-Incoming-Port',
      '/dev/cu.debug-console',
      '/dev/cu.wlan-debug',
      '/dev/cu.usbmodem123456',
    ]);
  });

  it('should hide common macOS system ports when the preference is on', () => {
    expect(
      serialPortSelectItems(macPorts, { filterCommonPorts: true }).map((port) => port.value),
    ).toEqual(['/dev/cu.usbserial-A50285BI', '/dev/cu.usbmodem123456']);
  });

  it('should strip the macOS callout prefix from labels', () => {
    expect(serialPortSelectItems(['/dev/cu.usbserial-A50285BI'], { filterCommonPorts: true })).toEqual([
      {
        label: 'usbserial-A50285BI',
        value: '/dev/cu.usbserial-A50285BI',
      },
    ]);
  });

  it('should leave Windows and Linux paths unchanged', () => {
    expect(
      serialPortSelectItems(['COM3', '/dev/ttyUSB0', '/dev/ttyACM0'], { filterCommonPorts: true }),
    ).toEqual([
      { label: 'COM3', value: 'COM3' },
      { label: '/dev/ttyUSB0', value: '/dev/ttyUSB0' },
      { label: '/dev/ttyACM0', value: '/dev/ttyACM0' },
    ]);
  });

  it('should match common system names case-insensitively', () => {
    expect(
      serialPortSelectItems(['/dev/cu.DEBUG-CONSOLE', '/dev/cu.usbserial-1'], { filterCommonPorts: true }).map(
        (port) => port.value,
      ),
    ).toEqual(['/dev/cu.usbserial-1']);
  });

  it('should hide Bluetooth incoming ports without the -Port suffix', () => {
    expect(
      serialPortSelectItems(['/dev/cu.Bluetooth-Incoming', '/dev/cu.usbserial-1'], { filterCommonPorts: true }).map(
        (port) => port.value,
      ),
    ).toEqual(['/dev/cu.usbserial-1']);
  });

  it('should hide custom names such as BryansHeadphones', () => {
    expect(
      serialPortSelectItems(['/dev/cu.BryansHeadphones', '/dev/cu.usbserial-AI2SP9LC'], {
        filterCommonPorts: false,
        excludedPortNames: ['BryansHeadphones'],
      }).map((port) => port.value),
    ).toEqual(['/dev/cu.usbserial-AI2SP9LC']);
  });

  it('should match custom names case-insensitively and against a pasted callout path', () => {
    expect(
      serialPortSelectItems(['/dev/cu.BryansHeadphones', '/dev/cu.usbserial-1'], {
        filterCommonPorts: true,
        excludedPortNames: ['/dev/cu.bryansheadphones'],
      }).map((port) => port.value),
    ).toEqual(['/dev/cu.usbserial-1']);
  });
});
