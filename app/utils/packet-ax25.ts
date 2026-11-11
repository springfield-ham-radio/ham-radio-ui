/**
 * AX.25 frame codec for the Packet tab.
 *
 * UI frames used by APRS stay in `aprs-ax25`. This parser accepts I, S, and U
 * frames, including digipeater H bits and the command/response bits. The FCS
 * is not included; a KISS TNC adds and checks it.
 */

import { canonicalAx25Call, formatAx25Call, type Ax25Call, type Ax25Station } from '~/utils/aprs-ax25';

const ADDRESS_BYTES = 7;
const MAX_ADDRESSES = 8;

export const AX25_PID_NONE = 0xf0;

export type Ax25Modulo = 8 | 128;
export type Ax25Cr = 'command' | 'response' | 'legacy';
export type Ax25SType = 'RR' | 'RNR' | 'REJ' | 'SREJ';
export type Ax25UType = 'SABM' | 'SABME' | 'DISC' | 'DM' | 'UA' | 'FRMR' | 'UI' | 'XID' | 'TEST';

export interface Ax25Frame {
  destination: Ax25Station;
  source: Ax25Station;
  path: Ax25Station[];
  cr: Ax25Cr;
  modulo: Ax25Modulo;
  kind: 'I' | 'S' | 'U';
  sType?: Ax25SType;
  uType?: Ax25UType;
  ns?: number;
  nr?: number;
  pf: boolean;
  pid?: number;
  info: Uint8Array;
}

export interface Ax25FrameDraft {
  destination: Ax25Call;
  source: Ax25Call;
  path?: readonly Ax25Call[];
  cr: Exclude<Ax25Cr, 'legacy'>;
  modulo?: Ax25Modulo;
  kind: 'I' | 'S' | 'U';
  sType?: Ax25SType;
  uType?: Ax25UType;
  ns?: number;
  nr?: number;
  pf?: boolean;
  pid?: number;
  info?: Uint8Array;
}

const S_NAMES: readonly Ax25SType[] = ['RR', 'RNR', 'REJ', 'SREJ'];

const U_CONTROL: Record<Ax25UType, number> = {
  UI: 0x03,
  DM: 0x0f,
  SABM: 0x2f,
  DISC: 0x43,
  UA: 0x63,
  SABME: 0x6f,
  FRMR: 0x87,
  XID: 0xaf,
  TEST: 0xe3,
};

function highBit(on: boolean): number {
  return on ? 0x80 : 0;
}

function encodeAddress(station: Ax25Call, last: boolean, high: boolean): number[] {
  const padded = station.call.padEnd(6, ' ').slice(0, 6);
  const bytes: number[] = [];

  for (let index = 0; index < 6; index += 1) {
    bytes.push((padded.charCodeAt(index) & 0x7f) << 1);
  }

  let ssid = 0x60 | ((station.ssid & 0x0f) << 1) | highBit(high);

  if (last) {
    ssid |= 0x01;
  }

  bytes.push(ssid);
  return bytes;
}

function decodeAddress(
  bytes: Uint8Array,
  offset: number,
): { station: Ax25Station; last: boolean; high: boolean } | undefined {
  if (offset + ADDRESS_BYTES > bytes.length) {
    return undefined;
  }

  let call = '';

  for (let index = 0; index < 6; index += 1) {
    const shifted = bytes[offset + index] ?? 0;

    if ((shifted & 0x01) !== 0) {
      return undefined;
    }

    const character = (shifted >> 1) & 0x7f;

    if (character < 0x20 || character > 0x7e) {
      return undefined;
    }

    call += String.fromCharCode(character);
  }

  const ssidByte = bytes[offset + 6] ?? 0;

  return {
    station: {
      call: call.trim().toUpperCase(),
      ssid: (ssidByte >> 1) & 0x0f,
    },
    last: (ssidByte & 0x01) === 0x01,
    high: (ssidByte & 0x80) !== 0,
  };
}

