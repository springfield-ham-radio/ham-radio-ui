import { describe, expect, it, vi } from 'vitest';
import {
  MENU_CAPTURE_RESTORE_READ_DEADLINE_MS,
  retryMenuCaptureRestoreRead,
} from '../../app/utils/menu-capture-restore.ts';

describe('retryMenuCaptureRestoreRead', () => {
  it('succeeds on the second attempt after a transient timeout', async () => {
    const image = Uint8Array.from([1, 2, 3]);
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error('Timeout waiting for response: Enter programming mode'))
      .mockResolvedValueOnce(image);

    const result = await retryMenuCaptureRestoreRead(
      async () => read(),
      () => undefined,
      {
        deadlineMs: MENU_CAPTURE_RESTORE_READ_DEADLINE_MS,
        backoffMs: [1],
        now: () => 0,
        sleep: async () => undefined,
      },
    );

    expect(result).toEqual({ image });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('does not retry a completed mismatching image', async () => {
    const read = vi.fn(async () => Uint8Array.from([9]));

    const result = await retryMenuCaptureRestoreRead(read, () => undefined, {
      deadlineMs: 5_000,
      now: () => 0,
      sleep: async () => undefined,
    });

    expect(result).toEqual({ image: Uint8Array.from([9]) });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('returns the last error when the deadline elapses', async () => {
    let now = 0;
    const read = vi.fn(async () => {
      throw new Error('Timeout waiting for response: Enter programming mode');
    });

    const result = await retryMenuCaptureRestoreRead(read, () => undefined, {
      deadlineMs: 3_000,
      backoffMs: [1_000],
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
    });

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('Enter programming mode');
    }
    expect(read.mock.calls.length).toBeGreaterThan(1);
  });

  it('calls beforeFirstRead once before the first attempt', async () => {
    const before = vi.fn(async () => undefined);
    const read = vi.fn(async () => Uint8Array.from([1]));

    await retryMenuCaptureRestoreRead(read, () => undefined, {
      beforeFirstRead: before,
      now: () => 0,
      sleep: async () => undefined,
    });

    expect(before).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
  });
});