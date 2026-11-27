import { describe, expect, it } from 'vitest';
import type { RadioMemoryConfig } from '@springfield/ham-radio-api';
import {
  buildMenuCaptureRestoreRecord,
  patchMenuCaptureSessionRestore,
} from '../../app/utils/menu-capture-restore.ts';
import type { MenuCaptureSessionState } from '../../app/utils/menu-capture.ts';

const sparseMemoryConfig = {
  chunkSize: 256,
  addressSize: 2,
  addressEndianness: 'big',
  segments: {},
} as RadioMemoryConfig;

describe('buildMenuCaptureRestoreRecord', () => {
  it('classifies a programming-mode read timeout as read-failed', () => {
    const baseline = new Uint8Array(10);
    const record = buildMenuCaptureRestoreRecord({
      writtenAt: '2026-11-27T00:00:00.000Z',
      readError: 'Timeout waiting for response: Enter programming mode',
      baseline,
      ignore: [],
    });

    expect(record.status).toBe('read-failed');
    expect(record.readError).toContain('Enter programming mode');
    expect(record).not.toHaveProperty('matchesBaseline');
  });

  it('classifies ignore-only differences as verified', () => {
    const baseline = new Uint8Array(0x0390);
    const verify = baseline.slice();
    verify[0x038c] = 0x44;

    const record = buildMenuCaptureRestoreRecord({
      writtenAt: '2026-11-27T00:00:00.000Z',
      verifyImage: verify,
      baseline,
      ignore: [{ address: '0x038C', length: 1 }],
      memoryConfig: sparseMemoryConfig,
    });

    expect(record.status).toBe('verified');
    expect(record.matchesBaseline).toBe(true);
  });

  it('classifies a real byte difference outside capture.ignore as mismatch', () => {
    const baseline = new Uint8Array(0x0390);
    const verify = baseline.slice();
    verify[0x038c] = 0x44;
    verify[0x0010] = 0x01;

    const record = buildMenuCaptureRestoreRecord({
      writtenAt: '2026-11-27T00:00:00.000Z',
      verifyImage: verify,
      baseline,
      ignore: [{ address: '0x038C', length: 1 }],
      memoryConfig: sparseMemoryConfig,
    });

    expect(record.status).toBe('mismatch');
    expect(record.matchesBaseline).toBe(false);
  });

  it('patchMenuCaptureSessionRestore keeps export completion while updating restore', () => {
    const session: MenuCaptureSessionState = {
      sessionId: 's',
      savedRadioId: 'r',
      createdAt: '2026-11-24T00:00:00.000Z',
      updatedAt: '2026-11-24T01:00:00.000Z',
      baselineReadAt: '2026-11-24T00:30:00.000Z',
      baselineSha256: 'abc',
      baselineByteLength: 100,
      steps: [],
      completedAt: '2026-11-27T01:00:00.000Z',
      export: { savedAt: '2026-11-27T01:00:00.000Z', path: '/tmp/foo.hmenucap' },
    };

    const next = patchMenuCaptureSessionRestore(session, {
      writtenAt: '2026-11-27T00:00:00.000Z',
      status: 'read-failed',
      readError: 'timeout',
    });

    expect(next.completedAt).toBe(session.completedAt);
    expect(next.export?.path).toBe('/tmp/foo.hmenucap');
    expect(next.restore?.status).toBe('read-failed');
  });

  it('records write-failed without matchesBaseline', () => {
    const record = buildMenuCaptureRestoreRecord({
      writtenAt: '2026-11-27T00:00:00.000Z',
      writeFailed: true,
      baseline: new Uint8Array(4),
      ignore: [],
    });

    expect(record.status).toBe('write-failed');
    expect(record).not.toHaveProperty('matchesBaseline');
  });
});