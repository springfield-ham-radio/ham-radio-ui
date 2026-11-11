/**
 * Bounded display of COM bytes.
 *
 * The text is escaped so a prompt, echo, or error can be read and cannot be
 * turned into HTML. Nothing in here is sent back to the radio. The transcript
 * is a view of lines already recorded. It does not write to the port.
 */

import { canonicalAx25Call, encodeAx25Ui, parseAx25Ui } from '~/utils/aprs-ax25';
import { decodeAx25UiAprs } from '~/utils/aprs-decode';
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

export function formatTraceLine(line: AprsTraceLine, options?: { timeZone?: string; echo?: boolean }): string {
  const time = formatTraceClock(line.at, options?.timeZone);
  const arrow = line.direction === 'rx' ? '←' : line.direction === 'note' ? '·' : '→';
  const note = options?.echo && !line.note.includes('echo of the last write')
    ? (line.note.length > 0 ? `${line.note}, echo of the last write` : 'echo of the last write')
    : line.note;
  const body = line.direction === 'note' ? note : `${line.hex}  ${line.text}${line.truncated ? '  …' : ''}  ${note}`;

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

  return decodeAx25UiAprs(ui).raw;
}

function withoutLineBreaks(bytes: readonly number[]): number[] {
  let end = bytes.length;

  while (end > 0 && (bytes[end - 1] === 0x0d || bytes[end - 1] === 0x0a)) {
    end -= 1;
  }

  return bytes.slice(0, end);
}

function sameBytes(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function isLineBreakByte(byte: number): boolean {
  return byte === 0x0d || byte === 0x0a;
}

function isPrefix(whole: readonly number[], prefix: readonly number[]): boolean {
  return prefix.length <= whole.length && prefix.every((byte, index) => byte === whole[index]);
}

interface PresentedTraceLine {
  line: AprsTraceLine;
  echo: boolean;
}

/**
 * How many leading RX chunks are this write, including a CR/LF-only tail.
 * Zero when the bytes are not that echo.
 */
function echoChunkCount(lines: readonly AprsTraceLine[], tx: readonly number[]): number {
  const txTrim = withoutLineBreaks(tx);

  if (txTrim.length === 0) {
    return 0;
  }

  const buf: number[] = [];
  let matched = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!line || line.direction !== 'rx') {
      break;
    }

    buf.push(...bytesFromHex(line.hex));
    const extra = buf.slice(tx.length);
    const matchedWrite = sameBytes(withoutLineBreaks(buf), txTrim) && buf.length >= tx.length && extra.every(isLineBreakByte);

    if (matchedWrite) {
      matched = index + 1;
      continue;
    }

    if (matched > 0) {
      break;
    }

    const trim = withoutLineBreaks(buf);

    if (buf.length > tx.length + 2 || (!isPrefix(txTrim, trim) && !isPrefix(trim, txTrim))) {
      return 0;
    }
  }

  return matched;
}

/**
 * Put a write ahead of the echo that the radio returned before that write
 * was recorded, and mark the chunks that make up the echo.
 * Stored lines are not changed. Notes and hex stay on each chunk.
 */
