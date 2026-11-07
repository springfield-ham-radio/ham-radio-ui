/**
 * ITU phonetic alphabet and figure code.
 * Spellings follow Radio Regulations Appendix 14 (Rev. WRC-07 / Rev. WRC-23).
 * Spoken forms are the "spoken as" column. Stressed syllables are underlined
 * in the Regulations; those underlines are not reproduced here.
 */

export type PhoneticGroup = 'letter' | 'figure';

export interface PhoneticEntry {
  symbol: string;
  word: string;
  spoken: string;
  group: PhoneticGroup;
  /** Search-only aliases. Never display these as the spelling. */
  searchAliases?: readonly string[];
}

export const PHONETIC_ENTRIES: readonly PhoneticEntry[] = [
  { symbol: 'A', word: 'Alfa', spoken: 'AL FAH', group: 'letter' },
  { symbol: 'B', word: 'Bravo', spoken: 'BRAH VOH', group: 'letter' },
  { symbol: 'C', word: 'Charlie', spoken: 'CHAR LEE or SHAR LEE', group: 'letter' },
  { symbol: 'D', word: 'Delta', spoken: 'DELL TAH', group: 'letter' },
  { symbol: 'E', word: 'Echo', spoken: 'ECK OH', group: 'letter' },
  { symbol: 'F', word: 'Foxtrot', spoken: 'FOKS TROT', group: 'letter' },
  { symbol: 'G', word: 'Golf', spoken: 'GOLF', group: 'letter' },
  { symbol: 'H', word: 'Hotel', spoken: 'HOH TELL', group: 'letter' },
  { symbol: 'I', word: 'India', spoken: 'IN DEE AH', group: 'letter' },
  { symbol: 'J', word: 'Juliett', spoken: 'JEW LEE ETT', group: 'letter', searchAliases: ['juliet'] },
  { symbol: 'K', word: 'Kilo', spoken: 'KEY LOH', group: 'letter' },
  { symbol: 'L', word: 'Lima', spoken: 'LEE MAH', group: 'letter' },
  { symbol: 'M', word: 'Mike', spoken: 'MIKE', group: 'letter' },
  { symbol: 'N', word: 'November', spoken: 'NO VEM BER', group: 'letter' },
  { symbol: 'O', word: 'Oscar', spoken: 'OSS CAH', group: 'letter' },
  { symbol: 'P', word: 'Papa', spoken: 'PAH PAH', group: 'letter' },
  { symbol: 'Q', word: 'Quebec', spoken: 'KEH BECK', group: 'letter' },
  { symbol: 'R', word: 'Romeo', spoken: 'ROW ME OH', group: 'letter' },
  { symbol: 'S', word: 'Sierra', spoken: 'SEE AIR RAH', group: 'letter' },
  { symbol: 'T', word: 'Tango', spoken: 'TANG GO', group: 'letter' },
  { symbol: 'U', word: 'Uniform', spoken: 'YOU NEE FORM or OO NEE FORM', group: 'letter' },
  { symbol: 'V', word: 'Victor', spoken: 'VIK TAH', group: 'letter' },
  { symbol: 'W', word: 'Whiskey', spoken: 'WISS KEY', group: 'letter' },
  { symbol: 'X', word: 'X-ray', spoken: 'ECKS RAY', group: 'letter' },
  { symbol: 'Y', word: 'Yankee', spoken: 'YANG KEY', group: 'letter' },
  { symbol: 'Z', word: 'Zulu', spoken: 'ZOO LOO', group: 'letter' },
  { symbol: '0', word: 'Nadazero', spoken: 'NAH-DAH-ZAY-ROH', group: 'figure' },
  { symbol: '1', word: 'Unaone', spoken: 'OO-NAH-WUN', group: 'figure' },
  { symbol: '2', word: 'Bissotwo', spoken: 'BEES-SOH-TOO', group: 'figure' },
  { symbol: '3', word: 'Terrathree', spoken: 'TAY-RAH-TREE', group: 'figure' },
  { symbol: '4', word: 'Kartefour', spoken: 'KAR-TAY-FOWER', group: 'figure' },
  { symbol: '5', word: 'Pantafive', spoken: 'PAN-TAH-FIVE', group: 'figure' },
  { symbol: '6', word: 'Soxisix', spoken: 'SOK-SEE-SIX', group: 'figure' },
  { symbol: '7', word: 'Setteseven', spoken: 'SAY-TAY-SEVEN', group: 'figure' },
  { symbol: '8', word: 'Oktoeight', spoken: 'OK-TOH-AIT', group: 'figure' },
  { symbol: '9', word: 'Novenine', spoken: 'NO-VAY-NINER', group: 'figure' },
  { symbol: '.', word: 'Decimal', spoken: 'DAY-SEE-MAL', group: 'figure' },
  { symbol: 'Stop', word: 'Stop', spoken: 'STOP', group: 'figure' },
];

export function filterPhoneticEntries(query: string): PhoneticEntry[] {
  const needle = query.trim().toLowerCase();

  if (!needle) {
    return [...PHONETIC_ENTRIES];
  }

  return PHONETIC_ENTRIES.filter((entry) => {
    const haystack = [entry.symbol, entry.word, entry.spoken, ...(entry.searchAliases ?? [])]
      .join(' ')
      .toLowerCase();

    return haystack.includes(needle);
  });
}
