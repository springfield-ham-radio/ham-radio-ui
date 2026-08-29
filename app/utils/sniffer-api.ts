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
}

export type SnifferEvent =
  | { type: 'status'; status: SnifferStatus }
  | { type: 'packet'; packet: SnifferPacket }
  | { type: 'error'; message: string; source?: 'computer' | 'radio' };

export interface SnifferHealth {
  ok: boolean;
  service: string;
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
