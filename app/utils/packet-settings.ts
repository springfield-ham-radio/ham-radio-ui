import { canonicalAx25Call, formatAx25Call, type Ax25Call } from '~/utils/aprs-ax25';
import type { Ax25Modulo } from '~/utils/packet-ax25';

export const PACKET_SETTINGS_KEY = 'hbench.packet.settings';

export interface PacketSettings {
  ssid: number;
  /** Unsolicited SABM is ignored unless this is on. Default off. */
  acceptIncoming: boolean;
  modulo: Ax25Modulo;
  paclen: number;
  maxframe: number;
  t1Ms: number;
  t3Ms: number;
  n2: number;
}

export const PACKET_DEFAULT_SETTINGS: PacketSettings = {
  ssid: 0,
  acceptIncoming: false,
  modulo: 8,
  paclen: 128,
  maxframe: 4,
  t1Ms: 3000,
  t3Ms: 180_000,
  n2: 10,
};

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(number)));
}

/** Fill gaps and clamp operator settings. Incoming connects stay off when omitted. */
export function normalizePacketSettings(value: unknown): PacketSettings {
  const raw = value && typeof value === 'object' ? value as Partial<PacketSettings> : {};
  const modulo: Ax25Modulo = raw.modulo === 128 ? 128 : 8;
  const maxframeLimit = modulo === 128 ? 63 : 7;
  const t1Ms = clamp(raw.t1Ms, 500, 30_000, PACKET_DEFAULT_SETTINGS.t1Ms);
  let t3Ms = clamp(raw.t3Ms, 5_000, 600_000, PACKET_DEFAULT_SETTINGS.t3Ms);

  if (t3Ms <= t1Ms) {
    t3Ms = Math.min(600_000, t1Ms + 5_000);
  }

  return {
    ssid: clamp(raw.ssid, 0, 15, 0),
    acceptIncoming: raw.acceptIncoming === true,
    modulo,
    paclen: clamp(raw.paclen, 32, 256, PACKET_DEFAULT_SETTINGS.paclen),
    maxframe: clamp(raw.maxframe, 1, maxframeLimit, Math.min(PACKET_DEFAULT_SETTINGS.maxframe, maxframeLimit)),
    t1Ms,
    t3Ms,
    n2: clamp(raw.n2, 1, 20, PACKET_DEFAULT_SETTINGS.n2),
  };
}

export interface PacketSettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readPacketSettings(storage: PacketSettingsStorage): PacketSettings {
  try {
    const text = storage.getItem(PACKET_SETTINGS_KEY);

    if (!text) {
      return { ...PACKET_DEFAULT_SETTINGS };
    }

    return normalizePacketSettings(JSON.parse(text));
  } catch {
    return { ...PACKET_DEFAULT_SETTINGS };
  }
}

export function writePacketSettings(storage: PacketSettingsStorage, settings: PacketSettings): void {
  storage.setItem(PACKET_SETTINGS_KEY, JSON.stringify(normalizePacketSettings(settings)));
}

/**
 * Callsign for the link.
 *
 * The base is the operator callsign already stored in HamBench. An SSID in
 * that callsign is kept. Otherwise the Packet SSID setting is used, default 0.
 */
export function packetMyCall(base: string | undefined, ssid: number): Ax25Call | undefined {
  if (!base?.trim()) {
    return undefined;
  }

  const parsed = canonicalAx25Call(base);

  if (!parsed) {
    return undefined;
  }

  if (base.trim().includes('-')) {
    return parsed;
  }

  return { call: parsed.call, ssid };
}

export function packetMyCallLabel(base: string | undefined, ssid: number): string | undefined {
  const call = packetMyCall(base, ssid);
  return call ? formatAx25Call(call) : undefined;
}
