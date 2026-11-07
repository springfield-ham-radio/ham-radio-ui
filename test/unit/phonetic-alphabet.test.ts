import { describe, expect, it } from 'vitest';
import { PHONETIC_ENTRIES, filterPhoneticEntries } from '../../app/utils/phonetic-alphabet.ts';

describe('phonetic alphabet', () => {
  it('uses the ITU spellings Alfa and Juliett', () => {
    const alfa = PHONETIC_ENTRIES.find((entry) => entry.symbol === 'A');
    const juliett = PHONETIC_ENTRIES.find((entry) => entry.symbol === 'J');

    expect(alfa?.word).toBe('Alfa');
    expect(juliett?.word).toBe('Juliett');
    expect(PHONETIC_ENTRIES.filter((entry) => entry.group === 'letter')).toHaveLength(26);
  });

  it('includes the figure code for digits', () => {
    expect(PHONETIC_ENTRIES.find((entry) => entry.symbol === '0')?.word).toBe('Nadazero');
    expect(PHONETIC_ENTRIES.find((entry) => entry.symbol === '9')?.word).toBe('Novenine');
    expect(PHONETIC_ENTRIES.find((entry) => entry.symbol === '.')?.word).toBe('Decimal');
  });

  it('searches words and the Juliett alias without changing the spelling', () => {
    expect(filterPhoneticEntries('alfa').map((entry) => entry.symbol)).toEqual(['A']);
    const found = filterPhoneticEntries('juliet');

    expect(found).toHaveLength(1);
    expect(found[0]?.word).toBe('Juliett');
    expect(filterPhoneticEntries('')).toHaveLength(PHONETIC_ENTRIES.length);
  });
});
