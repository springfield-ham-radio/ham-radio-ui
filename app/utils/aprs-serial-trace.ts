/**
 * Bounded display of COM bytes.
 *
 * The text is escaped so a prompt, echo, or error can be read and cannot be
 * turned into HTML. Nothing in here is sent back to the radio.
 */

export const APRS_TRACE_CAP = 100;
export const APRS_TRACE_SHOW_BYTES = 128;

export type AprsTraceDirection = 'rx' | 'tx-command' | 'tx-frame' | 'note';

export interface AprsTraceLine {
  at: number;
  direction: AprsTraceDirection;
  /** Bytes this entry stands for. A truncated line still counts the full chunk. */
  byteLength: number;
  truncated: boolean;
  hex: string;
  text: string;
  note: string;
}

export function escapeSerialText(bytes: Uint8Array): string {
  let out = '';

  for (const byte of bytes) {
    if (byte === 0x0d) {
      out += '\\r';
    } else if (byte === 0x0a) {
      out += '\\n';
    } else if (byte === 0x09) {
      out += '\\t';
    } else if (byte >= 0x20 && byte <= 0x7e && byte !== 0x3c && byte !== 0x3e && byte !== 0x26) {
      out += String.fromCharCode(byte);
    } else {
      out += `\\x${byte.toString(16).padStart(2, '0')}`;
    }
  }

  return out;
}

export function formatSerialHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

export function makeTraceLine(
  at: number,
  direction: AprsTraceDirection,
  bytes: Uint8Array,
  note: string,
): AprsTraceLine {
  const shown = bytes.subarray(0, APRS_TRACE_SHOW_BYTES);

  return {
    at,
    direction,
    byteLength: bytes.length,
    truncated: bytes.length > shown.length,
    hex: formatSerialHex(shown),
    text: escapeSerialText(shown),
    note,
  };
}

export function pushTraceLine(lines: AprsTraceLine[], line: AprsTraceLine): number {
  lines.push(line);

  if (lines.length <= APRS_TRACE_CAP) {
    return 0;
  }

  const dropped = lines.length - APRS_TRACE_CAP;
  lines.splice(0, dropped);
  return dropped;
}

export function formatTraceLine(line: AprsTraceLine): string {
  const time = new Date(line.at).toISOString().slice(11, 23);
  const body = line.direction === 'note' ? line.note : `${line.hex}  ${line.text}${line.truncated ? '  …' : ''}  ${line.note}`;
  return `${time} ${line.direction.toUpperCase()} ${body}`;
}

/**
 * Sample reply for the layout. It is not a capture from a radio.
 * Split the way a TNC can split a banner, a prompt, an echo, and an error.
 */
export const APRS_HOST_TRACE_FIXTURE: readonly AprsTraceLine[] = [
  makeTraceLine(0, 'note', new Uint8Array(), 'FIXTURE, not from the radio. Listen opened. No command was sent.'),
  makeTraceLine(1, 'rx', Uint8Array.from([...'Kenwood\r\n'].map((character) => character.charCodeAt(0))), '4 of a split banner, command text'),
  makeTraceLine(10, 'rx', Uint8Array.from([...'TNC\r\ncmd:'].map((character) => character.charCodeAt(0))), 'rest of the banner and a prompt, command text'),
  makeTraceLine(20, 'tx-command', new TextEncoder().encode('\rKISS ON\rRESTART\r'), 'FIXTURE marking for a command already written. This row was not sent again.'),
  makeTraceLine(21, 'rx', Uint8Array.from([...'KISS'].map((character) => character.charCodeAt(0))), 'echo split before ON, command text, KISS unconfirmed'),
  makeTraceLine(22, 'rx', Uint8Array.from([...' ON\r\n?EH\r\n'].map((character) => character.charCodeAt(0))), 'echo rest and an error, command text, KISS unconfirmed'),
  makeTraceLine(30, 'rx', Uint8Array.from([0x00, 0x11, 0x13, 0x3c, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74, 0x3e, 0xc0]), 'escaped binary and an incomplete FEND, not executed'),
] as const;

export function formatTrace(lines: readonly AprsTraceLine[]): string {
  return lines.map((line) => formatTraceLine(line)).join('\n');
}