function controlBytes(draft: Ax25FrameDraft): number[] | undefined {
  const pf = draft.pf === true;
  const modulo = draft.modulo ?? 8;

  if (draft.kind === 'U') {
    if (!draft.uType) {
      return undefined;
    }

    const base = U_CONTROL[draft.uType];
    return [pf ? base | 0x10 : base];
  }

  const nr = draft.nr ?? 0;
  const limit = modulo === 128 ? 127 : 7;

  if (nr < 0 || nr > limit) {
    return undefined;
  }

  if (draft.kind === 'S') {
    if (!draft.sType) {
      return undefined;
    }

    const supervisory = S_NAMES.indexOf(draft.sType);

    if (supervisory < 0) {
      return undefined;
    }

    if (modulo === 128) {
      return [0x01 | (supervisory << 2), ((nr & 0x7f) << 1) | (pf ? 0x01 : 0)];
    }

    return [((nr & 0x07) << 5) | (pf ? 0x10 : 0) | (supervisory << 2) | 0x01];
  }

  const ns = draft.ns ?? 0;

  if (ns < 0 || ns > limit) {
    return undefined;
  }

  if (modulo === 128) {
    return [(ns & 0x7f) << 1, ((nr & 0x7f) << 1) | (pf ? 0x01 : 0)];
  }

  return [((nr & 0x07) << 5) | (pf ? 0x10 : 0) | ((ns & 0x07) << 1)];
}

function hasPid(kind: Ax25Frame['kind'], uType: Ax25UType | undefined): boolean {
  return kind === 'I' || uType === 'UI';
}

/**
 * Encode one AX.25 frame without the FCS.
 *
 * Command frames set the destination C bit. Response frames set the source
 * C bit. Digipeater bit 7 is the H bit, taken from `repeated`.
 */
export function encodeAx25Frame(draft: Ax25FrameDraft): Uint8Array | undefined {
  const destination = canonicalAx25Call(formatAx25Call(draft.destination));
  const source = canonicalAx25Call(formatAx25Call(draft.source));
  const path = draft.path ?? [];

  if (!destination || !source || path.some((hop) => !canonicalAx25Call(formatAx25Call(hop)))) {
    return undefined;
  }

  if (path.length > 6) {
    return undefined;
  }

  const control = controlBytes(draft);

  if (!control) {
    return undefined;
  }

  const stations = [destination, source, ...path];
  const bytes: number[] = [];

  stations.forEach((station, index) => {
    const last = index === stations.length - 1;
    const high = index === 0
      ? draft.cr === 'command'
      : index === 1
        ? draft.cr === 'response'
        : station.repeated === true;
    bytes.push(...encodeAddress(station, last, high));
  });

  bytes.push(...control);

  const info = draft.info ?? new Uint8Array();

  if (hasPid(draft.kind, draft.uType)) {
    bytes.push(draft.pid ?? AX25_PID_NONE);
  }

  bytes.push(...info);
  return Uint8Array.from(bytes);
}

function uTypeFrom(control: number): Ax25UType | undefined {
  const masked = control & ~0x10;
  const found = (Object.entries(U_CONTROL) as Array<[Ax25UType, number]>).find(([, value]) => value === masked);
  return found?.[0];
}

function parseControl(
  frame: Uint8Array,
  offset: number,
  modulo: Ax25Modulo,
): { parsed: Pick<Ax25Frame, 'kind' | 'sType' | 'uType' | 'ns' | 'nr' | 'pf' | 'modulo'>; next: number } | undefined {
  const first = frame[offset];

  if (first === undefined) {
    return undefined;
  }

  if ((first & 0x03) === 0x03) {
    const uType = uTypeFrom(first);

    if (!uType) {
      return undefined;
    }

    return {
      parsed: { kind: 'U', uType, pf: (first & 0x10) !== 0, modulo: 8 },
      next: offset + 1,
    };
  }

  if (modulo === 128) {
    const second = frame[offset + 1];

    if (second === undefined) {
      return undefined;
    }

    const pf = (second & 0x01) !== 0;
    const nr = (second >> 1) & 0x7f;

    if ((first & 0x01) === 0) {
      return {
        parsed: { kind: 'I', ns: (first >> 1) & 0x7f, nr, pf, modulo },
        next: offset + 2,
      };
    }

    if ((first & 0x03) === 0x01) {
      const sType = S_NAMES[(first >> 2) & 0x03];

      if (!sType) {
        return undefined;
      }

      return {
        parsed: { kind: 'S', sType, nr, pf, modulo },
        next: offset + 2,
      };
    }

    return undefined;
  }

  const pf = (first & 0x10) !== 0;
  const nr = (first >> 5) & 0x07;

  if ((first & 0x01) === 0) {
    return {
      parsed: { kind: 'I', ns: (first >> 1) & 0x07, nr, pf, modulo: 8 },
      next: offset + 1,
    };
  }

  if ((first & 0x03) === 0x01) {
    const sType = S_NAMES[(first >> 2) & 0x03];

    if (!sType) {
      return undefined;
    }

    return {
      parsed: { kind: 'S', sType, nr, pf, modulo: 8 },
      next: offset + 1,
    };
  }

  return undefined;
}

