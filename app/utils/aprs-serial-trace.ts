/**
 * Bounded display of COM bytes.
 *
 * The text is escaped so a prompt, echo, or error can be read and cannot be
 * turned into HTML. Nothing in here is sent back to the radio. The transcript
 * is a view of lines already recorded. It does not write to the port.
 */

import { canonicalAx25Call, encodeAx25Ui, formatAx25Call, parseAx25Ui } from '~/utils/aprs-ax25';
import { createKissDecoderState, encodeKissData, pushKissBytes, type KissFrame } from '~/utils/aprs-kiss';

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

/** Local `HH:MM:SS`. Pass `timeZone` in tests. The clock is not UTC. */
export function formatTraceClock(at: number, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(at));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '00';

  return `${value('hour')}:${value('minute')}:${value('second')}`;
}

export function formatTraceLine(line: AprsTraceLine, options?: { timeZone?: string }): string {
  const time = formatTraceClock(line.at, options?.timeZone);
  const arrow = line.direction === 'rx' ? '←' : line.direction === 'note' ? '·' : '→';
  const body = line.direction === 'note' ? line.note : `${line.hex}  ${line.text}${line.truncated ? '  …' : ''}  ${line.note}`;

  return `${time} ${arrow} ${line.direction.toUpperCase()} ${body}`;
}

/** One-line label for a stored detection note. The stored note is unchanged. */
export function serialEventHeadline(note: string): string {
  if (note.includes('AX.25 UI seen')) {
    return 'KISS confirmed';
  }

  if (note.includes('KISS on, waiting for traffic')) {
    return 'Waiting for first station to confirm KISS';
  }

  if (note.includes('The TNC is not answering')) {
    return 'The TNC is not answering';
  }

  if (note.includes('Command-mode text was seen')) {
    return 'Command text, no prompt';
  }

  if (note.startsWith('Listening for')) {
    return 'Listening';
  }

  if (note.includes('Command text seen. Waiting')) {
    return 'Command text, waiting for a prompt';
  }

  if (note.includes('Entering host KISS') || note.includes('already on this connection')) {
    return 'Prompt seen, entering KISS';
  }

  if (note.includes('KISS exit written')) {
    return 'KISS exit';
  }

  if (note.includes('Prompt request written')) {
    return 'Asked for a prompt';
  }

  if (note.includes('Prompt nudge written')) {
    return 'Prompt nudge';
  }

  if (note.startsWith('Disconnected.')) {
    return 'Disconnected';
  }

  if (note.length > 80) {
    const sentence = note.split('. ')[0] ?? note;
    return sentence.endsWith('.') ? sentence : `${sentence}.`;
  }

  return note;
}

export interface SerialTranscriptRow {
  key: string;
  time: string;
  /** ← from the radio, → from HamBench, · for a note. */
  arrow: '←' | '→' | '·';
  who: 'radio' | 'HamBench' | 'note';
  text: string;
  echo: boolean;
  hex: string;
  /** Full stored note, when it is longer than the line. */
  detail?: string;
}

function bytesFromHex(hex: string): Uint8Array {
  if (!hex) {
    return new Uint8Array();
  }

  return Uint8Array.from(hex.split(' ').filter((byte) => byte.length > 0).map((byte) => Number.parseInt(byte, 16)));
}

function kissLine(frame: KissFrame): string {
  if (frame.command === 0xff && frame.data.length === 0) {
    return 'KISS was OFF';
  }

  if ((frame.command & 0x0f) !== 0) {
    return `KISS command ${frame.command.toString(16)}`;
  }

  const ui = parseAx25Ui(frame.data);

  if (!ui) {
    return 'KISS data';
  }

  const path = ui.path.map((hop) => `${formatAx25Call(hop)}${hop.repeated ? '*' : ''}`).join(',');
  const route = path.length > 0
    ? `${formatAx25Call(ui.source)}>${formatAx25Call(ui.destination)},${path}`
    : `${formatAx25Call(ui.source)}>${formatAx25Call(ui.destination)}`;
  const info = ui.info.replace(/[\r\n]+/gu, ' ');

  return info.length > 0 ? `${route}: ${info}` : route;
}

