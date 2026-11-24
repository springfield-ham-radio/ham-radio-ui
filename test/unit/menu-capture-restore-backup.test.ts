import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MenuCaptureSessionState } from '../../app/utils/menu-capture.ts';
import {
  menuCapturePrewriteBackupStepImageFileName,
  menuCaptureUseStepImageForPrewriteBackup,
} from '../../app/utils/menu-capture-restore-backup.ts';

const stepFile = (index: number) => `step-${String(index).padStart(3, '0')}.img`;

const steps: MenuCaptureSessionState['steps'] = [
  {
    index: 1,
    readAt: '2026-11-24T00:00:00.000Z',
    comparedTo: { kind: 'baseline' },
    menu: { number: 181, name: 'LED Control', nameSource: 'map' },
    change: { from: '01', to: '03' },
    flags: [],
    diff: { byteCount: 1, runCount: 1, ignoredByteCount: 0, runs: [] },
    imageFileName: stepFile(1),
    imageSha256: 'a',
    imageByteLength: 10,
  },
  {
    index: 2,
    readAt: '2026-11-24T01:00:00.000Z',
    comparedTo: { kind: 'step', stepIndex: 1 },
    menu: { number: 200, name: 'Other', nameSource: 'operator' },
    change: { from: 'A', to: 'B' },
    flags: [],
    diff: { byteCount: 1, runCount: 1, ignoredByteCount: 0, runs: [] },
    imageFileName: stepFile(2),
    imageSha256: 'b',
    imageByteLength: 10,
  },
];

describe('menu capture restore prewrite backup', () => {
  it('uses the last kept step image file name', () => {
    expect(menuCapturePrewriteBackupStepImageFileName(undefined)).toBeUndefined();
    expect(menuCapturePrewriteBackupStepImageFileName([])).toBeUndefined();
    expect(menuCapturePrewriteBackupStepImageFileName(steps)).toBe(stepFile(2));
  });

  it('prefers step image over a fresh backup read when bytes are available', () => {
    expect(menuCaptureUseStepImageForPrewriteBackup([], new Uint8Array([1]))).toBe(false);
    expect(menuCaptureUseStepImageForPrewriteBackup(steps, undefined)).toBe(false);
    expect(menuCaptureUseStepImageForPrewriteBackup(steps, new Uint8Array())).toBe(false);
    expect(menuCaptureUseStepImageForPrewriteBackup(steps, new Uint8Array([0xaa]))).toBe(true);
  });

  it('wires restore to optional preRestoreBackupImage on the capture write helper', () => {
    const useRadio = readFileSync(new URL('../../app/composables/useRadio.ts', import.meta.url), 'utf8');
    const useMenuCapture = readFileSync(new URL('../../app/composables/useMenuCapture.ts', import.meta.url), 'utf8');

    expect(useRadio).toContain('preRestoreBackupImage');
    expect(useRadio).toContain('persistPrewriteBackupImage');
    expect(useMenuCapture).toContain('menuCaptureUseStepImageForPrewriteBackup');
    expect(useMenuCapture).toContain('loadMenuCaptureStepImage');
  });
});