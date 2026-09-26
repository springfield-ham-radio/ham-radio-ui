import { describe, expect, it } from 'vitest';
import { tokenizeJson } from '../../app/utils/json-highlight.ts';

function visibleKinds(source: string): string[] {
  return tokenizeJson(source)
    .filter((token) => token.kind !== 'whitespace')
    .map((token) => `${token.kind}:${token.text}`);
}

describe('tokenizeJson', () => {
  it('colors object keys separately from string values', () => {
    expect(visibleKinds('{\n  "version": "1.0.0"\n}')).toEqual([
      'punctuation:{',
      'key:"version"',
      'punctuation::',
      'string:"1.0.0"',
      'punctuation:}',
    ]);
  });

  it('colors numbers, booleans, and null', () => {
    expect(visibleKinds('[1, -2.5, 1e-3, true, false, null]')).toEqual([
      'punctuation:[',
      'number:1',
      'punctuation:,',
      'number:-2.5',
      'punctuation:,',
      'number:1e-3',
      'punctuation:,',
      'literal:true',
      'punctuation:,',
      'literal:false',
      'punctuation:,',
      'literal:null',
      'punctuation:]',
    ]);
  });

  it('keeps escaped quotes inside a string', () => {
    expect(visibleKinds('"say \\"hi\\""')).toEqual(['string:"say \\"hi\\""']);
  });

  it('treats a string before a colon as a key when whitespace separates them', () => {
    expect(visibleKinds('"id" : 4')).toEqual(['key:"id"', 'punctuation::', 'number:4']);
  });

  it('leaves identifier prefixes of literals as plain text', () => {
    expect(visibleKinds('trueish')).toEqual(['text:trueish']);
  });

  it('reconstructs the source exactly', () => {
    const source = '{\n  "values": [23, 25],\n  "ok": true\n}\n';

    expect(tokenizeJson(source).map((token) => token.text).join('')).toBe(source);
  });

  it('does not drop characters in invalid fragments', () => {
    const source = '{not json}';

    expect(tokenizeJson(source).map((token) => token.text).join('')).toBe(source);
  });

  it('returns no tokens for an empty string', () => {
    expect(tokenizeJson('')).toEqual([]);
  });
});
