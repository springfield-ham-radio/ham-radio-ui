import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  menuCaptureSessionShouldResume,
  type MenuCaptureSessionState,
} from '../../app/utils/menu-capture.ts';

function minimalSession(overrides: Partial<MenuCaptureSessionState> = {}): MenuCaptureSessionState {
  return {
    schemaVersion: 1,
    savedRadioId: 'radio-1',
    createdAt: '2026-11-24T00:00:00.000Z',
    updatedAt: '2026-11-24T01:00:00.000Z',
    baselineReadAt: '2026-11-24T00:30:00.000Z',
    baselineSha256: 'abc',
    baselineByteLength: 100,
    steps: [],
    ...overrides,
  };
}

describe('menu capture completed session handling', () => {
  it('does not resume sessions that already have completedAt', () => {
    expect(menuCaptureSessionShouldResume(minimalSession())).toBe(true);
    expect(
      menuCaptureSessionShouldResume(
        minimalSession({
          completedAt: '2026-11-24T02:00:00.000Z',
          export: { savedAt: '2026-11-24T02:00:00.000Z', path: '/Downloads/foo.hmenucap' },
        }),
      ),
    ).toBe(false);
  });

  it('Done discards the on-disk session after export', () => {
    const wizard = readFileSync(new URL('../../app/components/RadioMenuCapture.vue', import.meta.url), 'utf8');

    expect(wizard).toContain('async function onDone');
    expect(wizard).toContain('await discardSession()');
    expect(wizard).toMatch(/onDone[\s\S]*exportSavedPath\.value = undefined/);
    expect(wizard).toMatch(/onDone[\s\S]*phase\.value = 'intro'/);
    expect(wizard).not.toMatch(/function onDone[\s\S]*releasePortHold\(\)/);
  });

  it('load drops completed sessions from app data instead of reopening Export', () => {
    const useMenuCapture = readFileSync(new URL('../../app/composables/useMenuCapture.ts', import.meta.url), 'utf8');

    expect(useMenuCapture).toContain('menuCaptureSessionShouldResume');
    expect(useMenuCapture).toContain('discardMenuCaptureSession(savedRadioId)');
    expect(useMenuCapture).toMatch(
      /if \(!menuCaptureSessionShouldResume\(stored\)\) \{[\s\S]*discardMenuCaptureSession/,
    );
  });
});