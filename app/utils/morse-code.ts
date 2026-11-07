/**
 * International Morse code from Recommendation ITU-R M.1677-1 (10/2009).
 *
 * Timing: a dash is three dots, the gap inside a character is one dot,
 * the gap between characters is three dots, and the gap between words is
 * seven dots. PARIS is 50 of those units, so a dot is 1.2 / WPM seconds.
 *
 * Farnsworth keeps that element timing at the faster character speed and
 * lengthens only the character gap and the word gap, still in the ratio 3:7.
 * It never shortens a gap below the standard.
 */

export type MorseGroup = 'letter' | 'digit' | 'punctuation' | 'procedural' | 'accent';

export interface MorseCharacter {
  id: string;
  /** Glyph or short name shown in the reference table. */
  symbol: string;
  pattern: string;
  group: MorseGroup;
  name: string;
  /** Accepted typed answers, compared after trim and case-fold. */
  answers: readonly string[];
  note?: string;
}

export interface MorseTiming {
  ditSeconds: number;
  dahSeconds: number;
  intraSeconds: number;
  letterSeconds: number;
  wordSeconds: number;
  /** True when character and word gaps are longer than 3 and 7 dots. */
  farnsworth: boolean;
}

export interface ToneEvent {
  startSeconds: number;
  durationSeconds: number;
  kind: 'dit' | 'dah';
}

const LETTERS: ReadonlyArray<[string, string]> = [
  ['A', '.-'],
  ['B', '-...'],
  ['C', '-.-.'],
  ['D', '-..'],
  ['E', '.'],
  ['F', '..-.'],
  ['G', '--.'],
  ['H', '....'],
  ['I', '..'],
  ['J', '.---'],
  ['K', '-.-'],
  ['L', '.-..'],
  ['M', '--'],
  ['N', '-.'],
  ['O', '---'],
  ['P', '.--.'],
  ['Q', '--.-'],
  ['R', '.-.'],
  ['S', '...'],
  ['T', '-'],
  ['U', '..-'],
  ['V', '...-'],
  ['W', '.--'],
  ['X', '-..-'],
  ['Y', '-.--'],
  ['Z', '--..'],
];

function letterCharacter([symbol, pattern]: [string, string]): MorseCharacter {
  const note = symbol === 'K'
    ? 'Also the invitation to transmit.'
    : symbol === 'X'
      ? 'The multiplication sign is sent as X.'
      : undefined;

  return {
    id: symbol,
    symbol,
    pattern,
    group: 'letter',
    name: symbol,
    answers: [symbol],
    note,
  };
}

