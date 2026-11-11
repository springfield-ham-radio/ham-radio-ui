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
      'cmd:HBAUD    was 1200',
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
    expect(rows[2]?.text).toBe('K5KTF-4>APRS,WIDE2-1: !3031.12NI09752.74W&K5KTF');
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
});
