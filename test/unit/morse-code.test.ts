import { describe, expect, it } from 'vitest';
import {
  MORSE_CHARACTERS,
  beginChallenge,
  checkPractice,
  freshPracticeState,
  morseCharacter,
  morseTiming,
  parisDurationSeconds,
  pickFromPool,
  practiceAccuracy,
  revealPractice,
  schedulePattern,
} from '../../app/utils/morse-code.ts';

describe('Morse mappings and timing', () => {
  it('matches ITU letters, digits, and common punctuation', () => {
    expect(morseCharacter('A')?.pattern).toBe('.-');
    expect(morseCharacter('K')?.pattern).toBe('-.-');
    expect(morseCharacter('accent-e')?.pattern).toBe('..-..');
    expect(morseCharacter('0')?.pattern).toBe('-----');
    expect(morseCharacter('9')?.pattern).toBe('----.');
    expect(morseCharacter('period')?.pattern).toBe('.-.-.-');
    expect(morseCharacter('question')?.pattern).toBe('..--..');
    expect(morseCharacter('at')?.pattern).toBe('.--.-.');
    expect(morseCharacter('equals')?.pattern).toBe('-...-');
    expect(morseCharacter('plus')?.pattern).toBe('.-.-.');
    expect(morseCharacter('error')?.pattern).toBe('........');
    expect(morseCharacter('sos')?.pattern).toBe('...---...');
    expect(new Set(MORSE_CHARACTERS.map((character) => character.pattern)).size).toBe(MORSE_CHARACTERS.length);
  });

  it('uses PARIS 50-unit timing and a 1:3:1:3:7 ratio', () => {
    const timing = morseTiming(20);

    expect(timing.ditSeconds).toBeCloseTo(0.06);
    expect(timing.dahSeconds / timing.ditSeconds).toBeCloseTo(3);
    expect(timing.intraSeconds / timing.ditSeconds).toBeCloseTo(1);
    expect(timing.letterSeconds / timing.ditSeconds).toBeCloseTo(3);
    expect(timing.wordSeconds / timing.ditSeconds).toBeCloseTo(7);
    expect(timing.farnsworth).toBe(false);
    expect(parisDurationSeconds(timing)).toBeCloseTo(3);

    const events = schedulePattern('.-', timing);
    expect(events.map((event) => event.kind)).toEqual(['dit', 'dah']);
    expect(events[1].startSeconds - (events[0].startSeconds + events[0].durationSeconds)).toBeCloseTo(timing.intraSeconds);
  });

  it('lengthens only the gaps when Farnsworth is faster than the overall speed', () => {
    const timing = morseTiming(10, 20);

    expect(timing.farnsworth).toBe(true);
    expect(timing.ditSeconds).toBeCloseTo(0.06);
    expect(timing.letterSeconds).toBeGreaterThan(3 * timing.ditSeconds);
    expect(timing.wordSeconds / timing.letterSeconds).toBeCloseTo(7 / 3);
    expect(parisDurationSeconds(timing)).toBeCloseTo(6);
    expect(morseTiming(20, 15).farnsworth).toBe(false);
    expect(morseTiming(20, 15).ditSeconds).toBeCloseTo(0.06);
    expect(() => morseTiming(0)).toThrow(/WPM/);
  });

  it('sends SOS as one character with intra-character gaps only', () => {
    const timing = morseTiming(20);
    const events = schedulePattern(morseCharacter('sos')?.pattern ?? '', timing);

    expect(events).toHaveLength(9);

    for (let index = 1; index < events.length; index += 1) {
      const gap = events[index].startSeconds - (events[index - 1].startSeconds + events[index - 1].durationSeconds);
      expect(gap).toBeCloseTo(timing.intraSeconds);
    }
  });
});

describe('Morse practice scoring', () => {
  it('refuses an empty pool without calling the random source', () => {
    expect(pickFromPool([], () => {
      throw new Error('rng');
    })).toBeUndefined();

    const next = beginChallenge(freshPracticeState(), [], () => {
      throw new Error('rng');
    });

    expect(next.currentId).toBeNull();
    expect(next.hint).toContain('Select');
    expect(next.attempts).toBe(0);
  });

  it('picks inside the pool and normalizes the typed answer', () => {
    const letters = MORSE_CHARACTERS.filter((character) => character.group === 'letter');
    const first = beginChallenge(freshPracticeState(), letters, () => 0);
    const last = beginChallenge(freshPracticeState(), letters, () => 0.999);

    expect(first.currentId).toBe(letters[0]?.id);
    expect(last.currentId).toBe(letters[letters.length - 1]?.id);

    const checked = checkPractice(first, ' a ');

    expect(checked.lastCorrect).toBe(true);
    expect(checked.attempts).toBe(1);
    expect(checked.correct).toBe(1);
    expect(checked.hint).toBe('Correct.');
    expect(checked.revealed).toBe(false);
    expect(checkPractice(checked, 'b')).toBe(checked);

    const missed = checkPractice(first, 'b');

    expect(missed.lastCorrect).toBe(false);
    expect(missed.revealed).toBe(false);
    expect(missed.hint).not.toContain('A');

    const blank = checkPractice(first, '   ');

    expect(blank.attempts).toBe(0);
    expect(blank.hint).toContain('Type the character');

    expect(checkPractice(beginChallenge(freshPracticeState(), [MORSE_CHARACTERS.find((entry) => entry.id === 'period')!], () => 0), 'period').lastCorrect).toBe(true);
    expect(checkPractice(beginChallenge(freshPracticeState(), [MORSE_CHARACTERS.find((entry) => entry.id === 'equals')!], () => 0), 'bt').lastCorrect).toBe(true);
  });

  it('counts reveal once, leaves replay as the same challenge, and resets', () => {
    const started = beginChallenge(
      freshPracticeState(),
      MORSE_CHARACTERS.filter((character) => character.group === 'digit'),
      () => 0,
    );
    const revealed = revealPractice(started);

    expect(revealed.currentId).toBe(started.currentId);
    expect(revealed.revealed).toBe(true);
    expect(revealed.attempts).toBe(1);
    expect(revealed.correct).toBe(0);
    expect(revealPractice(revealed)).toBe(revealed);
    expect(checkPractice(revealed, '0').attempts).toBe(1);

    const afterCheck = checkPractice(started, '0');
    const revealedAfter = revealPractice(afterCheck);

    expect(revealedAfter.attempts).toBe(1);
    expect(revealedAfter.correct).toBe(1);
    expect(practiceAccuracy(revealedAfter)).toBe(1);

    const reset = freshPracticeState();

    expect(reset.attempts).toBe(0);
    expect(reset.currentId).toBeNull();
    expect(practiceAccuracy(reset)).toBeNull();
  });
});