export const MORSE_CHARACTERS: readonly MorseCharacter[] = [
  ...LETTERS.map(letterCharacter),
  {
    id: 'accent-e',
    symbol: 'É',
    pattern: '..-..',
    group: 'accent',
    name: 'Accented E',
    answers: ['É', 'E ACUTE', 'ACCENTED E'],
  },
  ...[
    ['0', '-----'],
    ['1', '.----'],
    ['2', '..---'],
    ['3', '...--'],
    ['4', '....-'],
    ['5', '.....'],
    ['6', '-....'],
    ['7', '--...'],
    ['8', '---..'],
    ['9', '----.'],
  ].map(([symbol, pattern]): MorseCharacter => ({
    id: symbol,
    symbol,
    pattern,
    group: 'digit',
    name: symbol,
    answers: [symbol],
  })),
  {
    id: 'period',
    symbol: '.',
    pattern: '.-.-.-',
    group: 'punctuation',
    name: 'Full stop',
    answers: ['.', 'PERIOD', 'FULL STOP', 'STOP'],
  },
  {
    id: 'comma',
    symbol: ',',
    pattern: '--..--',
    group: 'punctuation',
    name: 'Comma',
    answers: [',', 'COMMA'],
  },
  {
    id: 'colon',
    symbol: ':',
    pattern: '---...',
    group: 'punctuation',
    name: 'Colon',
    answers: [':', 'COLON'],
  },
  {
    id: 'question',
    symbol: '?',
    pattern: '..--..',
    group: 'punctuation',
    name: 'Question mark',
    answers: ['?', 'QUESTION'],
  },
  {
    id: 'apostrophe',
    symbol: "'",
    pattern: '.----.',
    group: 'punctuation',
    name: 'Apostrophe',
    answers: ["'", 'APOSTROPHE'],
  },
  {
    id: 'hyphen',
    symbol: '-',
    pattern: '-....-',
    group: 'punctuation',
    name: 'Hyphen',
    answers: ['-', 'HYPHEN'],
  },
  {
    id: 'slash',
    symbol: '/',
    pattern: '-..-.',
    group: 'punctuation',
    name: 'Fraction bar',
    answers: ['/', 'SLASH', 'FRACTION'],
  },
  {
    id: 'open-paren',
    symbol: '(',
    pattern: '-.--.',
    group: 'punctuation',
    name: 'Left parenthesis',
    answers: ['(', 'LEFT PAREN', 'OPEN PAREN'],
  },
  {
    id: 'close-paren',
    symbol: ')',
    pattern: '-.--.-',
    group: 'punctuation',
    name: 'Right parenthesis',
    answers: [')', 'RIGHT PAREN', 'CLOSE PAREN'],
  },
  {
    id: 'quote',
    symbol: '"',
    pattern: '.-..-.',
    group: 'punctuation',
    name: 'Quotation marks',
    answers: ['"', 'QUOTE'],
  },
  {
    id: 'equals',
    symbol: '=',
    pattern: '-...-',
    group: 'punctuation',
    name: 'Double hyphen',
    answers: ['=', 'BT', 'DOUBLE HYPHEN'],
    note: 'Amateurs often call this BT.',
  },
  {
    id: 'plus',
    symbol: '+',
    pattern: '.-.-.',
    group: 'punctuation',
    name: 'Cross',
    answers: ['+', 'AR', 'CROSS'],
    note: 'Amateurs often call this AR.',
  },
  {
    id: 'at',
    symbol: '@',
    pattern: '.--.-.',
    group: 'punctuation',
    name: 'Commercial at',
    answers: ['@', 'AT'],
  },
  {
    id: 'understood',
    symbol: 'SN',
    pattern: '...-.',
    group: 'procedural',
    name: 'Understood',
    answers: ['SN', 'UNDERSTOOD'],
  },
  {
    id: 'error',
    symbol: 'Error',
    pattern: '........',
    group: 'procedural',
    name: 'Error',
    answers: ['ERROR', '8 DOTS', 'EIGHT DOTS'],
    note: 'Eight dots.',
  },
  {
    id: 'wait',
    symbol: 'AS',
    pattern: '.-...',
    group: 'procedural',
    name: 'Wait',
    answers: ['AS', 'WAIT'],
  },
  {
    id: 'end-of-work',
    symbol: 'SK',
    pattern: '...-.-',
    group: 'procedural',
    name: 'End of work',
    answers: ['SK', 'END OF WORK'],
  },
  {
    id: 'start',
    symbol: 'KA',
    pattern: '-.-.-',
    group: 'procedural',
    name: 'Starting signal',
    answers: ['KA', 'CT', 'START'],
  },
  {
    id: 'sos',
    symbol: 'SOS',
    pattern: '...---...',
    group: 'procedural',
    name: 'Distress signal',
    answers: ['SOS'],
    note: 'One signal, with no letter gaps.',
  },
];

const BY_ID = new Map(MORSE_CHARACTERS.map((character) => [character.id, character]));

export function morseCharacter(id: string): MorseCharacter | undefined {
  return BY_ID.get(id);
}

export function charactersInGroups(groups: readonly MorseGroup[]): MorseCharacter[] {
  const wanted = new Set(groups);

  return MORSE_CHARACTERS.filter((character) => wanted.has(character.group));
}

export function morseTiming(overallWpm: number, characterWpm?: number): MorseTiming {
  if (!(overallWpm > 0) || !Number.isFinite(overallWpm)) {
    throw new Error('WPM must be a positive number');
  }

  const useFarnsworth = characterWpm !== undefined
    && Number.isFinite(characterWpm)
    && characterWpm > overallWpm;
  const elementWpm = useFarnsworth ? (characterWpm as number) : overallWpm;
  const dit = 1.2 / elementWpm;
  let letter = 3 * dit;
  let word = 7 * dit;
  let farnsworth = false;

  if (useFarnsworth) {
    const stretched = ((60 / overallWpm) - (31 * dit)) * (3 / 19);

    if (stretched + 1e-9 >= 3 * dit) {
      letter = stretched;
      word = (stretched * 7) / 3;
      farnsworth = stretched > 3 * dit + 1e-9;
    }
  }

  return {
    ditSeconds: dit,
    dahSeconds: 3 * dit,
    intraSeconds: dit,
    letterSeconds: letter,
    wordSeconds: word,
    farnsworth,
  };
}

export function schedulePattern(pattern: string, timing: MorseTiming, startSeconds = 0): ToneEvent[] {
  const events: ToneEvent[] = [];
  let cursor = startSeconds;

  for (let index = 0; index < pattern.length; index += 1) {
    const mark = pattern[index];

    if (mark !== '.' && mark !== '-') {
      throw new Error(`Unsupported Morse mark ${mark}`);
    }

    const duration = mark === '-' ? timing.dahSeconds : timing.ditSeconds;

    events.push({
      startSeconds: cursor,
      durationSeconds: duration,
      kind: mark === '-' ? 'dah' : 'dit',
    });
    cursor += duration;

    if (index < pattern.length - 1) {
      cursor += timing.intraSeconds;
    }
  }

  return events;
}

