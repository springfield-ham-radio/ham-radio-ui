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
  snapshot(): CatSerialLogSnapshot;
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
 */
export function createCatSerialLog(startedAt = Date.now()): CatSerialLog {
  const startTime = new Date(startedAt).toISOString();
  const entries: CatSerialLogEntry[] = [];

  return {
    append(direction: 'SEND' | 'RECV', data: Uint8Array): void {
      if (data.length === 0) {
        return;
      }

      const bytes = Array.from(data);
      const elapsedMs = Date.now() - startedAt;
      entries.push({
        timestamp: formatElapsed(elapsedMs),
        elapsedMs,
        direction,
        data: bytes,
        description: asciiPreviewFromBytes(bytes),
      });
    },
    snapshot(): CatSerialLogSnapshot {
      return {
        metadata: {
          startTime,
          endTime: new Date().toISOString(),
          totalEntries: entries.length,
          version: '1.0.0',
        },
        entries: entries.map((entry) => ({ ...entry, data: [...entry.data] })),
      };
    },
  };
}
