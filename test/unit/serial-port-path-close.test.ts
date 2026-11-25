import { describe, expect, it } from 'vitest';
import {
  resetSerialPathCloseTracking,
  trackSerialPathClose,
  waitForSerialPathClose,
} from '../../app/utils/serial-port-path-close.ts';

describe('serial-port-path-close', () => {
  it('waits until every tracked close on the same path has settled', async () => {
    resetSerialPathCloseTracking();
    const path = '/dev/cu.test';

    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });

    trackSerialPathClose(path, first);
    trackSerialPathClose(path, second);

    const waiter = waitForSerialPathClose(path);
    resolveSecond();

    let settled = false;
    void waiter.then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);

    resolveFirst();
    await waiter;
    expect(settled).toBe(true);
  });

  it('continues the chain when an earlier close rejects', async () => {
    resetSerialPathCloseTracking();
    const path = '/dev/cu.reject';

    trackSerialPathClose(path, Promise.reject(new Error('close failed')));

    let resolveSecond!: () => void;
    const second = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });
    trackSerialPathClose(path, second);

    const waiter = waitForSerialPathClose(path);
    resolveSecond();
    await expect(waiter).resolves.toBeUndefined();
  });
});