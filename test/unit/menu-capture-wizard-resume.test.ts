import { describe, expect, it } from 'vitest';
import { menuCaptureWizardResumePhase, type MenuCaptureWizardPhase } from '../../app/utils/menu-capture-restore.ts';
import type { MenuCaptureSessionState } from '../../app/utils/menu-capture.ts';

function session(overrides: Partial<MenuCaptureSessionState> = {}): MenuCaptureSessionState {
  return {
    sessionId: 's',
    savedRadioId: 'r',
    createdAt: '2026-11-24T00:00:00.000Z',
    updatedAt: '2026-11-24T01:00:00.000Z',
    baselineReadAt: '2026-11-24T00:30:00.000Z',
    baselineSha256: 'abc',
    baselineByteLength: 100,
    steps: [],
    ...overrides,
  };
}

describe('menuCaptureWizardResumePhase', () => {
  const cases: Array<{ name: string; input: MenuCaptureSessionState; phase: MenuCaptureWizardPhase }> = [
    { name: 'no baseline', input: session({ baselineByteLength: 0, baselineSha256: '', baselineReadAt: '' }), phase: 'baseline' },
    { name: 'read-failed restore', input: session({ restore: { writtenAt: 't', status: 'read-failed', readError: 'timeout' } }), phase: 'restore' },
    { name: 'verified', input: session({ restore: { writtenAt: 't', status: 'verified', matchesBaseline: true } }), phase: 'export' },
    { name: 'captured steps', input: session({ steps: [{ index: 1 } as MenuCaptureSessionState['steps'][0]] }), phase: 'more' },
  ];

  for (const { name, input, phase } of cases) {
    it(`resumes to ${phase} when ${name}`, () => {
      expect(menuCaptureWizardResumePhase(input)).toBe(phase);
    });
  }
});