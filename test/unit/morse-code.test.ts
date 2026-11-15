import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MORSE_CHARACTER_WPM,
  MORSE_CHARACTERS,
  MORSE_PARAGRAPH_WORD_GAPS,
  beginChallenge,
  cancelMorseSchedule,
  checkPractice,
  freshPracticeState,
  morseCharacter,
  morseTiming,
  parisDurationSeconds,
  pickFromPool,
  practiceAccuracy,
  revealPractice,
  scheduleMorseText,
  scheduleMorseTextFromIndex,
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
    expect(timing.paragraphSeconds).toBeCloseTo(timing.wordSeconds * MORSE_PARAGRAPH_WORD_GAPS);
    expect(parisDurationSeconds(timing)).toBeCloseTo(6);
    expect(morseTiming(20, 15).farnsworth).toBe(false);
    expect(morseTiming(20, 15).ditSeconds).toBeCloseTo(0.06);
    expect(morseTiming(20, 15).letterSeconds).toBeCloseTo(morseTiming(20).letterSeconds);
    expect(() => morseTiming(0)).toThrow(/WPM/);
  });

  it('uses the ARRL Farnsworth formula at 5 WPM overall and 18 WPM characters', () => {
    expect(DEFAULT_MORSE_CHARACTER_WPM).toBe(18);
    expect(MORSE_PARAGRAPH_WORD_GAPS).toBe(3);

    const dit = 1.2 / 18;
    const spacingUnit = ((60 / 5) - (31 * dit)) / 19;
    const timing = morseTiming(5, 18);

    expect(timing.farnsworth).toBe(true);
    expect(timing.ditSeconds).toBeCloseTo(dit, 10);
    expect(timing.dahSeconds).toBeCloseTo(3 * dit, 10);
    expect(timing.intraSeconds).toBeCloseTo(dit, 10);
    expect(timing.letterSeconds).toBeCloseTo(3 * spacingUnit, 10);
    expect(timing.wordSeconds).toBeCloseTo(7 * spacingUnit, 10);
    expect(timing.paragraphSeconds).toBeCloseTo(3 * timing.wordSeconds, 10);
    expect(timing.letterSeconds).toBeCloseTo(1.568421052631579, 8);
    expect(timing.wordSeconds).toBeCloseTo(3.6596491228070174, 8);
    expect(timing.paragraphSeconds).toBeCloseTo(10.978947368421052, 8);
    expect(parisDurationSeconds(timing)).toBeCloseTo(12, 8);

    const equal = morseTiming(18, 18);
    const standard = morseTiming(18);

    expect(equal).toEqual(standard);
    expect(equal.farnsworth).toBe(false);
    expect(equal.ditSeconds).toBeCloseTo(dit, 10);
    expect(equal.letterSeconds).toBeCloseTo(3 * dit, 10);
    expect(equal.wordSeconds).toBeCloseTo(7 * dit, 10);
    expect(equal.paragraphSeconds).toBeCloseTo(21 * dit, 10);
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

describe('Morse text timing', () => {
  const timing = morseTiming(20);

  function gap(text: string): number {
    const schedule = scheduleMorseText(text, timing);
    const first = schedule.marks[0];
    const second = schedule.marks[1];

    if (!first || !second) {
      throw new Error('expected two characters');
    }

    return second.startSeconds - first.endSeconds;
  }

  it('uses a character gap inside a word and the intra-character gap inside a letter', () => {
    const schedule = scheduleMorseText('HI', timing);

    expect(schedule.marks).toHaveLength(2);
    expect(schedule.skipped).toBe(0);
    expect(gap('HI')).toBeCloseTo(timing.letterSeconds, 10);
    expect(schedule.events[1].startSeconds - (schedule.events[0].startSeconds + schedule.events[0].durationSeconds))
      .toBeCloseTo(timing.intraSeconds, 10);
    expect(schedule.durationSeconds).toBeCloseTo(schedule.marks[1]?.endSeconds ?? 0, 10);
  });

  it('collapses spaces and a single newline into one word gap', () => {
    expect(gap('H I')).toBeCloseTo(timing.wordSeconds, 10);
    expect(gap('H   I')).toBeCloseTo(timing.wordSeconds, 10);
    expect(gap('H\nI')).toBeCloseTo(timing.wordSeconds, 10);
    expect(gap('H\r\nI')).toBeCloseTo(timing.wordSeconds, 10);
    expect(gap('H \n I')).toBeCloseTo(timing.wordSeconds, 10);

    const trailing = scheduleMorseText('H\n', timing);
    const letter = scheduleMorseText('H', timing);

    expect(trailing.durationSeconds).toBeCloseTo(letter.durationSeconds, 10);
    expect(scheduleMorseText('\nH', timing).marks[0]?.startSeconds).toBe(0);
  });

  it('uses three word gaps for a blank line, including under Farnsworth', () => {
    expect(gap('H\n\nI')).toBeCloseTo(timing.paragraphSeconds, 10);
    expect(gap('H\n\nI')).toBeCloseTo(MORSE_PARAGRAPH_WORD_GAPS * timing.wordSeconds, 10);
    expect(gap('H\r\n\r\nI')).toBeCloseTo(timing.paragraphSeconds, 10);
    expect(gap('H\n \nI')).toBeCloseTo(timing.paragraphSeconds, 10);
    expect(gap('H\n\n\n\nI')).toBeCloseTo(timing.paragraphSeconds, 10);

    const slow = morseTiming(5, DEFAULT_MORSE_CHARACTER_WPM);
    const schedule = scheduleMorseText('A\n\nB', slow);
    const first = schedule.marks[0];
    const second = schedule.marks[1];

    expect(second && first ? second.startSeconds - first.endSeconds : 0).toBeCloseTo(slow.paragraphSeconds, 10);
    expect(slow.paragraphSeconds).toBeCloseTo(MORSE_PARAGRAPH_WORD_GAPS * slow.wordSeconds, 10);
    expect(slow.wordSeconds).toBeGreaterThan(7 * slow.ditSeconds);
  });

  it('skips characters with no Morse equivalent and keeps the surrounding character gap', () => {
    const schedule = scheduleMorseText('H#I', timing);

    expect(schedule.skipped).toBe(1);
    expect(schedule.marks.map((mark) => mark.index)).toEqual([0, 2]);
    expect(gap('H#I')).toBeCloseTo(timing.letterSeconds, 10);
    expect(gap('A%B')).toBeCloseTo(timing.letterSeconds, 10);
    expect(scheduleMorseText('é', timing).events).toHaveLength(5);
    expect(scheduleMorseText('###', timing)).toEqual({
      events: [],
      durationSeconds: 0,
      marks: [],
      skipped: 3,
    });
    expect(scheduleMorseText('', timing).events).toEqual([]);
    expect(() => scheduleMorseText('CQ 🙂 DE', timing)).not.toThrow();
    expect(scheduleMorseText('CQ 🙂 DE', timing).skipped).toBeGreaterThan(0);
    expect(scheduleMorseText('hi', timing).marks).toHaveLength(2);
    expect(scheduleMorseText('A, B', timing).marks).toHaveLength(3);
  });

  it('drops unstarted tones and cuts the sounding tone when cancelled', () => {
    const schedule = scheduleMorseText('HI', timing);
    const second = schedule.marks[1];

    if (!second) {
      throw new Error('expected I');
    }

    const cancelled = cancelMorseSchedule(schedule, second.startSeconds);

    expect(cancelled.marks).toHaveLength(1);
    expect(cancelled.events).toHaveLength(4);
    expect(cancelled.events.every((event) => event.startSeconds + event.durationSeconds <= second.startSeconds + 1e-9)).toBe(true);

    const midDit = (schedule.events[0]?.durationSeconds ?? 0) / 2;
    const cut = cancelMorseSchedule(schedule, midDit);

    expect(cut.events).toHaveLength(1);
    expect(cut.events[0]?.durationSeconds).toBeCloseTo(midDit, 10);
    expect(cut.durationSeconds).toBeCloseTo(midDit, 10);

    expect(cancelMorseSchedule(schedule, 0)).toEqual({
      events: [],
      durationSeconds: 0,
      marks: [],
      skipped: 0,
    });

    const paragraph = scheduleMorseText('A\n\nB', timing);
    const duringGap = (paragraph.marks[0]?.endSeconds ?? 0) + timing.wordSeconds;
    const kept = cancelMorseSchedule(paragraph, duringGap);

    expect(kept.marks).toHaveLength(1);
    expect(kept.events).toHaveLength(paragraph.events.length - 4);
    expect(kept.durationSeconds).toBeLessThan(duringGap);
  });

  it('changes pasted-text timing when the overall and character speeds change', () => {
    const text = 'AB CD';
    const slow = scheduleMorseText(text, morseTiming(5, 18));
    const quickCharacters = scheduleMorseText(text, morseTiming(5, 30));
    const quickerOverall = scheduleMorseText(text, morseTiming(15, 30));

    function wordGap(schedule: ReturnType<typeof scheduleMorseText>): number {
      const before = schedule.marks[1];
      const after = schedule.marks[2];

      if (!before || !after) {
        throw new Error('expected a word gap');
      }

      return after.startSeconds - before.endSeconds;
    }

    expect(slow.events[0]?.durationSeconds).toBeCloseTo(1.2 / 18, 10);
    expect(quickCharacters.events[0]?.durationSeconds).toBeCloseTo(1.2 / 30, 10);
    expect(quickCharacters.durationSeconds).toBeLessThan(slow.durationSeconds);
    expect(wordGap(slow)).toBeCloseTo(morseTiming(5, 18).wordSeconds, 8);
    expect(wordGap(quickCharacters)).toBeCloseTo(morseTiming(5, 30).wordSeconds, 8);
    expect(wordGap(quickerOverall)).toBeCloseTo(morseTiming(15, 30).wordSeconds, 8);
    expect(wordGap(quickerOverall)).toBeLessThan(wordGap(quickCharacters));
    expect(quickerOverall.events[0]?.durationSeconds).toBeCloseTo(1.2 / 30, 10);

    const resumed = scheduleMorseTextFromIndex(text, morseTiming(15, 30), quickerOverall.marks[2]?.index ?? 0);
    const resumedAtSlow = scheduleMorseTextFromIndex(text, morseTiming(5, 18), slow.marks[2]?.index ?? 0);

    expect(resumed.marks[0]?.index).toBe(quickerOverall.marks[2]?.index);
    expect(resumed.events[0]?.durationSeconds).toBeCloseTo(3 * (1.2 / 30), 10);
    expect(resumedAtSlow.events[0]?.durationSeconds).toBeCloseTo(3 * (1.2 / 18), 10);
    expect(resumed.durationSeconds).toBeLessThan(quickerOverall.durationSeconds);
    expect(resumed.durationSeconds).toBeLessThan(scheduleMorseTextFromIndex(text, morseTiming(5, 18), slow.marks[2]?.index ?? 0).durationSeconds);
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