function commandLabel(line: AprsTraceLine): string {
  if (line.note.includes('KISS exit') || line.hex === 'c0 ff c0') {
    return 'KISS exit';
  }

  const bytes = bytesFromHex(line.hex);

  if (bytes.length > 0 && bytes.every((byte) => byte === 0x03)) {
    return 'Ctrl+C';
  }

  const visible = line.text.replace(/\\r|\\n|\\t/gu, '').trim();

  if (line.note.includes('Prompt nudge')) {
    return visible.length > 0 ? visible : 'Prompt nudge';
  }

  return visible.length > 0 ? visible : serialEventHeadline(line.note);
}

/**
 * Terminal rows for the raw log.
 *
 * Command text is joined across chunks and split on CR/LF. An echo of the
 * last write stays one dimmed row. Each KISS frame is one AX.25 line.
 */
export function serialTranscript(lines: readonly AprsTraceLine[], options?: { timeZone?: string }): SerialTranscriptRow[] {
  const rows: SerialTranscriptRow[] = [];
  let pendingAt = 0;
  let pendingEcho = false;
  let pendingBytes: number[] = [];
  let sequence = 0;

  const pushRow = (row: Omit<SerialTranscriptRow, 'key'>): void => {
    rows.push({ ...row, key: `${row.time}-${sequence}` });
    sequence += 1;
  };

  const emitText = (bytes: number[]): void => {
    if (bytes.length === 0) {
      return;
    }

    let text = '';

    for (const byte of bytes) {
      text += byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : `\\x${byte.toString(16).padStart(2, '0')}`;
    }

    pushRow({
      time: formatTraceClock(pendingAt, options?.timeZone),
      arrow: '←',
      who: 'radio',
      text,
      echo: pendingEcho,
      hex: formatSerialHex(Uint8Array.from(bytes)),
    });
  };

  const takeLines = (force: boolean): void => {
    let start = 0;
    let index = 0;

    while (index < pendingBytes.length) {
      const byte = pendingBytes[index];

      if (byte !== 0x0d && byte !== 0x0a) {
        index += 1;
        continue;
      }

      emitText(pendingBytes.slice(start, index));
      index += byte === 0x0d && pendingBytes[index + 1] === 0x0a ? 2 : 1;
      start = index;
    }

    pendingBytes = pendingBytes.slice(start);

    if (force) {
      emitText(pendingBytes);
      pendingBytes = [];
      pendingEcho = false;
    }
  };

  const appendText = (at: number, bytes: Uint8Array, echo: boolean): void => {
    if (bytes.length === 0) {
      return;
    }

    if (pendingBytes.length > 0 && pendingEcho !== echo) {
      takeLines(true);
    }

    if (pendingBytes.length === 0) {
      pendingAt = at;
      pendingEcho = echo;
    }

    pendingBytes.push(...bytes);
    takeLines(false);
  };

  for (const line of lines) {
    if (line.direction === 'note') {
      takeLines(true);
      const text = serialEventHeadline(line.note);
      pushRow({
        time: formatTraceClock(line.at, options?.timeZone),
        arrow: '·',
        who: 'note',
        text,
        echo: false,
        hex: '',
        detail: text === line.note ? undefined : line.note,
      });
      continue;
    }

    if (line.direction === 'tx-command' || line.direction === 'tx-frame') {
      takeLines(true);
      const bytes = bytesFromHex(line.hex);
      const decoded = line.direction === 'tx-frame' ? pushKissBytes(createKissDecoderState(), bytes, line.at) : undefined;
      const frame = decoded?.frames.find((item) => (item.command & 0x0f) === 0);
      const text = frame ? kissLine(frame) : commandLabel(line);
      pushRow({
        time: formatTraceClock(line.at, options?.timeZone),
        arrow: '→',
        who: 'HamBench',
        text,
        echo: false,
        hex: line.hex,
        detail: line.note === text ? undefined : line.note,
      });
      continue;
    }

    const echo = line.note.includes('echo of the last write');
    const bytes = bytesFromHex(line.hex);
    const decoded = pushKissBytes(createKissDecoderState(), bytes, line.at);

    if (decoded.frames.length > 0) {
      takeLines(true);
    }

    appendText(line.at, decoded.ignoredBytes, echo);

    for (const frame of decoded.frames) {
      const text = kissLine(frame);
      pushRow({
        time: formatTraceClock(line.at, options?.timeZone),
        arrow: '←',
        who: 'radio',
        text,
        echo,
        hex: line.hex,
        detail: line.note.includes(text) ? undefined : line.note,
      });
    }
  }

  takeLines(true);
  return rows;
}

