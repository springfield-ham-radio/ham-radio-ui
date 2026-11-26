import { describe, expect, it } from 'vitest';
import { canonicalAx25Call, type Ax25Call } from '~/utils/aprs-ax25';
import { encodeAx25Frame, parseAx25Frame } from '~/utils/packet-ax25';
import {
  createPacketCardMux,
  packetMuxBuildParams,
  receiveOnPacketCardMux,
  samePacketMuxBuild,
} from '~/utils/packet-card-session';
import { PACKET_DEFAULT_SETTINGS } from '~/utils/packet-settings';

function call(text: string): Ax25Call {
  const parsed = canonicalAx25Call(text);

  if (!parsed) {
    throw new Error(text);
  }

  return parsed;
}

describe('packet card mux without connectLink', () => {
  it('answers UA to SABM addressed to its MYCALL when accept is on', () => {
    const mux = createPacketCardMux(call('KF5UFJ-8'), { ...PACKET_DEFAULT_SETTINGS, acceptIncoming: true });
    const sabm = encodeAx25Frame({
      destination: call('KF5UFJ-8'),
      source: call('KF5UFJ-7'),
      cr: 'command',
      kind: 'U',
      uType: 'SABM',
      pf: true,
    });
    const step = receiveOnPacketCardMux(mux, sabm ?? new Uint8Array());
    expect(step.frames).toHaveLength(1);
    expect(parseAx25Frame(step.frames[0] ?? new Uint8Array())?.uType).toBe('UA');
  });

  it('ignores SABM for another callsign and when accept is off', () => {
    const on = createPacketCardMux(call('KF5UFJ-8'), { ...PACKET_DEFAULT_SETTINGS, acceptIncoming: true });
    const off = createPacketCardMux(call('KF5UFJ-8'), { ...PACKET_DEFAULT_SETTINGS, acceptIncoming: false });
    const wrong = encodeAx25Frame({
      destination: call('KF5UFJ-7'),
      source: call('KF5UFJ-8'),
      cr: 'command',
      kind: 'U',
      uType: 'SABM',
      pf: true,
    });
    const right = encodeAx25Frame({
      destination: call('KF5UFJ-8'),
      source: call('KF5UFJ-7'),
      cr: 'command',
      kind: 'U',
      uType: 'SABM',
      pf: true,
    });

    expect(receiveOnPacketCardMux(on, wrong ?? new Uint8Array()).frames).toEqual([]);
    const ignored = receiveOnPacketCardMux(off, right ?? new Uint8Array());
    expect(ignored.frames).toEqual([]);
    expect(ignored.notices.map((notice) => notice.text).join(' ')).toMatch(/Accept incoming connections is off/u);
  });
});

describe('packet mux build fingerprint', () => {
  it('detects timer and modulo changes', () => {
    const me = call('N0TST-0');
    const base = packetMuxBuildParams(me, PACKET_DEFAULT_SETTINGS);
    const slower = packetMuxBuildParams(me, { ...PACKET_DEFAULT_SETTINGS, t1Ms: 4000 });
    const modulo128 = packetMuxBuildParams(me, { ...PACKET_DEFAULT_SETTINGS, modulo: 128 });
    expect(samePacketMuxBuild(base, base)).toBe(true);
    expect(samePacketMuxBuild(base, slower)).toBe(false);
    expect(samePacketMuxBuild(base, modulo128)).toBe(false);
  });
});