/** Parse one AX.25 frame. I and S frames use modulo 8 unless `modulo` is 128. */
export function parseAx25Frame(frame: Uint8Array, options?: { modulo?: Ax25Modulo }): Ax25Frame | undefined {
  const addresses: Array<{ station: Ax25Station; high: boolean }> = [];
  let offset = 0;
  let last = false;

  while (!last) {
    if (addresses.length >= MAX_ADDRESSES) {
      return undefined;
    }

    const decoded = decodeAddress(frame, offset);

    if (!decoded || decoded.station.call.length === 0) {
      return undefined;
    }

    addresses.push({ station: decoded.station, high: decoded.high });
    last = decoded.last;
    offset += ADDRESS_BYTES;
  }

  const destination = addresses[0];
  const source = addresses[1];

  if (!destination || !source) {
    return undefined;
  }

  const control = parseControl(frame, offset, options?.modulo ?? 8);

  if (!control) {
    return undefined;
  }

  let infoOffset = control.next;
  let pid: number | undefined;

  if (hasPid(control.parsed.kind, control.parsed.uType)) {
    pid = frame[infoOffset];

    if (pid === undefined) {
      return undefined;
    }

    infoOffset += 1;
  }

  const cr: Ax25Cr = destination.high && !source.high
    ? 'command'
    : !destination.high && source.high
      ? 'response'
      : 'legacy';

  return {
    destination: { call: destination.station.call, ssid: destination.station.ssid },
    source: { call: source.station.call, ssid: source.station.ssid },
    path: addresses.slice(2).map((hop) => ({
      call: hop.station.call,
      ssid: hop.station.ssid,
      repeated: hop.high,
    })),
    cr,
    pid,
    info: frame.subarray(infoOffset),
    ...control.parsed,
  };
}

/** True when every digipeater has already repeated, or the path is empty. */
export function ax25PathDelivered(path: readonly Ax25Station[]): boolean {
  return path.every((hop) => hop.repeated === true);
}

export function ax25ReversePath(path: readonly Ax25Station[]): Ax25Call[] {
  return [...path].reverse().map((hop) => ({ call: hop.call, ssid: hop.ssid }));
}

export function formatAx25Path(path: readonly Ax25Station[]): string {
  return path.map((hop) => `${formatAx25Call(hop)}${hop.repeated ? '*' : ''}`).join(',');
}

export function ax25InfoText(info: Uint8Array): string {
  let text = '';

  for (const byte of info) {
    if (byte === 0x0d) {
      text += '\\r';
    } else if (byte === 0x0a) {
      text += '\\n';
    } else if (byte >= 0x20 && byte <= 0x7e) {
      text += String.fromCharCode(byte);
    } else {
      text += '.';
    }
  }

  return text;
}

export function ax25InfoHex(info: Uint8Array): string {
  return [...info].map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

export function ax25ControlLabel(frame: Pick<Ax25Frame, 'kind' | 'sType' | 'uType'>): string {
  if (frame.kind === 'I') {
    return 'I';
  }

  if (frame.kind === 'S') {
    return frame.sType ?? 'S';
  }

  return frame.uType ?? 'U';
}

export function sameAx25Call(left: Ax25Call, right: Ax25Call): boolean {
  return left.call === right.call && left.ssid === right.ssid;
}
