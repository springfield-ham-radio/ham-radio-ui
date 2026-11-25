/** Idle gap before a same-direction RX/SEND coalesce buffer is flushed (matches driver log batching). */
export const SERIAL_DIRECTION_COALESCE_IDLE_MS = 20;

type Direction = 'SEND' | 'RECV';

export interface DirectionCoalesceFlush {
  direction: Direction;
  data: Uint8Array;
  startedAtMs: number;
}

/**
 * Buffers same-direction bytes like the driver `SerialLogger`: flush on direction
 * change or when `idleMs` passes without another append.
 */
export class DirectionCoalesceBuffer {
  private direction: Direction | null = null;
  private buffer: number[] = [];
  private startedAtMs = 0;
  private lastAtMs = 0;

  constructor(
    private readonly idleMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  append(direction: Direction, data: Uint8Array): DirectionCoalesceFlush[] {
    if (data.length === 0) {
      return [];
    }

    const flushed: DirectionCoalesceFlush[] = [];
    const at = this.now();

    if (
      this.direction !== null
      && (this.direction !== direction || at - this.lastAtMs > this.idleMs)
    ) {
      flushed.push(this.takeFlush());
    }

    if (this.direction === null) {
      this.direction = direction;
      this.startedAtMs = at;
      this.buffer = [];
    }

    this.buffer.push(...data);
    this.lastAtMs = at;
    return flushed;
  }

  peekPending(): DirectionCoalesceFlush | undefined {
    if (this.direction === null || this.buffer.length === 0) {
      return undefined;
    }

    return {
      direction: this.direction,
      data: Uint8Array.from(this.buffer),
      startedAtMs: this.startedAtMs,
    };
  }

  flushPending(): DirectionCoalesceFlush | undefined {
    if (this.direction === null || this.buffer.length === 0) {
      return undefined;
    }

    return this.takeFlush();
  }

  clear(): void {
    this.direction = null;
    this.buffer = [];
    this.startedAtMs = 0;
    this.lastAtMs = 0;
  }

  private takeFlush(): DirectionCoalesceFlush {
    const direction = this.direction;
    if (direction === null || this.buffer.length === 0) {
      throw new Error('DirectionCoalesceBuffer.takeFlush called with nothing buffered');
    }

    const result: DirectionCoalesceFlush = {
      direction,
      data: Uint8Array.from(this.buffer),
      startedAtMs: this.startedAtMs,
    };
    this.direction = null;
    this.buffer = [];
    this.startedAtMs = 0;
    this.lastAtMs = 0;
    return result;
  }
}

export interface CoalesceIdleTimer {
  current: ReturnType<typeof setTimeout> | undefined;
}

export function armCoalesceIdleTimer(
  idleMs: number,
  onIdle: () => void,
  timer: CoalesceIdleTimer,
): void {
  if (timer.current !== undefined) {
    clearTimeout(timer.current);
  }

  timer.current = setTimeout(() => {
    timer.current = undefined;
    onIdle();
  }, idleMs);
}

export function clearCoalesceIdleTimer(timer: CoalesceIdleTimer): void {
  if (timer.current !== undefined) {
    clearTimeout(timer.current);
    timer.current = undefined;
  }
}