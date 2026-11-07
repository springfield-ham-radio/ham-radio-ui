import { describe, expect, it } from 'vitest';
import { canonicalAx25Call, encodeAx25Ui, parseAx25Ui } from '../../app/utils/aprs-ax25.ts';
import {
  createKissDecoderState,
  encodeKissData,
  KISS_FEND,
  KISS_FESC,
  KISS_MAX_FRAME_BYTES,
  pushKissBytes,
} from '../../app/utils/aprs-kiss.ts';
import { encodeAprsMessageFrame, formatAprsMessage, parseAprsMessage, parseAprsMessageFrame } from '../../app/utils/aprs-message.ts';

describe('KISS framing', () => {
  it('round-trips a payload that contains frame and escape bytes', () => {
    const payload = Uint8Array.from([0x00, KISS_FEND, 0x11, KISS_FESC, 0x22]);
    const encoded = encodeKissData(payload);
    const decoded = pushKissBytes(createKissDecoderState(), encoded);

    expect(encoded[0]).toBe(KISS_FEND);
    expect(encoded.at(-1)).toBe(KISS_FEND);
    expect(decoded.frames).toEqual([{ command: 0, data: payload }]);
    expect(decoded.ignored).toBe(0);
  });

  it('accepts a frame split across chunks and ignores text before the first FEND', () => {
    const encoded = encodeKissData(Uint8Array.from([1, 2, 3]));
    const state = createKissDecoderState();
    const lead = pushKissBytes(state, Uint8Array.from([...'cmd:'.slice(0, 4)].map((character) => character.charCodeAt(0))));
    const first = pushKissBytes(state, encoded.subarray(0, 3));
    const second = pushKissBytes(state, encoded.subarray(3));

    expect(lead.frames).toEqual([]);
    expect(lead.ignored).toBe(4);
    expect(first.frames).toEqual([]);
    expect(second.frames[0]?.data).toEqual(Uint8Array.from([1, 2, 3]));
  });

  it('drops a partial frame that passes the 4 kB cap and keeps the next frame', () => {
    const state = createKissDecoderState();
    const flood = new Uint8Array(KISS_MAX_FRAME_BYTES + 2);
    flood[0] = KISS_FEND;
    flood.fill(1, 1);
    const overflow = pushKissBytes(state, flood);
    const next = pushKissBytes(state, encodeKissData(Uint8Array.from([9])));

    expect(overflow.overflow).toBe(1);
    expect(overflow.frames).toEqual([]);
    expect(next.frames[0]?.data).toEqual(Uint8Array.from([9]));
  });

  it('does not treat a non-data command as a payload we would answer', () => {
    const state = createKissDecoderState();
    const decoded = pushKissBytes(state, Uint8Array.from([KISS_FEND, 0xff, KISS_FEND]));

    expect(decoded.frames).toEqual([{ command: 0xff, data: new Uint8Array() }]);
    expect(parseAprsMessageFrame(decoded.frames[0]?.data ?? new Uint8Array())).toBeUndefined();
  });
});

describe('AX.25 APRS messages', () => {
  it('builds a UI message and reads it back', () => {
    const source = canonicalAx25Call('N0TST-1');
    const info = formatAprsMessage({ addressee: 'K5KTF-4', kind: 'text', text: 'Hello', id: 'A1' });
    const frame = source && info ? encodeAx25Ui(source, info) : undefined;
    const parsed = frame ? parseAx25Ui(frame) : undefined;

    expect(info).toBe(':K5KTF-4  :Hello{A1');
    expect(frame?.[14]).toBe(0x03);
    expect(frame?.[15]).toBe(0xf0);
    expect(parsed?.info).toBe(info);
    expect(parsed?.source.call).toBe('N0TST');
    expect(parsed?.source.ssid).toBe(1);
    expect(parsed?.path).toEqual([]);
  });

  it('rejects a connected-mode control field and a short frame', () => {
    const source = canonicalAx25Call('N0TST');
    const info = formatAprsMessage({ addressee: 'K5KTF', kind: 'text', text: 'Hi', id: '1' });
    const frame = source && info ? encodeAx25Ui(source, info) : undefined;

    expect(frame).toBeDefined();

    if (!frame) {
      return;
    }

    const connected = Uint8Array.from(frame);
    connected[14] = 0x00;
    expect(parseAx25Ui(connected)).toBeUndefined();
    expect(parseAx25Ui(frame.subarray(0, 10))).toBeUndefined();
  });

  it('pads the addressee to 9 characters and keeps the text within 67', () => {
    expect(formatAprsMessage({ addressee: 'K5KTF', kind: 'text', text: 'Hi', id: '1' })).toBe(':K5KTF    :Hi{1');
    expect(formatAprsMessage({ addressee: 'K5KTF', kind: 'ack', id: '1', text: '1' })).toBe(':K5KTF    :ack1');
    expect(formatAprsMessage({ addressee: '1BAD', kind: 'text', text: 'Hi' })).toBeUndefined();
    expect(formatAprsMessage({ addressee: 'K5KTF', kind: 'text', text: 'x'.repeat(68) })).toBeUndefined();
    expect(formatAprsMessage({ addressee: 'K5KTF', kind: 'text', text: 'has { brace' })).toBeUndefined();
    expect(parseAprsMessage(':K5KTF    :Hello{A1')).toEqual({
      addressee: 'K5KTF',
      kind: 'text',
      text: 'Hello',
      id: 'A1',
    });
  });

  it('wraps the message in a KISS data frame', () => {
    const source = canonicalAx25Call('N0TST');
    const frame = source
      ? encodeAprsMessageFrame(source, { addressee: 'K5KTF-4', kind: 'text', text: 'Hello', id: '1' })
      : undefined;
    const decoded = frame ? pushKissBytes(createKissDecoderState(), frame) : undefined;
    const message = decoded?.frames[0] ? parseAprsMessageFrame(decoded.frames[0].data) : undefined;

    expect(frame?.[1]).toBe(0);
    expect(message).toEqual({
      source: 'N0TST',
      body: { addressee: 'K5KTF-4', kind: 'text', text: 'Hello', id: '1' },
    });
    expect(Buffer.from(frame ?? []).toString('latin1')).not.toContain('KISS');
    expect(Buffer.from(frame ?? []).toString('latin1')).not.toContain('RESTART');
  });
});
