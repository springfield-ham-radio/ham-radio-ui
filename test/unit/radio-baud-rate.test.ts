import { describe, it } from 'node:test';
import { expect } from 'chai';
import {
  listedProgrammingBaudRates,
  parseRememberedBaudRates,
  programmingBaudRateSelectItems,
  resolveProgrammingBaudRate,
  serializeRememberedBaudRates,
  shouldSelectProgrammingBaudRate,
} from '../../app/utils/radio-baud-rate.ts';

describe('radio baud rate', () => {
  const singleRate = { baudRate: 9600 };
  const multipleRates = {
    baudRate: 9600,
    baudRates: [9600, 19200, 38400, 57600],
  };

  describe('listedProgrammingBaudRates', () => {
    it('should return only the default baud rate when the radio lists none', () => {
      expect(listedProgrammingBaudRates(singleRate)).to.deep.equal([9600]);
    });

    it('should return the driver list when the radio supports multiple rates', () => {
      expect(listedProgrammingBaudRates(multipleRates)).to.deep.equal([9600, 19200, 38400, 57600]);
    });

    it('should ignore an empty baudRates list and fall back to the default', () => {
      expect(listedProgrammingBaudRates({ baudRate: 9600, baudRates: [] })).to.deep.equal([9600]);
    });

    it('should drop non-integer and out-of-range values while keeping order', () => {
      expect(
        listedProgrammingBaudRates({
          baudRate: 9600,
          baudRates: [9600, 100, 19200, 19200, '38400', 57600.5],
        }),
      ).to.deep.equal([9600, 19200]);
    });
  });

  describe('shouldSelectProgrammingBaudRate', () => {
    it('should hide the selector when the radio has a single rate', () => {
      expect(shouldSelectProgrammingBaudRate(singleRate)).to.equal(false);
    });

    it('should show the selector when the radio lists more than one rate', () => {
      expect(shouldSelectProgrammingBaudRate(multipleRates)).to.equal(true);
    });
  });

  describe('resolveProgrammingBaudRate', () => {
    it('should select the driver default when nothing is remembered', () => {
      expect(resolveProgrammingBaudRate(multipleRates, undefined)).to.equal(9600);
    });

    it('should select the remembered rate when it is still valid for the radio', () => {
      expect(resolveProgrammingBaudRate(multipleRates, 19200)).to.equal(19200);
    });

    it('should fall back to the driver default when the remembered rate is not listed', () => {
      expect(resolveProgrammingBaudRate(multipleRates, 115200)).to.equal(9600);
    });

    it('should use the first listed rate when the default is missing from baudRates', () => {
      expect(resolveProgrammingBaudRate({ baudRate: 4800, baudRates: [9600, 19200] }, undefined)).to.equal(9600);
    });
  });

  describe('programmingBaudRateSelectItems', () => {
    it('should map listed rates to select items', () => {
      expect(programmingBaudRateSelectItems(multipleRates)).to.deep.equal([
        { label: '9600', value: 9600 },
        { label: '19200', value: 19200 },
        { label: '38400', value: 38400 },
        { label: '57600', value: 57600 },
      ]);
    });
  });

  describe('remembered baud rates', () => {
    it('should fall back to an empty map when storage is empty or invalid', () => {
      expect(parseRememberedBaudRates(null)).to.deep.equal({});
      expect(parseRememberedBaudRates('')).to.deep.equal({});
      expect(parseRememberedBaudRates('{')).to.deep.equal({});
      expect(parseRememberedBaudRates('[]')).to.deep.equal({});
    });

    it('should keep integer baud rates keyed by radio model', () => {
      const parsed = parseRememberedBaudRates(
        JSON.stringify({
          'kenwood-tm-d710a': 19200,
          'kenwood-th-d74': '57600',
          extra: true,
        }),
      );

      expect(parsed).to.deep.equal({
        'kenwood-tm-d710a': 19200,
      });
    });

    it('should round-trip remembered rates through serialize and parse', () => {
      const remembered = { 'kenwood-tm-d710a': 38400, 'kenwood-th-f6': 4800 };

      expect(parseRememberedBaudRates(serializeRememberedBaudRates(remembered))).to.deep.equal(remembered);
    });
  });
});
