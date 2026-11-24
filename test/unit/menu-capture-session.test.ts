import { describe, expect, it } from 'vitest';
import {
  removeLastMenuCaptureSessionStep,
  removeMenuCaptureSessionStepFrom,
  type MenuCaptureSessionState,
} from '../../app/utils/menu-capture.ts';

function session(steps: MenuCaptureSessionState['steps']): MenuCaptureSessionState {
  return {
    sessionId: 'session',
    savedRadioId: 'radio-1',
    createdAt: '2026-11-24T00:00:00.000Z',
    updatedAt: '2026-11-24T00:00:00.000Z',
    baselineReadAt: '2026-11-24T00:00:00.000Z',
    baselineSha256: 'baseline',
    baselineByteLength: 100,
    steps,
  };
}

const step = (index: number): MenuCaptureSessionState['steps'][number] => ({
  index,
  readAt: `2026-11-24T0${index}:00:00.000Z`,
  comparedTo: index === 1 ? { kind: 'baseline' } : { kind: 'step', stepIndex: index - 1 },
  menu: { number: 100 + index, name: `Menu ${index}`, nameSource: 'operator' },
  change: { from: 'A', to: 'B' },
  flags: [],
  diff: { byteCount: 1, runCount: 1, ignoredByteCount: 0, runs: [] },
  imageFileName: `step-${String(index).padStart(3, '0')}.img`,
  imageSha256: `step-${index}`,
  imageByteLength: 100,
});

describe('menu capture session helpers', () => {
  it('drops only the last step on redo', () => {
    const next = removeLastMenuCaptureSessionStep(session([step(1), step(2), step(3)]));

    expect(next.steps.map((entry) => entry.index)).toEqual([1, 2]);
    expect(next.baselineSha256).toBe('baseline');
    expect(next.baselineByteLength).toBe(100);
  });

  it('drops a step and every later step when redoing from the middle', () => {
    const next = removeMenuCaptureSessionStepFrom(session([step(1), step(2), step(3)]), 2);

    expect(next.steps.map((entry) => entry.index)).toEqual([1]);
  });
});