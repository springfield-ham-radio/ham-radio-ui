import type { SnifferPacket, SnifferStatus } from '~/utils/sniffer-api';

export const SNIFFER_CAPTURE_FILE_KIND = 'springfield-ham-radio-sniffer-capture';
export const SNIFFER_CAPTURE_FILE_VERSION = 1;

/**
 * SerialLogger-compatible frame list used by driver comparison tools.
 *
 * Directions are SEND (computer→radio) and RECV (radio→computer), matching
 * ham-radio-driver serial logs so an agent can compare captures directly.
 */
export interface SnifferSerialLog {
  metadata: {
    startTime: string;
    endTime?: string;
    totalEntries: number;
    version: string;
  };
  entries: Array<{
    timestamp: string;
    elapsedMs: number;
    direction: 'SEND' | 'RECV';
    data: number[];
    description?: string;
  }>;
}

export interface SnifferCaptureDocument {
  kind: typeof SNIFFER_CAPTURE_FILE_KIND;
  version: typeof SNIFFER_CAPTURE_FILE_VERSION;
  computerPort?: string;
  radioPort?: string;
  baudRate?: number;
  startedAt?: string;
  savedAt: string;
  logFile?: string;
  /**
   * Coalesced live packets as shown in the UI (COMPUTER->RADIO / RADIO->COMPUTER).
   */
  packets: SnifferPacket[];
  /**
   * SerialLogger JSON used for driver verification. Prefer this over `packets`
   * when comparing against a ham-radio-ui serial log from import/write.
   */
  log?: SnifferSerialLog | unknown;
}

/**
 * Suggested file name for a saved sniffer capture.
 */
export function defaultSnifferCaptureFileName(timestamp = new Date()): string {
  const stamp = timestamp.toISOString().replace(/[:.]/g, '-');
  return `sniffer-capture-${stamp}.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Count SerialLogger entries, or fall back to coalesced packet count.
 */
export function snifferCaptureEntryCount(log: unknown, packets: SnifferPacket[]): number {
  if (isRecord(log) && Array.isArray(log.entries)) {
    return log.entries.length;
  }

  return packets.length;
}

/**
 * Build UI packets from a SerialLogger payload.
 *
 * Consecutive same-direction SEND/RECV entries (often one byte at a time) are
 * merged into readable frames for the traffic panel or saved capture.
 */
export function snifferPacketsFromSerialLog(log: unknown): SnifferPacket[] {
  if (!isRecord(log) || !Array.isArray(log.entries)) {
    return [];
  }

  const packets: SnifferPacket[] = [];
  let nextId = 1;
  let pending:
    | {
        direction: SnifferPacket['direction'];
        data: number[];
        timestamp: string;
        elapsedMs: number;
        description?: string;
      }
    | undefined;

  const flush = (): void => {
    if (!pending || pending.data.length === 0) {
      pending = undefined;
      return;
    }

    packets.push({
      id: nextId,
      timestamp: pending.timestamp,
      elapsedMs: pending.elapsedMs,
      direction: pending.direction,
      data: pending.data,
      description: pending.description,
    });
    nextId += 1;
    pending = undefined;
  };

  for (const entry of log.entries) {
    if (!isRecord(entry) || !Array.isArray(entry.data)) {
      continue;
    }

    const direction: SnifferPacket['direction'] =
      entry.direction === 'RECV' ? 'RADIO->COMPUTER' : 'COMPUTER->RADIO';
    const data = entry.data.filter((byte): byte is number => typeof byte === 'number');

    if (data.length === 0) {
      continue;
    }

    if (pending && pending.direction !== direction) {
      flush();
    }

    if (!pending) {
      pending = {
        direction,
        data: [...data],
        timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : new Date().toISOString(),
        elapsedMs: typeof entry.elapsedMs === 'number' ? entry.elapsedMs : 0,
        description: typeof entry.description === 'string' ? entry.description : undefined,
      };
      continue;
    }

    pending.data.push(...data);
  }

  flush();
  return packets;
}

/**
 * Build a sniffer capture document for disk and agent review.
 *
 * `log` is the SerialLogger payload from the sniffer API. `packets` are the
 * coalesced frames shown in the UI. Both are kept so a human can read hex
 * traffic while an agent compares SEND/RECV bytes against a driver log.
 */
export function serializeSnifferCaptureFile(input: {
  status: SnifferStatus;
  packets: SnifferPacket[];
  log?: unknown;
  savedAt?: Date;
}): string {
  const savedAt = (input.savedAt ?? new Date()).toISOString();
  const document: SnifferCaptureDocument = {
    kind: SNIFFER_CAPTURE_FILE_KIND,
    version: SNIFFER_CAPTURE_FILE_VERSION,
    computerPort: input.status.computerPort,
    radioPort: input.status.radioPort,
    baudRate: input.status.baudRate,
    startedAt: input.status.startedAt,
    savedAt,
    logFile: input.status.logFile,
    packets: input.packets,
  };

  if (input.log !== undefined) {
    document.log = input.log;
  }

  return `${JSON.stringify(document, null, 2)}\n`;
}
