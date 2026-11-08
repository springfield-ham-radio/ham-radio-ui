/** AX.25 UI control field, poll/final clear. */
export const AX25_UI_CONTROL = 0x03;

/** No layer-3 protocol. */
export const AX25_NO_PROTOCOL = 0xf0;

/** Generic APRS destination. The message addressee lives in the info field. */
export const APRS_AX25_DESTINATION = 'APRS';

const ADDRESS_BYTES = 7;

export interface Ax25Station {
  call: string;
  ssid: number;
  /** Digipeater H bit. Set only on a path hop that has already repeated. */
  repeated?: boolean;
}

export interface Ax25UiFrame {
  destination: Ax25Station;
  source: Ax25Station;
  path: Ax25Station[];
  info: string;
}

export interface Ax25Call {
  call: string;
  ssid: number;
  /** Digipeater H bit when this call is used in a path. */
  repeated?: boolean;
}

/**
 * Callsign used on the air, with SSID 0 omitted.
 *
 * The base is 3 to 6 characters, starting with a letter. SSID is 0 through 15.
 */
export function canonicalAx25Call(input: string): Ax25Call | undefined {
  const match = /^([A-Z][A-Z0-9]{2,5})(?:-(1[0-5]|[0-9]))?$/u.exec(input.trim().toUpperCase());

  if (!match?.[1]) {
    return undefined;
  }

  return {
    call: match[1],
    ssid: match[2] ? Number(match[2]) : 0,
  };
}

export function formatAx25Call(station: Ax25Station): string {
  if (station.ssid === 0) {
    return station.call;
  }

  return `${station.call}-${station.ssid}`;
}

function encodeAddress(station: Ax25Station, last: boolean, command: boolean): Uint8Array {
  const bytes = new Uint8Array(ADDRESS_BYTES);
  const padded = station.call.padEnd(6, ' ');

  for (let index = 0; index < 6; index += 1) {
    bytes[index] = (padded.charCodeAt(index) & 0x7f) << 1;
  }

  let ssid = 0x60 | ((station.ssid & 0x0f) << 1);

  if (command) {
    ssid |= 0x80;
  }

  if (last) {
    ssid |= 0x01;
  }

  bytes[6] = ssid;
  return bytes;
}

function decodeAddress(bytes: Uint8Array, offset: number): { station: Ax25Station; last: boolean; repeated: boolean } | undefined {
  if (offset + ADDRESS_BYTES > bytes.length) {
    return undefined;
  }

  let call = '';

  for (let index = 0; index < 6; index += 1) {
    const shifted = bytes[offset + index] ?? 0;

    if ((shifted & 0x01) !== 0) {
      return undefined;
    }

    call += String.fromCharCode((shifted >> 1) & 0x7f);
  }

  const ssidByte = bytes[offset + 6] ?? 0;
  const station: Ax25Station = {
    call: call.trim().toUpperCase(),
    ssid: (ssidByte >> 1) & 0x0f,
  };

  if (!canonicalAx25Call(formatAx25Call(station))) {
    return undefined;
  }

  return { station, last: (ssidByte & 0x01) === 0x01, repeated: (ssidByte & 0x80) !== 0 };
}

/**
 * UI frame for a direct APRS packet.
 *
 * No digipeaters are added. The FCS is not included; a KISS TNC adds it.
 */
export function encodeAx25Ui(source: Ax25Call, info: string, path: readonly Ax25Call[] = []): Uint8Array | undefined {
  const destination = canonicalAx25Call(APRS_AX25_DESTINATION);

  if (!destination || !canonicalAx25Call(formatAx25Call(source)) || path.some((hop) => !canonicalAx25Call(formatAx25Call(hop)))) {
    return undefined;
  }

  const stations = [destination, source, ...path];
  const addresses = stations.map((station, index) =>
    encodeAddress(station, index === stations.length - 1, index === 0 || (index > 1 && station.repeated === true)),
  );
  const infoBytes = [...info].map((character) => character.charCodeAt(0));

  if (infoBytes.some((code) => code < 0x20 || code > 0x7e)) {
    return undefined;
  }

  return Uint8Array.from([...addresses.flatMap((address) => [...address]), AX25_UI_CONTROL, AX25_NO_PROTOCOL, ...infoBytes]);
}

/** Parse one UI frame. Connected-mode control fields and a missing PID are rejected. */
export function parseAx25Ui(frame: Uint8Array): Ax25UiFrame | undefined {
  const addresses: Ax25Station[] = [];
  let offset = 0;
  let last = false;

  while (!last) {
    if (addresses.length >= 8) {
      return undefined;
    }

    const decoded = decodeAddress(frame, offset);

    if (!decoded) {
      return undefined;
    }

    addresses.push(decoded.repeated ? { ...decoded.station, repeated: true } : decoded.station);
    last = decoded.last;
    offset += ADDRESS_BYTES;
  }

  if (addresses.length < 2 || offset + 2 > frame.length) {
    return undefined;
  }

  if (frame[offset] !== AX25_UI_CONTROL || frame[offset + 1] !== AX25_NO_PROTOCOL) {
    return undefined;
  }

  // A TNC packet terminator is not part of the APRS data. APRS 1.0.1 message
  // text has no trailing CR. The TH-D74 ack on the air ended in 0x0D before
  // the closing KISS FEND. Strip only trailing CR and LF. A control byte
  // anywhere else still rejects the frame. SSID bit 7 is command/response,
  // and bits 5–6 are the reserved pair; the SSID itself is bits 1–4.
  let infoEnd = frame.length;

  while (infoEnd > offset + 2 && (frame[infoEnd - 1] === 0x0d || frame[infoEnd - 1] === 0x0a)) {
    infoEnd -= 1;
  }

  const infoBytes = frame.subarray(offset + 2, infoEnd);
  let info = '';

  for (const byte of infoBytes) {
    if (byte < 0x20 || byte > 0x7e) {
      return undefined;
    }

    info += String.fromCharCode(byte);
  }

  const destination = addresses[0];
  const source = addresses[1];

  if (!destination || !source) {
    return undefined;
  }

  delete destination.repeated;
  delete source.repeated;

  return {
    destination,
    source,
    path: addresses.slice(2),
    info,
  };
}
