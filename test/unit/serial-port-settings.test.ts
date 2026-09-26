import { describe, expect, it } from 'vitest';
import {
  defaultSerialPortSettings,
  parseSerialPortSettings,
  serializeSerialPortSettings,
} from '../../app/utils/serial-port-settings.ts';

describe('serial port settings', () => {
  it('should hide common system ports by default with no custom names', () => {
    expect(defaultSerialPortSettings()).toEqual({
      filterCommonPorts: true,
      excludedPortNames: [],
      portAliases: [],
    });
  });

  it('should fall back to defaults when storage is empty or invalid', () => {
    expect(parseSerialPortSettings(null)).toEqual(defaultSerialPortSettings());
    expect(parseSerialPortSettings('')).toEqual(defaultSerialPortSettings());
    expect(parseSerialPortSettings('{')).toEqual(defaultSerialPortSettings());
    expect(parseSerialPortSettings('[]')).toEqual(defaultSerialPortSettings());
  });

  it('should parse stored settings and ignore unknown fields', () => {
    const parsed = parseSerialPortSettings(
      JSON.stringify({
        filterCommonPorts: false,
        excludedPortNames: ['BryansHeadphones', ' AirPods '],
        extra: true,
      }),
    );

    expect(parsed).toEqual({
      filterCommonPorts: false,
      excludedPortNames: ['BryansHeadphones', 'AirPods'],
      portAliases: [],
    });
  });

  it('should treat a missing filter flag as enabled and missing names as empty', () => {
    expect(parseSerialPortSettings(JSON.stringify({}))).toEqual({
      filterCommonPorts: true,
      excludedPortNames: [],
      portAliases: [],
    });
  });

  it('should drop blank and duplicate custom names while keeping the first spelling', () => {
    expect(
      parseSerialPortSettings(
        JSON.stringify({
          excludedPortNames: ['BryansHeadphones', '', '  ', 'bryansheadphones', 'AirPods'],
        }),
      ).excludedPortNames,
    ).toEqual(['BryansHeadphones', 'AirPods']);
  });

  it('should ignore a non-array excludedPortNames value', () => {
    expect(parseSerialPortSettings(JSON.stringify({ excludedPortNames: 'BryansHeadphones' }))).toEqual({
      filterCommonPorts: true,
      excludedPortNames: [],
      portAliases: [],
    });
  });

  it('should round-trip settings through serialize and parse', () => {
    const settings = {
      filterCommonPorts: false,
      excludedPortNames: ['BryansHeadphones'],
      portAliases: [{ systemName: 'usbserial-A50285BI', name: 'Kenwood cable' }],
    };

    expect(parseSerialPortSettings(serializeSerialPortSettings(settings))).toEqual(settings);
  });

  it('should serialize trimmed names without mutating the live tags list', () => {
    const excludedPortNames = [' BryansHeadphones '];

    const serialized = serializeSerialPortSettings({
      filterCommonPorts: true,
      excludedPortNames,
      portAliases: [],
    });

    expect(excludedPortNames).toEqual([' BryansHeadphones ']);
    expect(parseSerialPortSettings(serialized).excludedPortNames).toEqual(['BryansHeadphones']);
  });

  it('should keep the first name for a system port and drop incomplete rows', () => {
    expect(
      parseSerialPortSettings(
        JSON.stringify({
          portAliases: [
            { systemName: ' /dev/cu.usbserial-A50285BI ', name: ' Kenwood cable ' },
            { systemName: 'usbserial-A50285BI', name: 'Other cable' },
            { systemName: 'COM3', name: '   ' },
            { systemName: '', name: 'Missing port' },
            { systemName: 'COM4', name: 'Baofeng' },
            'not-an-alias',
          ],
        }),
      ).portAliases,
    ).toEqual([
      { systemName: '/dev/cu.usbserial-A50285BI', name: 'Kenwood cable' },
      { systemName: 'COM4', name: 'Baofeng' },
    ]);
  });

  it('should ignore a non-array portAliases value', () => {
    expect(parseSerialPortSettings(JSON.stringify({ portAliases: 'Kenwood cable' })).portAliases).toEqual([]);
  });

  it('should serialize trimmed aliases without mutating the live list', () => {
    const portAliases = [{ systemName: ' COM3 ', name: ' Kenwood cable ' }];

    const serialized = serializeSerialPortSettings({
      filterCommonPorts: true,
      excludedPortNames: [],
      portAliases,
    });

    expect(portAliases).toEqual([{ systemName: ' COM3 ', name: ' Kenwood cable ' }]);
    expect(parseSerialPortSettings(serialized).portAliases).toEqual([{ systemName: 'COM3', name: 'Kenwood cable' }]);
  });
});
