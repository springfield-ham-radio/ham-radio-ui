import { markRaw } from 'vue';
import {
  DirectionCoalesceBuffer,
  SERIAL_DIRECTION_COALESCE_IDLE_MS,
  armCoalesceIdleTimer,
  clearCoalesceIdleTimer,
  type CoalesceIdleTimer,
} from '~/utils/serial-direction-coalesce';

export interface CatSerialLogEntry {
  timestamp: string;
  elapsedMs: number;
  direction: 'SEND' | 'RECV';
  data: number[];
  description?: string;
}

export interface CatSerialLogSnapshot {
  metadata: {
    startTime: string;
    endTime?: string;
    totalEntries: number;
    version: string;
  };
  entries: CatSerialLogEntry[];
}

export interface CatSerialLog {
  append(direction: 'SEND' | 'RECV', data: Uint8Array): void;
  snapshot(options?: { commitPending?: boolean }): CatSerialLogSnapshot;
  /** Commit the open direction group and clear idle timers (e.g. on disconnect). */
  finalize(): void;
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
  clear(): void;
}

export interface CreateCatSerialLogOptions {
  /** Invoked after a coalesced entry is committed (not on every byte). */
  onFlushed?: () => void;
  coalesceIdleMs?: number;
}

/**
 * Render CAT bytes as printable ASCII, with CR/LF as escape sequences.
 */
export function asciiPreviewFromBytes(data: number[]): string {
  return data
    .map((byte) => {
      if (byte === 0x0d) {
        return '\\r';
      }

      if (byte === 0x0a) {
        return '\\n';
      }

      if (byte >= 0x20 && byte <= 0x7e) {
        return String.fromCharCode(byte);
      }

      return '.';
    })
    .join('');
}

function formatElapsed(elapsedMs: number): string {
  const clamped = Math.max(0, elapsedMs);
  const seconds = Math.floor(clamped / 1000);
  const milliseconds = clamped % 1000;
  return `${seconds.toString().padStart(3, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

/**
 * In-memory CAT serial log in the same SEND/RECV shape as driver import logs.
 *
 * Capture can be paused so a live CAT session does not grow without bound.
 */
export function createCatSerialLog(
  startedAt = Date.now(),
  options?: CreateCatSerialLogOptions,
): CatSerialLog {
  const startTime = new Date(startedAt).toISOString();
  const entries: CatSerialLogEntry[] = [];
  let enabled = true;
  const idleMs = options?.coalesceIdleMs ?? SERIAL_DIRECTION_COALESCE_IDLE_MS;
  const coalesce = new DirectionCoalesceBuffer(idleMs);
  const idleTimer: CoalesceIdleTimer = { current: undefined };

  function pushEntry(direction: 'SEND' | 'RECV', data: Uint8Array, entryStartedAt: number): void {
    const bytes = Array.from(data);
    const elapsedMs = entryStartedAt - startedAt;
    entries.push({
      timestamp: formatElapsed(elapsedMs),
      elapsedMs,
      direction,
      data: bytes,
      description: asciiPreviewFromBytes(bytes),
    });
    options?.onFlushed?.();
  }

  function commitOpenGroup(): void {
    const pending = coalesce.flushPending();
    if (pending) {
      pushEntry(pending.direction, pending.data, pending.startedAtMs);
    }
  }

  function scheduleIdleCommit(): void {
    if (!coalesce.peekPending()) {
      clearCoalesceIdleTimer(idleTimer);
      return;
    }

    armCoalesceIdleTimer(idleMs, () => {
      if (!enabled) {
        return;
      }

      commitOpenGroup();
    }, idleTimer);
  }

  return {
    append(direction: 'SEND' | 'RECV', data: Uint8Array): void {
      if (!enabled || data.length === 0) {
        return;
      }

      const flushed = coalesce.append(direction, data);
      for (const chunk of flushed) {
        clearCoalesceIdleTimer(idleTimer);
        pushEntry(chunk.direction, chunk.data, chunk.startedAtMs);
      }

      scheduleIdleCommit();
    },
    snapshot(options?: { commitPending?: boolean }): CatSerialLogSnapshot {
      if (options?.commitPending !== false) {
        clearCoalesceIdleTimer(idleTimer);
        commitOpenGroup();
      }

      return markRaw({
        metadata: {
          startTime,
          endTime: new Date().toISOString(),
          totalEntries: entries.length,
          version: '1.0.0',
        },
        entries: entries.map((entry) => ({ ...entry, data: [...entry.data] })),
      });
    },
    finalize(): void {
      clearCoalesceIdleTimer(idleTimer);
      commitOpenGroup();
    },
    setEnabled(nextEnabled: boolean): void {
      enabled = nextEnabled;
      if (!enabled) {
        clearCoalesceIdleTimer(idleTimer);
      }
    },
    isEnabled(): boolean {
      return enabled;
    },
    clear(): void {
      clearCoalesceIdleTimer(idleTimer);
      entries.length = 0;
      coalesce.clear();
    },
  };
}