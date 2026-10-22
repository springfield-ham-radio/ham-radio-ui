import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatSerialPortOpenError,
  isPortMissingError,
  resetSerialPortReconnectHooks,
  setSerialPortReconnectHooks,
  waitForSerialPortPathAvailable,
} from '../../app/utils/serial-port-reconnect.ts';

describe('formatSerialPortOpenError', () => {
  it('names the missing port and suggests reconnecting the radio', () => {
    const error = formatSerialPortOpenError('/dev/cu.usbmodem31101', new Error('No such file or directory'));

    expect(error.message).toContain('/dev/cu.usbmodem31101');
    expect(error.message).toContain('Reconnect the programming cable');
    expect(error.message).toContain('No such file or directory');
  });
});

describe('isPortMissingError', () => {
  it('recognizes common missing-port messages', () => {
    expect(isPortMissingError(new Error('No such file or directory'))).toBe(true);
    expect(isPortMissingError(new Error('ENOENT opening /dev/cu.test'))).toBe(true);
    expect(isPortMissingError(new Error('Port is not open'))).toBe(false);
  });
});

describe('waitForSerialPortPathAvailable', () => {
  afterEach(() => {
    resetSerialPortReconnectHooks();
    vi.useRealTimers();
  });

  it('waits until the port reappears in the list', async () => {
    vi.useFakeTimers();
    const listed: string[][] = [['/dev/cu.other'], ['/dev/cu.other'], ['/dev/cu.usbmodem31101']];
    const listPorts = vi.fn(async () => listed.shift() ?? ['/dev/cu.usbmodem31101']);
    const waiting: boolean[] = [];
    setSerialPortReconnectHooks({
      onWaiting: (active) => waiting.push(active),
    });

    const promise = waitForSerialPortPathAvailable('/dev/cu.usbmodem31101', {
      pollIntervalMs: 250,
      timeoutMs: 2000,
      listPorts,
      sleep: (ms) => vi.advanceTimersByTimeAsync(ms),
    });

    await vi.runAllTimersAsync();
    await promise;

    expect(listPorts.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(waiting).toEqual([true, false]);
  });

  it('stops when the transfer is canceled', async () => {
    vi.useFakeTimers();
    let canceled = false;
    setSerialPortReconnectHooks({
      shouldAbort: () => canceled,
    });

    const promise = waitForSerialPortPathAvailable('/dev/cu.usbmodem31101', {
      pollIntervalMs: 100,
      timeoutMs: 5000,
      listPorts: async () => [],
      sleep: (ms) => vi.advanceTimersByTimeAsync(ms),
    });

    canceled = true;
    await vi.advanceTimersByTimeAsync(0);

    await expect(promise).rejects.toThrow(/canceled/i);
  });
});
