import { describe, expect, it } from 'vitest';
import { Q_SIGNALS, filterQSignals } from '../../app/utils/q-signals.ts';

describe('Q signals', () => {
  it('keeps a question and a statement for every group', () => {
    expect(Q_SIGNALS.length).toBeGreaterThan(15);

    for (const signal of Q_SIGNALS) {
      expect(signal.code).toMatch(/^Q[A-Z]{2}$/);
      expect(signal.question.endsWith('?')).toBe(true);
      expect(signal.statement.length).toBeGreaterThan(0);
    }

    expect(new Set(Q_SIGNALS.map((signal) => signal.code)).size).toBe(Q_SIGNALS.length);
    expect(Q_SIGNALS.some((signal) => signal.code === 'QST')).toBe(false);
  });

  it('does not treat the amateur QRP custom as the ITU answer', () => {
    const qrp = Q_SIGNALS.find((signal) => signal.code === 'QRP');

    expect(qrp?.statement).toBe('Decrease transmitter power.');
    expect(qrp?.operatingNote).toContain('low power');
    expect(filterQSignals('fading').map((signal) => signal.code)).toEqual(['QSB']);
  });
});