/**
 * Patterns separated by character gaps. A `' '` token is a word gap
 * instead of a character gap, which is how PARIS reaches 50 units.
 */
export function scheduleMessage(
  tokens: readonly string[],
  timing: MorseTiming,
): { events: ToneEvent[]; durationSeconds: number } {
  const events: ToneEvent[] = [];
  let cursor = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token === ' ') {
      cursor += timing.wordSeconds;
      continue;
    }

    const tones = schedulePattern(token, timing, cursor);
    events.push(...tones);

    if (tones.length > 0) {
      const last = tones[tones.length - 1];
      cursor = last.startSeconds + last.durationSeconds;
    }

    const next = tokens[index + 1];

    if (next === undefined || next === ' ') {
      continue;
    }

    cursor += timing.letterSeconds;
  }

  return { events, durationSeconds: cursor };
}

/** PARIS plus the word gap, which is the 50-unit standard word. */
export function parisDurationSeconds(timing: MorseTiming): number {
  const letters = ['P', 'A', 'R', 'I', 'S'].map((symbol) => {
    const character = MORSE_CHARACTERS.find((entry) => entry.symbol === symbol);

    if (!character) {
      throw new Error(`Missing ${symbol}`);
    }

    return character.pattern;
  });

  return scheduleMessage([...letters, ' '], timing).durationSeconds;
}

export function answerMatches(character: MorseCharacter, raw: string): boolean {
  const folded = raw.trim().replace(/\s+/g, ' ').toUpperCase();

  if (!folded) {
    return false;
  }

  return character.answers.some((answer) => answer.toUpperCase() === folded);
}

export interface PracticeState {
  currentId: string | null;
  checked: boolean;
  revealed: boolean;
  lastCorrect: boolean | null;
  attempts: number;
  correct: number;
  /** Status that must not contain the answer unless it was revealed or correct. */
  hint: string;
}

export function freshPracticeState(): PracticeState {
  return {
    currentId: null,
    checked: false,
    revealed: false,
    lastCorrect: null,
    attempts: 0,
    correct: 0,
    hint: '',
  };
}

export function pickFromPool<T>(pool: readonly T[], rng: () => number): T | undefined {
  if (pool.length === 0) {
    return undefined;
  }

  const raw = rng();
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(raw * pool.length)));

  return pool[index];
}

export function beginChallenge(
  state: PracticeState,
  pool: readonly MorseCharacter[],
  rng: () => number,
): PracticeState {
  const next = pickFromPool(pool, rng);

  if (!next) {
    return {
      ...state,
      currentId: null,
      checked: false,
      revealed: false,
      lastCorrect: null,
      hint: 'Select at least one character set.',
    };
  }

  return {
    ...state,
    currentId: next.id,
    checked: false,
    revealed: false,
    lastCorrect: null,
    hint: '',
  };
}

export function checkPractice(state: PracticeState, raw: string): PracticeState {
  if (!state.currentId || state.checked) {
    return state;
  }

  const character = morseCharacter(state.currentId);

  if (!character) {
    return state;
  }

  if (!raw.trim()) {
    return {
      ...state,
      hint: 'Type the character you heard, then check.',
    };
  }

  const correct = answerMatches(character, raw);

  return {
    ...state,
    checked: true,
    lastCorrect: correct,
    attempts: state.attempts + 1,
    correct: state.correct + (correct ? 1 : 0),
    hint: correct ? 'Correct.' : 'Not a match.',
    revealed: correct ? state.revealed : state.revealed,
  };
}

export function revealPractice(state: PracticeState): PracticeState {
  if (!state.currentId || state.revealed) {
    return state;
  }

  if (state.checked) {
    return {
      ...state,
      revealed: true,
    };
  }

  return {
    ...state,
    revealed: true,
    checked: true,
    lastCorrect: false,
    attempts: state.attempts + 1,
    hint: 'Revealed.',
  };
}

export function practiceAccuracy(state: PracticeState): number | null {
  if (state.attempts === 0) {
    return null;
  }

  return state.correct / state.attempts;
}

export function patternText(pattern: string): string {
  return pattern.replaceAll('.', '·').replaceAll('-', '−');
}

export function filterMorseCharacters(query: string): MorseCharacter[] {
  const needle = query.trim().toLowerCase();

  if (!needle) {
    return [...MORSE_CHARACTERS];
  }

  return MORSE_CHARACTERS.filter((character) => {
    const haystack = [character.symbol, character.name, character.pattern, patternText(character.pattern), character.note ?? '']
      .join(' ')
      .toLowerCase();

    return haystack.includes(needle);
  });
}
