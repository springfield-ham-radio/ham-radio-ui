import { describe, it } from 'node:test';
import { expect } from 'chai';
import {
  defaultSerialPortSettings,
  parseSerialPortSettings,
  serializeSerialPortSettings,
} from '../../app/utils/serial-port-settings.ts';

describe('serial port settings', () => {
  it('should hide common system ports by default with no custom names', () => {
    expect(defaultSerialPortSettings()).to.deep.equal({
      filterCommonPorts: true,
      excludedPortNames: [],
    });
  });

  it('should fall back to defaults when storage is empty or invalid', () => {
    expect(parseSerialPortSettings(null)).to.deep.equal(defaultSerialPortSettings());
    expect(parseSerialPortSettings('')).to.deep.equal(defaultSerialPortSettings());
    expect(parseSerialPortSettings('{')).to.deep.equal(defaultSerialPortSettings());
    expect(parseSerialPortSettings('[]')).to.deep.equal(defaultSerialPortSettings());
  });

  it('should parse stored settings and ignore unknown fields', () => {
    const parsed = parseSerialPortSettings(
      JSON.stringify({
        filterCommonPorts: false,
        excludedPortNames: ['BryansHeadphones', ' AirPods '],
        extra: true,
      }),
    );

    expect(parsed).to.deep.equal({
      filterCommonPorts: false,
      excludedPortNames: ['BryansHeadphones', 'AirPods'],
    });
  });

  it('should treat a missing filter flag as enabled and missing names as empty', () => {
    expect(parseSerialPortSettings(JSON.stringify({}))).to.deep.equal({
      filterCommonPorts: true,
      excludedPortNames: [],
    });
  });

  it('should drop blank and duplicate custom names while keeping the first spelling', () => {
    expect(
      parseSerialPortSettings(
        JSON.stringify({
          excludedPortNames: ['BryansHeadphones', '', '  ', 'bryansheadphones', 'AirPods'],
        }),
      ).excludedPortNames,
    ).to.deep.equal(['BryansHeadphones', 'AirPods']);
  });

  it('should ignore a non-array excludedPortNames value', () => {
    expect(parseSerialPortSettings(JSON.stringify({ excludedPortNames: 'BryansHeadphones' }))).to.deep.equal({
      filterCommonPorts: true,
      excludedPortNames: [],
    });
  });

  it('should round-trip settings through serialize and parse', () => {
    const settings = {
      filterCommonPorts: false,
      excludedPortNames: ['BryansHeadphones'],
    };

    expect(parseSerialPortSettings(serializeSerialPortSettings(settings))).to.deep.equal(settings);
  });

  it('should serialize trimmed names without mutating the live tags list', () => {
    const excludedPortNames = [' BryansHeadphones '];

    const serialized = serializeSerialPortSettings({
      filterCommonPorts: true,
      excludedPortNames,
    });

    expect(excludedPortNames).to.deep.equal([' BryansHeadphones ']);
    expect(parseSerialPortSettings(serialized).excludedPortNames).to.deep.equal(['BryansHeadphones']);
  });
});
