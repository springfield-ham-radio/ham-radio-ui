import { describe, expect, it } from 'vitest';
import { APRS_PARTIAL_LINE_LIMIT, consumeAprsBytes, createAprsLineBuffer, takeAprsPartial } from '../../app/utils/aprs-line-buffer.ts';

function bytes(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

describe('APRS line buffer', () => {
  it('keeps a partial line until CR, LF, or CRLF arrives', () => {
    const buffer = createAprsLineBuffer();

    expect(consumeAprsBytes(buffer, bytes('N0CALL>APRS:!49'))).toEqual([]);
    expect(consumeAprsBytes(buffer, bytes('03.50N/07201.75W-\r\n'))).toEqual([
      { text: 'N0CALL>APRS:!4903.50N/07201.75W-', complete: true, truncated: false },
    ]);
    expect(buffer.pending).toBe('');
  });

  it('treats CR, LF, and CRLF as one break and keeps a following partial line', () => {
    const buffer = createAprsLineBuffer();
    const lines = consumeAprsBytes(buffer, bytes('one\r\ntwo\nthree\rfour'));

    expect(lines.map((line) => line.text)).toEqual(['one', 'two', 'three']);
    expect(buffer.pending).toBe('four');
    expect(takeAprsPartial(buffer)).toBe('four');
    expect(buffer.pending).toBe('');
  });

  it('preserves a Mic-E byte that is not printable', () => {
    const buffer = createAprsLineBuffer();
    const chunk = Uint8Array.from([0x60, 0x6b, 0x58, 0x1c, 0x0d]);
    const lines = consumeAprsBytes(buffer, chunk);

    expect(lines[0]?.text.charCodeAt(3)).toBe(0x1c);
    expect(lines[0]?.truncated).toBe(false);
  });

  it('emits an oversized line instead of dropping it', () => {
    const buffer = createAprsLineBuffer();
    const lines = consumeAprsBytes(buffer, bytes('A'.repeat(APRS_PARTIAL_LINE_LIMIT + 5)));

    expect(lines).toHaveLength(1);
    expect(lines[0]?.truncated).toBe(true);
    expect(lines[0]?.text).toHaveLength(APRS_PARTIAL_LINE_LIMIT);
    expect(buffer.pending).toHaveLength(5);
  });
});
