export type SnifferDirection = 'COMPUTER->RADIO' | 'RADIO->COMPUTER';

export interface SnifferPacket {
  id: number;
  timestamp: string;
  elapsedMs: number;
  direction: SnifferDirection;
  data: number[];
  description?: string;
}

export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
  locationId?: string;
  productId?: string;
  vendorId?: string;
}

export interface SnifferStatus {
  running: boolean;
  computerPort?: string;
  radioPort?: string;
  baudRate?: number;
  logFile?: string;
  startedAt?: string;
  packetCount: number;
  bytesComputerToRadio?: number;
  bytesRadioToComputer?: number;
  writeErrors?: number;
  computerPortOpen?: boolean;
  radioPortOpen?: boolean;
}

export type SnifferEvent =
  | { type: 'status'; status: SnifferStatus }
  | { type: 'packet'; packet: SnifferPacket }
  | { type: 'error'; message: string; source?: 'computer' | 'radio' };

export interface SnifferHealth {
  ok: boolean;
  service: string;
  version?: string;
}

export interface SnifferPortsResponse {
  ports: SerialPortInfo[];
}

export interface SnifferLogResponse {
  status: SnifferStatus;
  packets: SnifferPacket[];
  file: {
    path?: string;
    data?: unknown;
  };
}

/**
 * Extract a human-readable message from an ofetch / $fetch failure.
 */
export function snifferFetchErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const fetchError = error as {
      data?: { statusMessage?: string; message?: string };
      statusMessage?: string;
      message?: string;
    };

    return fetchError.data?.statusMessage ?? fetchError.data?.message ?? fetchError.statusMessage ?? fetchError.message ?? 'Request failed';
  }

  return 'Request failed';
}

export function snifferPacketToHex(data: number[]): string {
  return data.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

/** Browser EventSource.CONNECTING — auto-reconnect in progress. */
export const EVENT_SOURCE_CONNECTING = 0;

/**
 * Decide what to do when a sniffer SSE stream errors.
 *
 * EventSource fires `error` when we close it (stale instance) and while it is
 * reconnecting. Those must not mark the sniffer unreachable; health polling
 * owns that. Only drop the handle when this instance is current and no longer
 * connecting, so the next health tick can open a new stream.
 */
export function snifferEventSourceErrorAction(options: {
  current: object | undefined;
  source: object;
  readyState: number;
}): 'ignore' | 'drop' {
  if (options.current !== options.source) {
    return 'ignore';
  }

  if (options.readyState === EVENT_SOURCE_CONNECTING) {
    return 'ignore';
  }

  return 'drop';
}
