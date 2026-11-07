/** Bytes kept from a line that has not yet ended. */
export const APRS_PARTIAL_LINE_LIMIT = 4096;

export interface AprsLineBuffer {
  pending: string;
}

export interface AprsLineChunk {
  /** Latin-1 text. Bytes above 0x7F stay as single characters. */
  text: string;
  /** False when the chunk is an unfinished tail still held in the buffer. */
  complete: boolean;
  /** True when the line was closed because it exceeded the partial-line limit. */
  truncated: boolean;
}

export function createAprsLineBuffer(): AprsLineBuffer {
  return { pending: '' };
}

/**
 * Append a serial chunk and return every completed line.
 *
 * Splits on CR, LF, or CRLF. A trailing partial line stays in the buffer.
 * Latin-1 decoding keeps Mic-E bytes that are not valid UTF-8.
 */
export function consumeAprsBytes(buffer: AprsLineBuffer, bytes: Uint8Array): AprsLineChunk[] {
  buffer.pending += latin1FromBytes(bytes);
  const lines: AprsLineChunk[] = [];

  while (buffer.pending.length > 0) {
    const breakAt = findLineBreak(buffer.pending);

    if (breakAt === undefined) {
      if (buffer.pending.length <= APRS_PARTIAL_LINE_LIMIT) {
        break;
      }

      lines.push({
        text: buffer.pending.slice(0, APRS_PARTIAL_LINE_LIMIT),
        complete: true,
        truncated: true,
      });
      buffer.pending = buffer.pending.slice(APRS_PARTIAL_LINE_LIMIT);
      continue;
    }

    const text = buffer.pending.slice(0, breakAt.index);
    buffer.pending = buffer.pending.slice(breakAt.index + breakAt.width);

    if (text.length === 0) {
      continue;
    }

    lines.push({ text, complete: true, truncated: false });
  }

  return lines;
}

/** Drop an unfinished tail. Used when the port closes. */
export function takeAprsPartial(buffer: AprsLineBuffer): string {
  const pending = buffer.pending;
  buffer.pending = '';
  return pending;
}

function findLineBreak(text: string): { index: number; width: number } | undefined {
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char !== '\r' && char !== '\n') {
      continue;
    }

    const next = text[index + 1];
    const width = next !== undefined && next !== char && (next === '\r' || next === '\n') ? 2 : 1;
    return { index, width };
  }

  return undefined;
}

function latin1FromBytes(bytes: Uint8Array): string {
  let text = '';

  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }

  return text;
}
