import { describe, expect, it, vi } from 'vitest';
import { morseTiming, scheduleMorseText } from '../../app/utils/morse-code.ts';
import {
  createMorsePlayer,
  MORSE_TONE_LEAD_SECONDS,
  type MorseAudioContext,
  type MorseGain,
  type MorseOscillator,
} from '../../app/utils/morse-audio.ts';

class FakeOscillator implements MorseOscillator {
  frequency = { value: 0 };
  started: number[] = [];
  stopped: number[] = [];

  connect(): void {
    return undefined;
  }

  start(when: number): void {
    this.started.push(when);
  }

  stop(when?: number): void {
    this.stopped.push(when ?? -1);
  }

  disconnect(): void {
    return undefined;
  }
}

class FakeGain implements MorseGain {
  values: number[] = [];
  gain = {
    value: 0,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: (value: number): void => {
      this.values.push(value);
    },
  };

  connect(): void {
    return undefined;
  }

  disconnect(): void {
    return undefined;
  }
}

class FakeContext implements MorseAudioContext {
  currentTime = 1;
  state: MorseAudioContext['state'] = 'running';
  destination = {};
  oscillators: FakeOscillator[] = [];
  gains: FakeGain[] = [];
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });

  createOscillator(): MorseOscillator {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createGain(): MorseGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
}

const options = {
  timing: morseTiming(20),
  frequencyHz: 600,
  volume: 0.2,
};

describe('Morse audio player', () => {
  it('does not create a context or a tone until play', async () => {
    const context = new FakeContext();
    const factory = vi.fn(() => context);
    const player = createMorsePlayer(factory);

    expect(player.opened).toBe(false);
    expect(factory).not.toHaveBeenCalled();

    const result = await player.playPattern('.-', options);

    expect(result.ok).toBe(true);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(player.opened).toBe(true);
    expect(context.oscillators).toHaveLength(2);
    expect(context.oscillators[0]?.frequency.value).toBe(600);
    expect(context.oscillators[0]?.started[0]).toBeGreaterThan(context.currentTime);
    expect(Math.max(...context.gains[0].values)).toBeCloseTo(0.2);
  });

  it('plays a pasted schedule and stop silences every tone immediately', async () => {
    const context = new FakeContext();
    const player = createMorsePlayer(() => context);
    const schedule = scheduleMorseText('AB', morseTiming(5, 18));
    let ended = false;
    const result = await player.playEvents(schedule.events, {
      ...options,
      timing: morseTiming(5, 18),
      onEnded: () => {
        ended = true;
      },
    });

    expect(result).toEqual({ ok: true });
    expect(context.oscillators).toHaveLength(schedule.events.length);
    expect(context.oscillators[0]?.started[0]).toBeCloseTo(context.currentTime + MORSE_TONE_LEAD_SECONDS);

    player.stop();

    expect(ended).toBe(true);

    for (const oscillator of context.oscillators) {
      expect(oscillator.stopped.at(-1)).toBe(context.currentTime);
    }

    for (const gain of context.gains) {
      expect(gain.gain.cancelScheduledValues).toHaveBeenCalledWith(context.currentTime);
      expect(gain.values[gain.values.length - 1]).toBe(0);
    }
  });

  it('plays a faster pasted schedule with shorter tone spacing', async () => {
    const context = new FakeContext();
    const player = createMorsePlayer(() => context);
    const slow = scheduleMorseText('E E', morseTiming(5, 18));
    const fast = scheduleMorseText('E E', morseTiming(20, 40));
    const slowGap = (slow.marks[1]?.startSeconds ?? 0) - (slow.marks[0]?.startSeconds ?? 0);
    const fastGap = (fast.marks[1]?.startSeconds ?? 0) - (fast.marks[0]?.startSeconds ?? 0);

    expect(fast.events[0]?.durationSeconds).toBeCloseTo(1.2 / 40, 10);
    expect(slow.events[0]?.durationSeconds).toBeCloseTo(1.2 / 18, 10);
    expect(fastGap).toBeLessThan(slowGap);

    await player.playEvents(fast.events, {
      timing: morseTiming(20, 40),
      frequencyHz: 700,
      volume: 0.4,
    });

    const first = context.oscillators[0];
    const second = context.oscillators[1];

    expect((first?.stopped[0] ?? 0) - (first?.started[0] ?? 0)).toBeCloseTo(fast.events[0]?.durationSeconds ?? 0, 8);
    expect((second?.started[0] ?? 0) - (first?.started[0] ?? 0)).toBeCloseTo(fastGap, 8);
    expect(first?.frequency.value).toBe(700);
  });

  it('stops scheduled tones and closes the context', async () => {
    const context = new FakeContext();
    const player = createMorsePlayer(() => context);

    await player.playPattern('.', options);
    player.stop();

    expect(context.oscillators[0]?.stopped.length).toBeGreaterThan(0);

    await player.close();

    expect(context.close).toHaveBeenCalledOnce();
    expect(player.opened).toBe(false);
  });

  it('reports unsupported audio and a suspended context without starting a tone', async () => {
    const missing = createMorsePlayer(() => null);
    const unsupported = await missing.playPattern('.', options);

    expect(unsupported).toEqual({ ok: false, reason: 'unsupported' });
    expect(missing.opened).toBe(false);

    const stuck = new FakeContext();
    stuck.state = 'suspended';
    stuck.resume = vi.fn(async () => undefined);
    const player = createMorsePlayer(() => stuck);
    const suspended = await player.playPattern('.', options);

    expect(suspended).toEqual({ ok: false, reason: 'suspended' });
    expect(stuck.oscillators).toHaveLength(0);
    expect(stuck.resume).toHaveBeenCalledOnce();
  });

  it('resumes a suspended context on the play gesture', async () => {
    const context = new FakeContext();
    context.state = 'suspended';
    const player = createMorsePlayer(() => context);
    const result = await player.playPattern('.', options);

    expect(result.ok).toBe(true);
    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.oscillators).toHaveLength(1);
  });
});
