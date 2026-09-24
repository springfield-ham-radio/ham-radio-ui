import { describe, expect, it } from 'vitest';
import { RadioModelId, type RadioId } from '@springfield/ham-radio-api';
import {
  parseRememberedRadio,
  resolveRememberedRadio,
  serializeRememberedRadio,
} from '../../app/utils/remembered-radio.ts';

const uv5r: RadioId = {
  model: RadioModelId('baofeng-uv5r'),
  name: 'Baofeng UV-5R',
  manufacturer: 'Baofeng',
};

const tmD710: RadioId = {
  model: RadioModelId('kenwood-tm-d710a'),
  name: 'TM-D710A',
  manufacturer: 'Kenwood',
};

describe('remembered radio', () => {
  it('should fall back to undefined when storage is empty or invalid', () => {
    expect(parseRememberedRadio(null)).toBe(undefined);
    expect(parseRememberedRadio('')).toBe(undefined);
    expect(parseRememberedRadio('{')).toBe(undefined);
    expect(parseRememberedRadio('[]')).toBe(undefined);
    expect(parseRememberedRadio(JSON.stringify({ model: 'baofeng-uv5r' }))).toBe(undefined);
  });

  it('should parse a stored radio and ignore unknown fields', () => {
    expect(
      parseRememberedRadio(
        JSON.stringify({
          model: 'baofeng-uv5r',
          name: 'Baofeng UV-5R',
          manufacturer: 'Baofeng',
          extra: true,
        }),
      ),
    ).toEqual(uv5r);
  });

  it('should reject blank identity fields', () => {
    expect(
      parseRememberedRadio(
        JSON.stringify({
          model: '',
          name: 'Baofeng UV-5R',
          manufacturer: 'Baofeng',
        }),
      ),
    ).toBe(undefined);
  });

  it('should round-trip a radio through serialize and parse', () => {
    expect(parseRememberedRadio(serializeRememberedRadio(uv5r))).toEqual(uv5r);
  });

  describe('resolveRememberedRadio', () => {
    it('should return undefined when nothing is remembered', () => {
      expect(resolveRememberedRadio(undefined, [uv5r, tmD710])).toBe(undefined);
    });

    it('should return the catalog radio when the remembered model is still installed', () => {
      const remembered = parseRememberedRadio(serializeRememberedRadio(uv5r));

      expect(resolveRememberedRadio(remembered, [tmD710, uv5r])).toBe(uv5r);
    });

    it('should return undefined when the remembered radio is no longer installed', () => {
      expect(resolveRememberedRadio(uv5r, [tmD710])).toBe(undefined);
    });
  });
});