function presentTrace(lines: readonly AprsTraceLine[]): PresentedTraceLine[] {
  const result: PresentedTraceLine[] = [];
  const pending: AprsTraceLine[] = [];
  const assembling: AprsTraceLine[] = [];
  let expect: number[] | undefined;

  const flushPending = (): void => {
    for (const line of pending) {
      result.push({ line, echo: false });
    }

    pending.length = 0;
  };

  const flushAssembly = (): void => {
    for (const line of assembling) {
      result.push({ line, echo: false });
    }

    assembling.length = 0;
  };

  for (const line of lines) {
    if (line.direction === 'tx-command' || line.direction === 'tx-frame') {
      flushAssembly();
      const tx = [...bytesFromHex(line.hex)];
      let start = pending.length;

      while (start > 0 && pending[start - 1]?.direction === 'rx') {
        start -= 1;
      }

      const run = pending.slice(start);
      let foundAt = -1;
      let foundCount = 0;

      for (let index = 0; index < run.length; index += 1) {
        const count = echoChunkCount(run.slice(index), tx);

        if (count > 0) {
          foundAt = index;
          foundCount = count;
          break;
        }
      }

      if (foundAt >= 0) {
        for (const item of pending.slice(0, start + foundAt)) {
          result.push({ line: item, echo: false });
        }

        pending.length = 0;
        result.push({ line, echo: false });

        for (const item of run.slice(foundAt, foundAt + foundCount)) {
          result.push({ line: item, echo: true });
        }

        for (const item of run.slice(foundAt + foundCount)) {
          result.push({ line: item, echo: false });
        }

        expect = undefined;
        continue;
      }

      const txTrim = withoutLineBreaks(tx);
      let prefixAt = -1;

      for (let index = 0; index < run.length; index += 1) {
        const prefix = run.slice(index).flatMap((item) => [...bytesFromHex(item.hex)]);

        if (prefix.length > 0 && prefix.length < txTrim.length && isPrefix(txTrim, prefix)) {
          prefixAt = index;
          break;
        }
      }

      if (prefixAt >= 0) {
        for (const item of pending.slice(0, start + prefixAt)) {
          result.push({ line: item, echo: false });
        }

        pending.length = 0;
        result.push({ line, echo: false });

        for (const item of run.slice(prefixAt)) {
          result.push({ line: item, echo: true });
        }

        expect = tx;
        continue;
      }

      flushPending();
      result.push({ line, echo: false });
      expect = tx;
      continue;
    }

    if (expect && line.direction === 'note') {
      result.push({ line, echo: false });
      continue;
    }

    if (expect && line.direction === 'rx') {
      assembling.push(line);
      const count = echoChunkCount(assembling, expect);

      if (count > 0) {
        for (const item of assembling.slice(0, count)) {
          result.push({ line: item, echo: true });
        }

        const rest = assembling.slice(count);
        assembling.length = 0;
        expect = undefined;

        for (const item of rest) {
          result.push({ line: item, echo: false });
        }
      } else {
        const buf = assembling.flatMap((item) => [...bytesFromHex(item.hex)]);
        const trim = withoutLineBreaks(buf);
        const txTrim = withoutLineBreaks(expect);
        const still = buf.length <= txTrim.length + 2 && (isPrefix(txTrim, trim) || isPrefix(trim, txTrim));

        if (!still) {
          pending.push(...assembling);
          assembling.length = 0;
          expect = undefined;
        }
      }

      continue;
    }

    flushAssembly();
    pending.push(line);
  }

  flushAssembly();
  flushPending();
  return result;
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

/** Notes this short stay on the row. Longer ones open from Details. */
const LONG_NOTE = 80;

function rowDetail(note: string, visible: string): string | undefined {
  if (note.length <= LONG_NOTE || note === visible) {
    return undefined;
  }

  return note;
}

const CMD_PROMPT = [0x63, 0x6d, 0x64, 0x3a];

function startsWithCmd(bytes: readonly number[], index: number): boolean {
  return CMD_PROMPT.every((byte, offset) => bytes[index + offset] === byte);
}

/**
 * Terminal rows for the raw log.
 *
 * Command text is joined across chunks and split on CR/LF and on `cmd:`.
 * A partial line is flushed before a write unless it is the start of that
 * write's echo. The echo can finish in a later chunk that also holds the
 * TNC response. KISS bytes keep one decoder for the whole log.
 */
export function serialTranscript(lines: readonly AprsTraceLine[], options?: { timeZone?: string }): SerialTranscriptRow[] {
  const rows: SerialTranscriptRow[] = [];
  let pendingAt = 0;
  let pendingEcho = false;
  let pendingBytes: number[] = [];
  let sequence = 0;
  const kissState = createKissDecoderState();
  let expectEcho: number[] | undefined;

  const pushRow = (row: Omit<SerialTranscriptRow, 'key'>): void => {
    rows.push({ ...row, key: `${row.time}-${sequence}` });
    sequence += 1;
  };

  const emitText = (bytes: number[]): void => {
    if (bytes.length === 0) {
      return;
    }

    const echo = pendingEcho || (expectEcho !== undefined && sameBytes(withoutLineBreaks(bytes), withoutLineBreaks(expectEcho)));

    if (echo && expectEcho && sameBytes(withoutLineBreaks(bytes), withoutLineBreaks(expectEcho))) {
      expectEcho = undefined;
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
      echo,
      hex: formatSerialHex(Uint8Array.from(bytes)),
    });
  };

  const takeLines = (force: boolean): void => {
    let start = 0;
    let index = 0;

    while (index < pendingBytes.length) {
      const byte = pendingBytes[index];

      if (startsWithCmd(pendingBytes, index)) {
        emitText(pendingBytes.slice(start, index));
        emitText(pendingBytes.slice(index, index + CMD_PROMPT.length));
        index += CMD_PROMPT.length;
        start = index;
        continue;
      }

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

    if (pendingBytes.length === 0) {
      pendingAt = at;
      pendingEcho = echo;
    } else if (!echo) {
      pendingEcho = false;
    }

    pendingBytes.push(...bytes);
    takeLines(false);
  };

  const emitKissFrames = (line: AprsTraceLine, frames: KissFrame[]): void => {
    for (const frame of frames) {
      const text = kissLine(frame);
      pushRow({
        time: formatTraceClock(line.at, options?.timeZone),
        arrow: '←',
        who: 'radio',
        text,
        echo: false,
        hex: line.hex,
        detail: rowDetail(line.note, text),
      });
    }
  };

  for (const line of presentTrace(lines).map((item) => item.line)) {
    if (line.direction === 'note') {
      const text = serialEventHeadline(line.note);
      pushRow({
        time: formatTraceClock(line.at, options?.timeZone),
        arrow: '·',
        who: 'note',
        text,
        echo: false,
        hex: '',
        detail: rowDetail(line.note, text),
      });
      continue;
    }

    if (line.direction === 'tx-command' || line.direction === 'tx-frame') {
      const bytes = [...bytesFromHex(line.hex)];
      const echoedAlready = pendingBytes.length > 0
        && pendingBytes.length < withoutLineBreaks(bytes).length
        && isPrefix(withoutLineBreaks(bytes), pendingBytes);

      if (!echoedAlready) {
        takeLines(true);
      }

      expectEcho = bytes;
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
        detail: rowDetail(line.note, text),
      });
      continue;
    }

    const echo = line.note.includes('echo of the last write');
    const bytes = bytesFromHex(line.hex);
    const wasHolding = kissState.inFrame && kissState.pending.length > 0;
    const decoded = pushKissBytes(kissState, bytes, line.at);

    if (wasHolding) {
      emitKissFrames(line, decoded.frames);
      appendText(line.at, decoded.ignoredBytes, echo);
    } else {
      appendText(line.at, decoded.ignoredBytes, echo);
      emitKissFrames(line, decoded.frames);
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
  makeTraceLine(Date.UTC(2026, 10, 11, 19, 49, 0), 'rx', new TextEncoder().encode('cmd:K5KTF-4>APRX29:>APRX on ... -- No Windoze'), 'startup banner, no CR'),
  makeTraceLine(Date.UTC(2026, 10, 11, 19, 49, 1), 'rx', new TextEncoder().encode('KIS'), '3 command-text'),
  makeTraceLine(Date.UTC(2026, 10, 11, 19, 49, 1), 'tx-command', new TextEncoder().encode('KISS ON\r'), 'KISS ON written once. Plugin accepted 8 bytes. That is kernel acceptance, not a radio echo.'),
  makeTraceLine(Date.UTC(2026, 10, 11, 19, 49, 1), 'rx', new TextEncoder().encode('S ON\r\nKISS     was OFF\r\n'), 'command-text'),
] as const;

export function formatTrace(lines: readonly AprsTraceLine[], options?: { timeZone?: string }): string {
  return presentTrace(lines).map((item) => formatTraceLine(item.line, { ...options, echo: item.echo })).join('\n');
}
