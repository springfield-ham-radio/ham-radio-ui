import { describe, expect, it } from 'vitest';
import {
  parseRememberedSerialPort,
  resolveRememberedSerialPort,
  serializeRememberedSerialPort,
} from '../../app/utils/remembered-serial-port.ts';

const usbSerial = '/dev/cu.usbserial-A50285BI';
const usbModem = '/dev/cu.usbmodem123456';

describe('remembered serial port', () => {
  it('should fall back to undefined when storage is empty or invalid', () => {
    expect(parseRememberedSerialPort(null)).toBe(undefined);
    expect(parseRememberedSerialPort('')).toBe(undefined);
    expect(parseRememberedSerialPort('{')).toBe(undefined);
    expect(parseRememberedSerialPort('[]')).toBe(undefined);
    expect(parseRememberedSerialPort(JSON.stringify({ extra: true }))).toBe(undefined);
    expect(parseRememberedSerialPort(JSON.stringify({ path: '  ' }))).toBe(undefined);
  });

  it('should parse a stored path and ignore unknown fields', () => {
    expect(
      parseRememberedSerialPort(
        JSON.stringify({
          path: usbSerial,
          extra: true,
        }),
      ),
    ).toBe(usbSerial);
  });

  it('should trim stored paths', () => {
    expect(parseRememberedSerialPort(JSON.stringify({ path: ` ${usbSerial} ` }))).toBe(usbSerial);
  });

  it('should round-trip a path through serialize and parse', () => {
    expect(parseRememberedSerialPort(serializeRememberedSerialPort(usbSerial))).toBe(usbSerial);
  });

  describe('resolveRememberedSerialPort', () => {
    it('should keep the current port when it is still available', () => {
      expect(resolveRememberedSerialPort(usbSerial, [usbModem, usbSerial], usbModem)).toBe(usbModem);
    });

    it('should restore the remembered port when it is available and nothing is selected', () => {
      expect(resolveRememberedSerialPort(usbSerial, [usbModem, usbSerial])).toBe(usbSerial);
    });

    it('should restore the remembered port when the current selection disappeared', () => {
      expect(resolveRememberedSerialPort(usbSerial, [usbSerial], usbModem)).toBe(usbSerial);
    });

    it('should leave the port unselected when the remembered device is not available', () => {
      expect(resolveRememberedSerialPort(usbSerial, [usbModem])).toBe(undefined);
      expect(resolveRememberedSerialPort(usbSerial, [usbModem], usbSerial)).toBe(undefined);
    });
  });
});
