import { describe, expect, it } from 'vitest';
import { menuCaptureSessionNeedsPortHold, type MenuCaptureSessionState } from '../../app/utils/menu-capture.ts';

function baseSession(overrides: Partial<MenuCaptureSessionState> = {}): MenuCaptureSessionState {
  return {
    sessionId: 's',
    savedRadioId: 'r',
    createdAt: '2026-11-24T00:00:00.000Z',
    updatedAt: '2026-11-24T00:00:00.000Z',
    baselineReadAt: '2026-11-24T00:00:00.000Z',
    baselineSha256: 'a',
    baselineByteLength: 1,
    serialPort: '/dev/ttyUSB0',
    steps: [],
    ...overrides,
  };
}

describe('menu capture session port hold', () => {
  it('holds the port only while capture is in progress', () => {
    expect(menuCaptureSessionNeedsPortHold(baseSession())).toBe(true);
    expect(menuCaptureSessionNeedsPortHold(baseSession({ completedAt: '2026-11-24T01:00:00.000Z' }))).toBe(false);
    expect(
      menuCaptureSessionNeedsPortHold(
        baseSession({
          completedAt: '2026-11-24T01:00:00.000Z',
          export: { savedAt: '2026-11-24T01:00:00.000Z', path: '/tmp/x.hmenucap' },
        }),
      ),
    ).toBe(false);
  });
});