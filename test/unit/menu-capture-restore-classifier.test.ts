import { describe, expect, it } from 'vitest';
import type { RadioMemoryConfig } from '@springfield/ham-radio-api';
import { buildMenuCaptureRestoreRecord } from '../../app/utils/menu-capture-restore.ts';

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