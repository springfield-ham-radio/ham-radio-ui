/**
 * Web Audio playback for Morse. The context is created on the first play,
 * which must be a user gesture. Nothing here starts a tone by itself.
 */

import { schedulePattern, type MorseTiming } from './morse-code';

export interface MorseOscillator {
  frequency: { value: number };
  connect(node: unknown): void;
  start(when: number): void;
  stop(when?: number): void;
  disconnect(): void;
}

export interface MorseGain {
  gain: {
    value: number;
    cancelScheduledValues(when: number): void;
    setValueAtTime(value: number, when: number): void;
  };
  connect(node: unknown): void;
  disconnect(): void;
}

export interface MorseAudioContext {
  currentTime: number;
  state: 'suspended' | 'running' | 'closed' | string;
  destination: unknown;
  createOscillator(): MorseOscillator;
  createGain(): MorseGain;
  resume(): Promise<void>;
  close(): Promise<void>;
}

export type MorseAudioFactory = () => MorseAudioContext | null;

export interface MorsePlayOptions {
  timing: MorseTiming;
  frequencyHz: number;
  /** 0–1. The caller picks a modest default. */
  volume: number;
  onEnded?: () => void;
}

export interface MorsePlayResult {
  ok: boolean;
  reason?: 'unsupported' | 'suspended' | 'empty';
}

export interface MorsePlayer {
  playPattern(pattern: string, options: MorsePlayOptions): Promise<MorsePlayResult>;
  stop(): void;
  close(): Promise<void>;
  readonly opened: boolean;
}

interface ActiveTone {
  oscillator: MorseOscillator;
  gain: MorseGain;
}

export function createMorsePlayer(factory: MorseAudioFactory): MorsePlayer {
  let context: MorseAudioContext | null = null;
  let active: ActiveTone[] = [];
  let generation = 0;
  let finishTimer: ReturnType<typeof setTimeout> | undefined;
  let ended: (() => void) | undefined;

  function cancelFinish(notify: boolean): void {
    if (finishTimer !== undefined) {
      clearTimeout(finishTimer);
      finishTimer = undefined;
    }

    const callback = ended;
    ended = undefined;

    if (notify) {
      callback?.();
    }
  }

  function stopTones(): void {
    const now = context?.currentTime ?? 0;

    for (const tone of active) {
      try {
        tone.gain.gain.cancelScheduledValues(now);
        tone.gain.gain.setValueAtTime(0, now);
        tone.oscillator.stop(now);
        tone.oscillator.disconnect();
        tone.gain.disconnect();
      } catch {
        // Already stopped.
      }
    }

    active = [];
  }

  return {
    get opened() {
      return context !== null;
    },
    async playPattern(pattern, options) {
      if (!pattern) {
        return { ok: false, reason: 'empty' };
      }

      const seen = generation;

      if (!context || context.state === 'closed') {
        try {
          context = factory();
        } catch {
          context = null;
        }
      }

      if (!context) {
        return { ok: false, reason: 'unsupported' };
      }

      if (context.state === 'suspended') {
        try {
          await context.resume();
        } catch {
          return { ok: false, reason: 'suspended' };
        }
      }

      if (seen !== generation) {
        return { ok: false };
      }

      if (context.state !== 'running') {
        return { ok: false, reason: 'suspended' };
      }

      generation += 1;
      const playGeneration = generation;
      cancelFinish(false);
      stopTones();

      const events = schedulePattern(pattern, options.timing);
      const volume = Math.min(1, Math.max(0, options.volume));
      const start = context.currentTime + 0.05;
      ended = options.onEnded;

      for (const event of events) {
        const gain = context.createGain();
        const oscillator = context.createOscillator();
        const toneStart = start + event.startSeconds;
        const toneEnd = toneStart + event.durationSeconds;

        gain.gain.setValueAtTime(0, toneStart);
        gain.gain.setValueAtTime(volume, toneStart + Math.min(0.005, event.durationSeconds / 4));
        gain.gain.setValueAtTime(0, toneEnd);
        oscillator.frequency.value = options.frequencyHz;
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(toneStart);
        oscillator.stop(toneEnd);
        active.push({ oscillator, gain });
      }

      const last = events[events.length - 1];
      const finishMs = ((last?.startSeconds ?? 0) + (last?.durationSeconds ?? 0) + 0.08) * 1000;

      finishTimer = setTimeout(() => {
        if (generation === playGeneration) {
          active = [];
        }

        cancelFinish(true);
      }, finishMs);

      return { ok: true };
    },
    stop() {
      generation += 1;
      cancelFinish(true);
      stopTones();
    },
    async close() {
      generation += 1;
      cancelFinish(false);
      stopTones();

      if (context && context.state !== 'closed') {
        await context.close();
      }

      context = null;
    },
  };
}

export function browserMorseAudioFactory(): MorseAudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const host = window as Window & { webkitAudioContext?: typeof AudioContext };
  const Ctor = window.AudioContext ?? host.webkitAudioContext;

  if (!Ctor) {
    return null;
  }

  try {
    return new Ctor();
  } catch {
    return null;
  }
}