/**
 * Sample reply for the layout. It is not a capture from a radio.
 * Split the way a TNC can split a banner, a prompt, an echo, and an error.
 */
const fixtureSource = canonicalAx25Call('K5KTF-4');
const fixtureVia = canonicalAx25Call('WIDE2-1');
const fixtureAx25 = fixtureSource && fixtureVia ? encodeAx25Ui(fixtureSource, '!3031.12NI09752.74W&K5KTF', [fixtureVia]) : undefined;
const fixtureKiss = fixtureAx25 ? encodeKissData(fixtureAx25) : new Uint8Array();

export const APRS_HOST_TRACE_FIXTURE: readonly AprsTraceLine[] = [
  makeTraceLine(Date.UTC(2026, 10, 11, 19, 45, 2), 'note', new Uint8Array(), 'FIXTURE, not from the radio. Listen opened. No command was sent.'),
  makeTraceLine(Date.UTC(2026, 10, 11, 19, 45, 2), 'rx', Uint8Array.from([...'DA 110101000000\r\nHB 1200\r\n'].map((character) => character.charCodeAt(0))), '53 command-text'),
  makeTraceLine(Date.UTC(2026, 10, 11, 19, 45, 2), 'rx', Uint8Array.from([...'cmd:HBAUD    was 1200\r\ncmd:'].map((character) => character.charCodeAt(0))), 'rest of the banner, command text'),
  makeTraceLine(Date.UTC(2026, 10, 11, 19, 45, 3), 'tx-command', new TextEncoder().encode('KISS ON\r'), 'KISS ON written once. Plugin accepted 8 bytes. That is kernel acceptance, not a radio echo. Waiting for another cmd: before RESTART.'),
  makeTraceLine(Date.UTC(2026, 10, 11, 19, 45, 3), 'rx', new TextEncoder().encode('KISS ON\r\n'), 'echo of the last write, not a KISS frame, 1 command-text'),
  makeTraceLine(Date.UTC(2026, 10, 11, 19, 45, 4), 'tx-command', new TextEncoder().encode('RESTART\r'), 'RESTART written once after cmd:. KISS unconfirmed. This is not repeated. KISS on, waiting for traffic.'),
  makeTraceLine(Date.UTC(2026, 10, 11, 19, 45, 4), 'note', new Uint8Array(), 'KISS on, waiting for traffic.'),
  makeTraceLine(Date.UTC(2026, 10, 11, 19, 45, 5), 'rx', fixtureKiss, '1 KISS, AX.25 UI'),
  makeTraceLine(Date.UTC(2026, 10, 11, 19, 45, 5), 'note', new Uint8Array(), 'AX.25 UI seen.'),
  makeTraceLine(Date.UTC(2026, 10, 11, 19, 45, 6), 'rx', Uint8Array.from([0x00, 0x11, 0x13, 0x3c, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74, 0x3e, 0xc0]), 'escaped binary and an incomplete FEND, not executed'),
] as const;

export function formatTrace(lines: readonly AprsTraceLine[], options?: { timeZone?: string }): string {
  return lines.map((line) => formatTraceLine(line, options)).join('\n');
}
