import { describe, expect, it } from 'vitest';
import { DirectionCoalesceBuffer } from '../../app/utils/serial-direction-coalesce.ts';

describe('DirectionCoalesceBuffer', () => {
  it('merges same-direction bytes until the direction changes', () => {
    let clock = 1000;
    const buffer = new DirectionCoalesceBuffer(20, () => clock);

    expect(buffer.append('RECV', Uint8Array.of(0x41))).toEqual([]);
    expect(buffer.append('RECV', Uint8Array.of(0x42))).toEqual([]);

    const flushed = buffer.append('SEND', Uint8Array.of(0x0d));
    expect(flushed).toHaveLength(1);
    expect(flushed[0]).toMatchObject({
      direction: 'RECV',
      data: Uint8Array.of(0x41, 0x42),
      startedAtMs: 1000,
    });
  });

  it('peeks without flushing', () => {
    const buffer = new DirectionCoalesceBuffer(20);
    buffer.append('RECV', Uint8Array.of(1, 2));
    expect(buffer.peekPending()?.data).toEqual(Uint8Array.of(1, 2));
    expect(buffer.flushPending()?.data).toEqual(Uint8Array.of(1, 2));
    expect(buffer.peekPending()).toBeUndefined();
  });

  it('flushes after an idle gap on the next append', () => {
    let clock = 0;
    const buffer = new DirectionCoalesceBuffer(10, () => clock);

    expect(buffer.append('SEND', Uint8Array.of(1))).toEqual([]);
    clock = 25;

    const flushed = buffer.append('SEND', Uint8Array.of(2));
    expect(flushed).toHaveLength(1);
    expect(flushed[0]?.data).toEqual(Uint8Array.of(1));
    expect(buffer.flushPending()?.data).toEqual(Uint8Array.of(2));
  });
});