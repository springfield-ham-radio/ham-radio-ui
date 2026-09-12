import { describe, it } from 'node:test';
import { expect } from 'chai';
import {
  parseRememberedSerialPort,
  resolveRememberedSerialPort,
  serializeRememberedSerialPort,
} from '../../app/utils/remembered-serial-port.ts';

const usbSerial = '/dev/cu.usbserial-A50285BI';
const usbModem = '/dev/cu.usbmodem123456';

describe('remembered serial port', () => {
  it('should fall back to undefined when storage is empty or invalid', () => {
    expect(parseRememberedSerialPort(null)).to.equal(undefined);
    expect(parseRememberedSerialPort('')).to.equal(undefined);
    expect(parseRememberedSerialPort('{')).to.equal(undefined);
    expect(parseRememberedSerialPort('[]')).to.equal(undefined);
    expect(parseRememberedSerialPort(JSON.stringify({ extra: true }))).to.equal(undefined);
    expect(parseRememberedSerialPort(JSON.stringify({ path: '  ' }))).to.equal(undefined);
  });

  it('should parse a stored path and ignore unknown fields', () => {
    expect(
      parseRememberedSerialPort(
        JSON.stringify({
          path: usbSerial,
          extra: true,
        }),
      ),
    ).to.equal(usbSerial);
  });

  it('should trim stored paths', () => {
    expect(parseRememberedSerialPort(JSON.stringify({ path: ` ${usbSerial} ` }))).to.equal(usbSerial);
  });

  it('should round-trip a path through serialize and parse', () => {
    expect(parseRememberedSerialPort(serializeRememberedSerialPort(usbSerial))).to.equal(usbSerial);
  });

  describe('resolveRememberedSerialPort', () => {
    it('should keep the current port when it is still available', () => {
      expect(resolveRememberedSerialPort(usbSerial, [usbModem, usbSerial], usbModem)).to.equal(usbModem);
    });

    it('should restore the remembered port when it is available and nothing is selected', () => {
      expect(resolveRememberedSerialPort(usbSerial, [usbModem, usbSerial])).to.equal(usbSerial);
    });

    it('should restore the remembered port when the current selection disappeared', () => {
      expect(resolveRememberedSerialPort(usbSerial, [usbSerial], usbModem)).to.equal(usbSerial);
    });

    it('should leave the port unselected when the remembered device is not available', () => {
      expect(resolveRememberedSerialPort(usbSerial, [usbModem])).to.equal(undefined);
      expect(resolveRememberedSerialPort(usbSerial, [usbModem], usbSerial)).to.equal(undefined);
    });
  });
});
