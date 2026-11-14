import { describe, expect, it } from 'vitest';
import { canonicalAx25Call, encodeAx25Ui, formatAx25Call, parseAx25Ui } from '~/utils/aprs-ax25';
import {
  ax25ControlLabel,
  ax25InfoHex,
  ax25InfoText,
  encodeAx25Frame,
  formatAx25Path,
  parseAx25Frame,
  type Ax25UType,
} from '~/utils/packet-ax25';

const me = canonicalAx25Call('KF5UFJ');
const peer = canonicalAx25Call('W1AW-1');
const via = canonicalAx25Call('DIGI');

function required<T>(value: T | undefined): T {
  if (!value) {
    throw new Error('missing');
  }

  return value;
}

describe('AX.25 frame codec', () => {
  it('round-trips an APRS UI frame the host encoder already builds', () => {
    const source = required(canonicalAx25Call('K5KTF-4'));
    const hop = required(canonicalAx25Call('WIDE1-1'));
    const ui = required(encodeAx25Ui(source, '!3031.12NI09752.74W&', [hop]));
    const frame = required(parseAx25Frame(ui));

    expect(parseAx25Ui(ui)?.info).toBe('!3031.12NI09752.74W&');
    expect(frame.uType).toBe('UI');
    expect(frame.cr).toBe('command');
    expect(frame.pid).toBe(0xf0);
    expect(frame.pf).toBe(false);
    expect(formatAx25Call(frame.source)).toBe('K5KTF-4');
    expect(frame.destination.call).toBe('APRS');
    expect(formatAx25Path(frame.path)).toBe('WIDE1-1');
    expect(ax25InfoText(frame.info)).toBe('!3031.12NI09752.74W&');
  });

  it('encodes I frames with N(S), N(R), P, and PID', () => {
    const frame = required(encodeAx25Frame({
      destination: required(peer),
      source: required(me),
      cr: 'command',
      kind: 'I',
      ns: 3,
      nr: 5,
      pf: true,
      info: Uint8Array.from([0x41, 0x0d]),
    }));
    const parsed = required(parseAx25Frame(frame));

    expect(parsed.kind).toBe('I');
    expect(parsed.ns).toBe(3);
    expect(parsed.nr).toBe(5);
    expect(parsed.pf).toBe(true);
    expect(parsed.pid).toBe(0xf0);
    expect(parsed.cr).toBe('command');
    expect(ax25InfoText(parsed.info)).toBe('A\\r');
    expect(ax25InfoHex(parsed.info)).toBe('41 0d');
  });

  it('encodes RR, RNR, REJ, and SREJ with P/F and N(R)', () => {
    for (const [sType, nr, pf, cr] of [
      ['RR', 1, true, 'response'],
      ['RNR', 2, false, 'command'],
      ['REJ', 4, true, 'command'],
      ['SREJ', 6, false, 'response'],
    ] as const) {
      const bytes = required(encodeAx25Frame({
        destination: required(peer),
        source: required(me),
        cr,
        kind: 'S',
        sType,
        nr,
        pf,
      }));
      const parsed = required(parseAx25Frame(bytes));

      expect(parsed.sType).toBe(sType);
      expect(parsed.nr).toBe(nr);
      expect(parsed.pf).toBe(pf);
      expect(parsed.cr).toBe(cr);
      expect(parsed.pid).toBeUndefined();
      expect(parsed.info).toHaveLength(0);
    }
  });

  it('encodes every U frame with and without the P/F bit', () => {
    const types: Ax25UType[] = ['SABM', 'SABME', 'DISC', 'DM', 'UA', 'FRMR', 'UI', 'XID', 'TEST'];

    for (const uType of types) {
      for (const pf of [false, true]) {
        const info = uType === 'TEST' || uType === 'XID' || uType === 'FRMR' || uType === 'UI'
          ? Uint8Array.from([0x11])
          : undefined;
        const bytes = required(encodeAx25Frame({
          destination: required(peer),
          source: required(me),
          cr: uType === 'UA' || uType === 'DM' || uType === 'FRMR' ? 'response' : 'command',
          kind: 'U',
          uType,
          pf,
          info,
        }));
        const parsed = required(parseAx25Frame(bytes));

        expect(parsed.uType).toBe(uType);
        expect(parsed.pf).toBe(pf);
        expect(ax25ControlLabel(parsed)).toBe(uType);
        expect(parsed.info).toEqual(info ?? new Uint8Array());
        expect(parsed.pid === undefined).toBe(uType !== 'UI');
      }
    }
  });

  it('keeps the digipeater H bit off the command bit', () => {
    const repeated = { ...required(via), repeated: true };
    const bytes = required(encodeAx25Frame({
      destination: required(peer),
      source: required(me),
      path: [required(via), repeated],
      cr: 'command',
      kind: 'U',
      uType: 'SABM',
      pf: true,
    }));
    const parsed = required(parseAx25Frame(bytes));

    expect(formatAx25Path(parsed.path)).toBe('DIGI,DIGI*');
    expect(parsed.cr).toBe('command');

    const response = required(parseAx25Frame(required(encodeAx25Frame({
      destination: required(me),
      source: required(peer),
      cr: 'response',
      kind: 'U',
      uType: 'UA',
      pf: true,
    }))));
    expect(response.cr).toBe('response');
  });

  it('uses two control bytes for modulo 128 I and S frames', () => {
    const info = required(encodeAx25Frame({
      destination: required(peer),
      source: required(me),
      cr: 'command',
      modulo: 128,
      kind: 'I',
      ns: 40,
      nr: 90,
      pf: true,
      info: Uint8Array.from([0x58]),
    }));
    const parsed = required(parseAx25Frame(info, { modulo: 128 }));

    expect(parsed.modulo).toBe(128);
    expect(parsed.ns).toBe(40);
    expect(parsed.nr).toBe(90);
    expect(parsed.pf).toBe(true);
    expect(parsed.info).toEqual(Uint8Array.from([0x58]));
    expect(parseAx25Frame(info)?.ns).not.toBe(40);

    const rr = required(parseAx25Frame(required(encodeAx25Frame({
      destination: required(peer),
      source: required(me),
      cr: 'response',
      modulo: 128,
      kind: 'S',
      sType: 'RR',
      nr: 100,
      pf: true,
    })), { modulo: 128 }));
    expect(rr.nr).toBe(100);
    expect(rr.pf).toBe(true);
    expect(rr.sType).toBe('RR');
  });

  it('rejects a truncated frame and a callsign that is not an address', () => {
    expect(parseAx25Frame(Uint8Array.of(0x00, 0x03))).toBeUndefined();
    expect(encodeAx25Frame({
      destination: { call: 'NO', ssid: 0 },
      source: required(me),
      cr: 'command',
      kind: 'U',
      uType: 'SABM',
    })).toBeUndefined();
  });
});
