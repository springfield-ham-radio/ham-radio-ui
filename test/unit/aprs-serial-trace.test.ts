import { describe, expect, it } from 'vitest';
import { canonicalAx25Call, encodeAx25Ui } from '../../app/utils/aprs-ax25.ts';
import { encodeKissData } from '../../app/utils/aprs-kiss.ts';
import {
  APRS_HOST_TRACE_FIXTURE,
  formatTrace,
  formatTraceClock,
  makeTraceLine,
  serialEventHeadline,
  serialTranscript,
} from '../../app/utils/aprs-serial-trace.ts';

const at = Date.UTC(2026, 10, 11, 19, 45, 2);

describe('serial transcript', () => {
  it('shows local hours, not the UTC clock', () => {
    expect(formatTraceClock(at, 'UTC')).toBe('19:45:02');
    expect(formatTraceClock(at, 'America/Chicago')).toBe('13:45:02');
  });

  it('joins command text across chunks and splits on CR/LF', () => {
    const rows = serialTranscript([
      makeTraceLine(at, 'rx', new TextEncoder().encode('DA 110101000000\r\nHB 1200\r\n'), '30 command-text'),
      makeTraceLine(at + 20, 'rx', new TextEncoder().encode('cmd:HBAUD    was 1200\r\ncmd:'), '23 command-text'),
    ], { timeZone: 'America/Chicago' });

    expect(rows.map((row) => row.text)).toEqual([
      'DA 110101000000',
      'HB 1200',
      'cmd:',
      'HBAUD    was 1200',
      'cmd:',
    ]);
    expect(rows.every((row) => row.arrow === '←' && row.time === '13:45:02' && row.hex.length > 0)).toBe(true);
    expect(rows[0]?.hex.startsWith('44 41')).toBe(true);
  });

  it('tags an echo and keeps KISS as one AX.25 line', () => {
    const source = canonicalAx25Call('K5KTF-4');
    const via = canonicalAx25Call('WIDE2-1');
    const ax25 = source && via ? encodeAx25Ui(source, '!3031.12NI09752.74W&K5KTF', [via]) : undefined;

    if (!ax25) {
      throw new Error('frame');
    }

    const rows = serialTranscript([
      makeTraceLine(at, 'tx-command', new TextEncoder().encode('KISS ON\r'), 'KISS ON written once. Plugin accepted 8 bytes. That is kernel acceptance, not a radio echo. Waiting for another cmd: before RESTART.'),
      makeTraceLine(at + 80, 'rx', new TextEncoder().encode('RESTART\r\n'), 'echo of the last write, not a KISS frame, 1 command-text'),
      makeTraceLine(at + 100, 'rx', encodeKissData(ax25), '1 KISS, AX.25 UI'),
      makeTraceLine(at + 100, 'note', new Uint8Array(), 'AX.25 UI seen.'),
      makeTraceLine(at + 200, 'note', new Uint8Array(), 'The TNC is not answering. The radio may not be in PACKET mode. Nothing more was written.'),
    ], { timeZone: 'America/Chicago' });

    expect(rows[0]).toMatchObject({ arrow: '→', text: 'KISS ON', who: 'HamBench' });
    expect(rows[0]?.detail).toContain('kernel acceptance');
    expect(rows[1]).toMatchObject({ arrow: '←', text: 'RESTART', echo: true });
    expect(rows[2]?.text).toBe('K5KTF-4>APRS,WIDE2-1:!3031.12NI09752.74W&K5KTF');
    expect(rows[2]?.echo).toBe(false);
    expect(rows[3]?.text).toBe('KISS confirmed');
    expect(rows[4]?.text).toBe('The TNC is not answering');
    expect(rows[4]?.detail).toContain('PACKET mode');
    expect(formatTrace(rows.length ? [makeTraceLine(at, 'rx', encodeKissData(ax25), '1 KISS')] : [], { timeZone: 'UTC' })).toContain('c0');
  });

  it('copies hex and does not treat the fixture as HTML', () => {
    const copied = formatTrace(APRS_HOST_TRACE_FIXTURE, { timeZone: 'America/Chicago' });
    expect(copied).toContain('13:45:02');
    expect(copied).toContain('44 41');
    expect(copied).toContain('FIXTURE, not from the radio');
    expect(copied).not.toContain('<script>');
    expect(serialEventHeadline('KISS on, waiting for traffic.')).toBe('Waiting for first station to confirm KISS');
    const view = serialTranscript(APRS_HOST_TRACE_FIXTURE, { timeZone: 'America/Chicago' });
    expect(view.some((row) => row.text === 'KISS ON' && row.arrow === '→')).toBe(true);
    expect(view.some((row) => row.echo && row.text === 'KISS ON')).toBe(true);
    expect(view.some((row) => row.text.startsWith('K5KTF-4>APRS,WIDE2-1:'))).toBe(true);
  });

  it('reassembles a KISS frame split across chunks into the decoded line', () => {
    const info = '!3031.12NI09752.74W&K5KTF TX/RX-iGate';
    const address = (call: string, ssid: number, last: boolean, command: boolean): number[] => {
      const bytes = [...call.padEnd(6, ' ')].map((character) => (character.charCodeAt(0) & 0x7f) << 1);
      let ssidByte = 0x60 | ((ssid & 0x0f) << 1);

      if (command) {
        ssidByte |= 0x80;
      }

      if (last) {
        ssidByte |= 0x01;
      }

      bytes.push(ssidByte);
      return bytes;
    };
    const ax25 = Uint8Array.from([
      ...address('APRX29', 0, false, true),
      ...address('K5KTF', 4, true, false),
      0x03,
      0xf0,
      ...[...info].map((character) => character.charCodeAt(0)),
    ]);
    const kiss = encodeKissData(ax25);
    const split = 8;
    const rows = serialTranscript([
      makeTraceLine(at + 1000, 'rx', kiss.subarray(0, split), 'incomplete, 8 held'),
      makeTraceLine(at + 1030, 'rx', kiss.subarray(split), '1 KISS, AX.25 UI'),
    ], { timeZone: 'America/Chicago' });

    expect(rows.map((row) => row.text)).toEqual(['K5KTF-4>APRX29:!3031.12NI09752.74W&K5KTF TX/RX-iGate']);
    expect(rows[0]?.text.includes('\\x')).toBe(false);
    expect(rows[0]?.arrow).toBe('←');
  });

  it('joins a split echo of KISS ON and shows the write first', () => {
    const written = new TextEncoder().encode('KISS ON\r');
    const rows = serialTranscript([
      makeTraceLine(at, 'tx-command', written, 'KISS ON written once. Plugin accepted 8 bytes. That is kernel acceptance, not a radio echo.'),
      makeTraceLine(at + 10, 'rx', written.subarray(0, 4), '4 command-text'),
      makeTraceLine(at + 15, 'note', new Uint8Array(), 'Listening for a KISS frame or command text.'),
      makeTraceLine(at + 20, 'rx', written.subarray(4), '4 command-text'),
    ], { timeZone: 'America/Chicago' });

    expect(rows.map((row) => ({ arrow: row.arrow, text: row.text, echo: row.echo }))).toEqual([
      { arrow: '→', text: 'KISS ON', echo: false },
      { arrow: '·', text: 'Listening', echo: false },
      { arrow: '←', text: 'KISS ON', echo: true },
    ]);
    expect(rows.findIndex((row) => row.arrow === '→')).toBeLessThan(rows.findIndex((row) => row.echo));
  });

  it('copies a write before the echo that was logged first, and tags that echo', () => {
    const written = new TextEncoder().encode('KISS ON\r');
    const lines = [
      makeTraceLine(at, 'rx', written, '8 command-text'),
      makeTraceLine(at, 'rx', Uint8Array.of(0x0a), '1 command-text'),
      makeTraceLine(at, 'rx', new TextEncoder().encode('KIS'), '3 command-text'),
      makeTraceLine(at, 'tx-command', written, 'KISS ON written once. Plugin accepted 8 bytes. That is kernel acceptance, not a radio echo.'),
      makeTraceLine(at + 1000, 'tx-command', new TextEncoder().encode('RESTART\r'), 'RESTART written once after cmd:. KISS unconfirmed.'),
      makeTraceLine(at + 1000, 'rx', new TextEncoder().encode('RESTART\r\n'), 'echo of the last write, not a KISS frame, 1 command-text'),
    ];
    const copied = formatTrace(lines, { timeZone: 'UTC' }).split('\n');
    const tx = copied.findIndex((row) => row.includes('TX-COMMAND') && row.includes('KISS ON\\r'));
    const echo = copied.findIndex((row) => row.includes('RX') && row.includes('KISS ON\\r'));
    const newline = copied.findIndex((row) => row.includes('RX') && row.includes('\\n'));
    const partial = copied.findIndex((row) => row.includes('KIS') && !row.includes('KISS'));
    const restart = copied.findIndex((row) => row.includes('TX-COMMAND') && row.includes('RESTART\\r'));
    const restartEcho = copied.findIndex((row) => row.includes('RX') && row.includes('RESTART\\r\\n'));

    expect(tx).toBe(0);
    expect(echo).toBeGreaterThan(tx);
    expect(newline).toBeGreaterThan(echo);
    expect(partial).toBeGreaterThan(newline);
    expect(restart).toBeGreaterThan(partial);
    expect(restartEcho).toBeGreaterThan(restart);
    expect(copied[echo]).toContain('4b 49 53 53 20 4f 4e 0d');
    expect(copied[echo]).toContain('8 command-text');
    expect(copied[echo]).toContain('echo of the last write');
    expect(copied[echo]).not.toContain('echo of the last write, echo of the last write');
    expect(copied[newline]).toContain('0a');
    expect(copied[newline]).toContain('1 command-text');
    expect(copied[newline]).toContain('echo of the last write');
    expect(copied[partial]).toContain('3 command-text');
    expect(copied[partial]).not.toContain('echo of the last write');
    expect(copied[restartEcho]).toContain('echo of the last write, not a KISS frame');
    expect(copied[restartEcho]).not.toContain('echo of the last write, echo of the last write');

    const view = serialTranscript(lines, { timeZone: 'UTC' });
    const writeRow = view.findIndex((row) => row.arrow === '→' && row.text === 'KISS ON');
    const echoRow = view.findIndex((row) => row.echo && row.text === 'KISS ON');

    expect(writeRow).toBeGreaterThanOrEqual(0);
    expect(echoRow).toBeGreaterThan(writeRow);
  });

  it('flushes a partial monitor line before KISS ON and splits at cmd:', () => {
    const monitor = new TextEncoder().encode('cmd:K5KTF-4>APRX29:>APRX on ... -- No Windoze');
    const written = new TextEncoder().encode('KISS ON\r');
    const rows = serialTranscript([
      makeTraceLine(at, 'rx', monitor, 'startup banner, no CR'),
      makeTraceLine(at + 10, 'tx-command', written, 'KISS ON written once. Plugin accepted 8 bytes. That is kernel acceptance, not a radio echo.'),
      makeTraceLine(at + 20, 'rx', written, '8 command-text'),
    ], { timeZone: 'America/Chicago' });

    expect(rows.map((row) => ({ arrow: row.arrow, text: row.text, echo: row.echo, detail: row.detail }))).toEqual([
      { arrow: '←', text: 'cmd:', echo: false, detail: undefined },
      { arrow: '←', text: 'K5KTF-4>APRX29:>APRX on ... -- No Windoze', echo: false, detail: undefined },
      { arrow: '→', text: 'KISS ON', echo: false, detail: 'KISS ON written once. Plugin accepted 8 bytes. That is kernel acceptance, not a radio echo.' },
      { arrow: '←', text: 'KISS ON', echo: true, detail: undefined },
    ]);
  });

  it('reassembles a KISS ON echo split before the write and keeps the TNC response', () => {
    const stream = new TextEncoder().encode('KISS ON\r\nKISS     was OFF\r\n');
    const written = new TextEncoder().encode('KISS ON\r');
    const rows = serialTranscript([
      makeTraceLine(at, 'rx', stream.subarray(0, 3), '3 command-text'),
      makeTraceLine(at + 5, 'tx-command', written, 'KISS ON written once. Plugin accepted 8 bytes.'),
      makeTraceLine(at + 10, 'rx', stream.subarray(3), 'command-text'),
    ], { timeZone: 'America/Chicago' });

    expect(rows.map((row) => ({ arrow: row.arrow, text: row.text, echo: row.echo }))).toEqual([
      { arrow: '→', text: 'KISS ON', echo: false },
      { arrow: '←', text: 'KISS ON', echo: true },
      { arrow: '←', text: 'KISS     was OFF', echo: false },
    ]);
    expect(rows.every((row) => row.detail === undefined)).toBe(true);
  });

  it('does not glue a split KISS ON echo onto a partial monitor line', () => {
    const monitor = new TextEncoder().encode('cmd:K5KTF-4>APRX29:>APRX on ... -- No Windoze');
    const stream = new TextEncoder().encode('KISS ON\r\nKISS     was OFF\r\n');
    const written = new TextEncoder().encode('KISS ON\r');
    const rows = serialTranscript([
      makeTraceLine(at, 'rx', monitor, 'startup banner, no CR'),
      makeTraceLine(at + 5, 'rx', stream.subarray(0, 3), '3 command-text'),
      makeTraceLine(at + 6, 'tx-command', written, 'KISS ON written once. Plugin accepted 8 bytes.'),
      makeTraceLine(at + 10, 'rx', stream.subarray(3), 'command-text'),
    ], { timeZone: 'America/Chicago' });

    expect(rows.map((row) => ({ arrow: row.arrow, text: row.text, echo: row.echo }))).toEqual([
      { arrow: '←', text: 'cmd:', echo: false },
      { arrow: '←', text: 'K5KTF-4>APRX29:>APRX on ... -- No Windoze', echo: false },
      { arrow: '→', text: 'KISS ON', echo: false },
      { arrow: '←', text: 'KISS ON', echo: true },
      { arrow: '←', text: 'KISS     was OFF', echo: false },
    ]);
  });

  it('still splits that echo when an earlier write was not echoed', () => {
    const monitor = new TextEncoder().encode('cmd:K5KTF-4>APRX29:>APRX on ... -- No Windoze');
    const stream = new TextEncoder().encode('KISS ON\r\nKISS     was OFF\r\n');
    const rows = serialTranscript([
      makeTraceLine(at, 'tx-command', new TextEncoder().encode('RESTART\r'), 'RESTART written once after cmd:. KISS unconfirmed. This is not repeated. KISS on, waiting for traffic.'),
      makeTraceLine(at + 1, 'rx', monitor, 'startup banner, no CR'),
      makeTraceLine(at + 2, 'rx', stream.subarray(0, 3), '3 command-text'),
      makeTraceLine(at + 3, 'tx-command', new TextEncoder().encode('KISS ON\r'), 'KISS ON written once. Plugin accepted 8 bytes.'),
      makeTraceLine(at + 4, 'rx', stream.subarray(3), 'command-text'),
    ], { timeZone: 'America/Chicago' });

    expect(rows.map((row) => ({ arrow: row.arrow, text: row.text, echo: row.echo }))).toEqual([
      { arrow: '→', text: 'RESTART', echo: false },
      { arrow: '←', text: 'cmd:', echo: false },
      { arrow: '←', text: 'K5KTF-4>APRX29:>APRX on ... -- No Windoze', echo: false },
      { arrow: '→', text: 'KISS ON', echo: false },
      { arrow: '←', text: 'KISS ON', echo: true },
      { arrow: '←', text: 'KISS     was OFF', echo: false },
    ]);
  });
});
