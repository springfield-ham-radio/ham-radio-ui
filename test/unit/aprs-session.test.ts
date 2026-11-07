import { describe, expect, it } from 'vitest';
import { createAprsReceiveSession, nextAprsPortHolds, type AprsBytePort } from '../../app/utils/aprs-session.ts';
import { aprsSerialOpenOptions } from '../../app/utils/aprs-serial-options.ts';

class FakeAprsPort implements AprsBytePort {
  isOpen = true;
  closed = false;
  readonly writes: Uint8Array[] = [];
  private dataListener: ((chunk: Uint8Array) => void) | undefined;
  private errorListener: ((error: Error) => void) | undefined;

  on(event: 'data' | 'error', handler: (payload: Uint8Array | Error) => void): void {
    if (event === 'data') {
      this.dataListener = handler as (chunk: Uint8Array) => void;
      return;
    }

    this.errorListener = handler as (error: Error) => void;
  }

  off(event: 'data' | 'error'): void {
    if (event === 'data') {
      this.dataListener = undefined;
      return;
    }

    this.errorListener = undefined;
  }

  push(text: string): void {
    this.dataListener?.(Uint8Array.from(text, (char) => char.charCodeAt(0)));
  }

  fail(message: string): void {
    this.errorListener?.(new Error(message));
  }

  write(bytes: Uint8Array): void {
    this.writes.push(bytes);
  }

  close(): void {
    this.closed = true;
    this.isOpen = false;
  }
}

function clock(): { now: () => string; advance: () => void } {
  let seconds = 0;

  return {
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString(),
    advance: () => {
      seconds += 1;
    },
  };
}

describe('APRS receive session', () => {
  it('opens without writing, decodes a split line, and ignores bytes after disconnect', async () => {
    const time = clock();
    const session = createAprsReceiveSession(time.now);
    const port = new FakeAprsPort();

    await session.connect('/dev/cu.aprs', async () => port);
    port.push('N0CALL>APRS:!4903.');
    time.advance();
    port.push('50N/07201.75W-Test\r');

    expect(session.snapshot().connected).toBe(true);
    expect(session.snapshot().stations[0]?.position?.value.label).toContain('49° 03.50′ N');
    expect(port.writes).toEqual([]);

    await session.disconnect();
    port.push('N0CALL>APRS:!3600.00N/07200.00W-\r');

    expect(port.closed).toBe(true);
    expect(session.snapshot().connected).toBe(false);
    expect(session.snapshot().stations[0]?.position?.value.label).toContain('49° 03.50′ N');
    expect(session.snapshot().log).toHaveLength(1);
  });

  it('keeps a malformed line in the log', async () => {
    const session = createAprsReceiveSession(() => '2026-01-01T00:00:00.000Z');
    const port = new FakeAprsPort();

    await session.connect('/dev/cu.aprs', async () => port);
    port.push('??? not aprs\n');

    expect(session.snapshot().stations).toEqual([]);
    expect(session.snapshot().log[0]?.text).toBe('??? not aprs');
    expect(session.snapshot().log[0]?.disposition).toBe('unparsed');
    await session.disconnect();
  });

  it('reports an open failure and closes a port that lost the race', async () => {
    const session = createAprsReceiveSession();

    await session.connect('/dev/missing', async () => {
      throw new Error('adapter missing');
    });

    expect(session.snapshot().connected).toBe(false);
    expect(session.snapshot().error).toBe('adapter missing');

    const late = new FakeAprsPort();
    let release: ((port: FakeAprsPort) => void) | undefined;
    let opened: (() => void) | undefined;
    const opening = new Promise<void>((resolve) => {
      opened = resolve;
    });
    const connecting = session.connect('/dev/late', () => {
      opened?.();
      return new Promise<AprsBytePort>((resolve) => {
        release = resolve;
      });
    });

    await opening;
    await session.disconnect();
    release?.(late);
    await connecting;

    expect(late.closed).toBe(true);
    expect(session.snapshot().connected).toBe(false);
  });

  it('closes after a port error and can clear the log without writing', async () => {
    const session = createAprsReceiveSession();
    const port = new FakeAprsPort();

    await session.connect('/dev/cu.aprs', async () => port);
    port.push('N0CALL>APRS:>status\r');
    port.fail('unplugged');
    await Promise.resolve();
    await Promise.resolve();

    expect(port.closed).toBe(true);
    expect(session.snapshot().error).toBe('unplugged');
    expect(session.snapshot().log).toHaveLength(1);

    session.clear();

    expect(session.snapshot().log).toEqual([]);
    expect(port.writes).toEqual([]);
  });

  it('deasserts RTS and DTR in the COM-port open options', () => {
    expect(aprsSerialOpenOptions('/dev/cu.aprs', 9600)).toEqual({
      path: '/dev/cu.aprs',
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      rtscts: false,
      flowControl: 'none',
      rts: false,
      dtr: false,
    });
    expect(() => aprsSerialOpenOptions('/dev/cu.aprs', 4800)).toThrow(/9600/);
  });

  it('replaces only the card that disconnected', () => {
    expect(nextAprsPortHolds({ card: '/dev/a', other: '/dev/b' }, 'card', undefined)).toEqual({ other: '/dev/b' });
    expect(nextAprsPortHolds({ other: '/dev/b' }, 'card', '/dev/a')).toEqual({ other: '/dev/b', card: '/dev/a' });
  });
});
