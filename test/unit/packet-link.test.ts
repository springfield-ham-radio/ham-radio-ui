import { describe, expect, it } from 'vitest';
import { canonicalAx25Call, type Ax25Call } from '~/utils/aprs-ax25';
import { encodeAx25Frame, parseAx25Frame, type Ax25Frame } from '~/utils/packet-ax25';
import { createPacketLink, createPacketMux, type PacketLink } from '~/utils/packet-link';

function call(text: string): Ax25Call {
  const parsed = canonicalAx25Call(text);

  if (!parsed) {
    throw new Error(text);
  }

  return parsed;
}

function clock() {
  let t = 0;

  return {
    now: () => t,
    set(next: number) {
      t = next;
    },
  };
}

function link(me: string, options?: { accept?: boolean; modulo?: 8 | 128; paclen?: number; maxframe?: number; t1Ms?: number; t3Ms?: number; n2?: number; time?: { now: () => number } }) {
  return createPacketLink({
    me: call(me),
    acceptIncoming: options?.accept === true,
    modulo: options?.modulo,
    paclen: options?.paclen,
    maxframe: options?.maxframe,
    t1Ms: options?.t1Ms ?? 1000,
    t3Ms: options?.t3Ms ?? 5000,
    n2: options?.n2 ?? 3,
    now: options?.time?.now ?? (() => 0),
  });
}

function deliver(target: PacketLink, frames: Uint8Array[]) {
  const out: Uint8Array[] = [];
  const notes: string[] = [];

  for (const frame of frames) {
    const step = target.receive(frame);
    out.push(...step.frames);
    notes.push(...step.notices.map((notice) => notice.text));
  }

  return { frames: out, notes };
}

function parsed(frame: Uint8Array, modulo: 8 | 128 = 8): Ax25Frame {
  const frameParsed = parseAx25Frame(frame, { modulo });

  if (!frameParsed) {
    throw new Error('frame');
  }

  return frameParsed;
}

describe('AX.25 link', () => {
  it('stays silent until connect, then completes SABM/UA with a mock peer', () => {
    const left = link('KF5UFJ');
    const right = link('W1AW-1', { accept: true });

    expect(left.tick(60_000).frames).toEqual([]);
    const sabm = left.connect({ call: call('W1AW-1'), path: [] });
    expect(parsed(sabm.frames[0] ?? new Uint8Array()).uType).toBe('SABM');
    expect(parsed(sabm.frames[0] ?? new Uint8Array()).pf).toBe(true);
    expect(parsed(sabm.frames[0] ?? new Uint8Array()).cr).toBe('command');

    const ua = deliver(right, sabm.frames);
    expect(parsed(ua.frames[0] ?? new Uint8Array()).uType).toBe('UA');
    expect(parsed(ua.frames[0] ?? new Uint8Array()).cr).toBe('response');
    expect(right.snapshot().phase).toBe('connected');

    const done = deliver(left, ua.frames);
    expect(done.frames).toEqual([]);
    expect(left.snapshot().phase).toBe('connected');
    expect(left.snapshot().vs).toBe(0);
    expect(left.snapshot().vr).toBe(0);
    expect(left.tick(4000).frames).toEqual([]);
  });

  it('retries SABM up to N2 and then stops', () => {
    const time = clock();
    const left = link('KF5UFJ', { time, n2: 3, t1Ms: 1000 });
    const first = left.connect({ call: call('W1AW'), path: [] });
    expect(first.frames).toHaveLength(1);

    time.set(1000);
    expect(left.tick(1000).frames).toHaveLength(1);
    time.set(2000);
    expect(left.tick(2000).frames).toHaveLength(1);
    time.set(3000);
    const failed = left.tick(3000);
    expect(failed.frames).toEqual([]);
    expect(failed.notices.map((notice) => notice.text).join(' ')).toMatch(/failed after 3/);
    expect(left.snapshot().phase).toBe('disconnected');
    expect(left.snapshot().t1).toBe(false);
    expect(left.tick(20_000).frames).toEqual([]);
  });

  it('clears a refused connect on DM and does not poll', () => {
    const left = link('KF5UFJ');
    left.connect({ call: call('W1AW'), path: [] });
    const dm = encodeAx25Frame({
      destination: call('KF5UFJ'),
      source: call('W1AW'),
      cr: 'response',
      kind: 'U',
      uType: 'DM',
      pf: true,
    });
    const step = left.receive(dm ?? new Uint8Array());

    expect(step.frames).toEqual([]);
    expect(left.snapshot().phase).toBe('disconnected');
    expect(left.tick(10_000).frames).toEqual([]);
  });

  it('exchanges I frames, acks with RR, and splits on paclen', () => {
    const left = link('KF5UFJ', { paclen: 4, maxframe: 7 });
    const right = link('W1AW', { accept: true, paclen: 4, maxframe: 7 });
    const ua = deliver(right, left.connect({ call: call('W1AW'), path: [] }).frames);
    deliver(left, ua.frames);

    const payload = Uint8Array.from([...'ABCDEFGH\r'].map((character) => character.charCodeAt(0)));
    const sent = left.send(payload);
    expect(sent.frames).toHaveLength(3);
    expect(sent.frames.map((frame) => parsed(frame).ns)).toEqual([0, 1, 2]);
    expect(parsed(sent.frames[0] ?? new Uint8Array()).info).toEqual(payload.slice(0, 4));

    const acks = deliver(right, sent.frames);
    expect(acks.notes.join('')).toContain('ABCDEFGH\r');
    expect(acks.frames.map((frame) => parsed(frame).sType)).toEqual(['RR', 'RR', 'RR']);
    expect(parsed(acks.frames[2] ?? new Uint8Array()).nr).toBe(3);

    deliver(left, acks.frames);
    expect(left.snapshot().unacked).toBe(0);
    expect(left.snapshot().va).toBe(3);
  });

  it('holds I frames beyond maxframe until RR', () => {
    const left = link('KF5UFJ', { paclen: 4, maxframe: 1 });
    const right = link('W1AW', { accept: true });
    deliver(left, deliver(right, left.connect({ call: call('W1AW'), path: [] }).frames).frames);
    const sent = left.send(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]));

    expect(sent.frames).toHaveLength(1);
    expect(left.snapshot().queued).toBe(1);

    const rr = deliver(right, sent.frames);
    const more = deliver(left, rr.frames);
    expect(more.frames).toHaveLength(1);
    expect(parsed(more.frames[0] ?? new Uint8Array()).ns).toBe(1);
    expect(left.snapshot().queued).toBe(0);
  });

  it('stops I frames on RNR and resumes on RR', () => {
    const left = link('KF5UFJ');
    const right = link('W1AW', { accept: true });
    deliver(left, deliver(right, left.connect({ call: call('W1AW'), path: [] }).frames).frames);
    const rnr = encodeAx25Frame({
      destination: call('KF5UFJ'),
      source: call('W1AW'),
      cr: 'command',
      kind: 'S',
      sType: 'RNR',
      nr: 0,
    });
    expect(left.receive(rnr ?? new Uint8Array()).notices.map((notice) => notice.text).join(' ')).toMatch(/busy/);
    const held = left.send(Uint8Array.from([0x41, 0x0d]));
    expect(held.frames).toEqual([]);
    expect(left.snapshot().queued).toBe(1);

    const rr = encodeAx25Frame({
      destination: call('KF5UFJ'),
      source: call('W1AW'),
      cr: 'command',
      kind: 'S',
      sType: 'RR',
      nr: 0,
    });
    const resumed = left.receive(rr ?? new Uint8Array());
    expect(resumed.frames).toHaveLength(1);
    expect(parsed(resumed.frames[0] ?? new Uint8Array()).kind).toBe('I');
  });

  it('retransmits from REJ and only the named frame for SREJ', () => {
    const left = link('KF5UFJ', { paclen: 1, maxframe: 4 });
    const right = link('W1AW', { accept: true });
    deliver(left, deliver(right, left.connect({ call: call('W1AW'), path: [] }).frames).frames);
    const sent = left.send(Uint8Array.from([0x41, 0x42]));
    expect(sent.frames).toHaveLength(2);

    const rej = encodeAx25Frame({
      destination: call('KF5UFJ'),
      source: call('W1AW'),
      cr: 'command',
      kind: 'S',
      sType: 'REJ',
      nr: 0,
    });
    const again = left.receive(rej ?? new Uint8Array());
    expect(again.frames.map((frame) => parsed(frame).ns)).toEqual([0, 1]);

    const srej = encodeAx25Frame({
      destination: call('KF5UFJ'),
      source: call('W1AW'),
      cr: 'command',
      kind: 'S',
      sType: 'SREJ',
      nr: 1,
    });
    const one = left.receive(srej ?? new Uint8Array());
    expect(one.frames.map((frame) => parsed(frame).ns)).toEqual([1]);
  });

  it('polls with RR on T3 and answers the checkpoint', () => {
    const time = clock();
    const left = link('KF5UFJ', { time, t3Ms: 5000, t1Ms: 1000 });
    const right = link('W1AW', { accept: true, time });
    deliver(left, deliver(right, left.connect({ call: call('W1AW'), path: [] }).frames).frames);

    time.set(4999);
    expect(left.tick(4999).frames).toEqual([]);
    time.set(5000);
    const poll = left.tick(5000);
    expect(parsed(poll.frames[0] ?? new Uint8Array()).sType).toBe('RR');
    expect(parsed(poll.frames[0] ?? new Uint8Array()).pf).toBe(true);

    const answer = deliver(right, poll.frames);
    expect(parsed(answer.frames[0] ?? new Uint8Array()).cr).toBe('response');
    expect(parsed(answer.frames[0] ?? new Uint8Array()).pf).toBe(true);
    deliver(left, answer.frames);
    time.set(9999);
    expect(left.tick(9999).frames).toEqual([]);
  });

  it('disconnects with DISC/UA and a once-only DISC stops the timers', () => {
    const left = link('KF5UFJ');
    const right = link('W1AW', { accept: true });
    deliver(left, deliver(right, left.connect({ call: call('W1AW'), path: [] }).frames).frames);
    const disc = left.disconnect();
    expect(parsed(disc.frames[0] ?? new Uint8Array()).uType).toBe('DISC');
    const ua = deliver(right, disc.frames);
    expect(right.snapshot().phase).toBe('disconnected');
    expect(parsed(ua.frames[0] ?? new Uint8Array()).uType).toBe('UA');
    deliver(left, ua.frames);
    expect(left.snapshot().phase).toBe('disconnected');
    expect(left.tick(30_000).frames).toEqual([]);

    const again = link('KF5UFJ');
    const peer = link('W1AW', { accept: true });
    deliver(again, deliver(peer, again.connect({ call: call('W1AW'), path: [] }).frames).frames);
    const once = again.disconnect(true);
    expect(once.frames).toHaveLength(1);
    expect(again.snapshot().phase).toBe('disconnected');
    expect(again.snapshot().t1).toBe(false);
    expect(again.tick(10_000).frames).toEqual([]);
  });

  it('ignores an incoming SABM unless accept is on', () => {
    const quiet = link('KF5UFJ');
    const caller = link('W1AW');
    const sabm = caller.connect({ call: call('KF5UFJ'), path: [] });
    const ignored = deliver(quiet, sabm.frames);

    expect(ignored.frames).toEqual([]);
    expect(ignored.notes.join(' ')).toMatch(/Accept incoming connections is off/);
    expect(quiet.snapshot().phase).toBe('disconnected');

    const open = link('KF5UFJ', { accept: true });
    const answered = deliver(open, sabm.frames);
    expect(parsed(answered.frames[0] ?? new Uint8Array()).uType).toBe('UA');
    expect(open.snapshot().phase).toBe('connected');
  });

  it('ignores UI, frames for someone else, and a path that has not been repeated', () => {
    const left = link('KF5UFJ');
    const right = link('W1AW', { accept: true });
    deliver(left, deliver(right, left.connect({ call: call('W1AW'), path: [] }).frames).frames);
    expect(left.connect({ call: call('N0CALL'), path: [] }).frames).toEqual([]);

    const ui = encodeAx25Frame({
      destination: call('KF5UFJ'),
      source: call('W1AW'),
      cr: 'command',
      kind: 'U',
      uType: 'UI',
      info: Uint8Array.from([0x41]),
    });
    expect(left.receive(ui ?? new Uint8Array()).frames).toEqual([]);

    const other = encodeAx25Frame({
      destination: call('N0CALL'),
      source: call('W1AW'),
      cr: 'command',
      kind: 'I',
      ns: 0,
      nr: 0,
      info: Uint8Array.from([0x41]),
    });
    expect(left.receive(other ?? new Uint8Array()).frames).toEqual([]);

    const early = encodeAx25Frame({
      destination: call('KF5UFJ'),
      source: call('W1AW'),
      path: [call('DIGI')],
      cr: 'command',
      kind: 'I',
      ns: 0,
      nr: 0,
      info: Uint8Array.from([0x41]),
    });
    expect(left.receive(early ?? new Uint8Array()).frames).toEqual([]);
  });

  it('puts the requested digipeater on SABM', () => {
    const left = link('KF5UFJ');
    const sabm = left.connect({ call: call('W1AW'), path: [call('DIGI')] });
    const frame = parsed(sabm.frames[0] ?? new Uint8Array());

    expect(frame.path.map((hop) => hop.call)).toEqual(['DIGI']);
    expect(frame.path[0]?.repeated).toBe(false);
  });

  it('uses SABME and modulo 128 sequence numbers when asked', () => {
    const left = link('KF5UFJ', { modulo: 128, paclen: 8 });
    const right = link('W1AW', { modulo: 128, accept: true });
    const sabme = left.connect({ call: call('W1AW'), path: [] });
    expect(parsed(sabme.frames[0] ?? new Uint8Array(), 128).uType).toBe('SABME');
    const ua = deliver(right, sabme.frames);
    deliver(left, ua.frames);
    const sent = left.send(Uint8Array.from([0x48, 0x69, 0x0d]));
    expect(parsed(sent.frames[0] ?? new Uint8Array(), 128).ns).toBe(0);
    expect(parsed(sent.frames[0] ?? new Uint8Array(), 128).modulo).toBe(128);
    const ack = deliver(right, sent.frames);
    expect(ack.notes.join('')).toContain('Hi\r');
  });

  it('gives a second peer its own link and keeps the first session data apart', () => {
    const time = clock();
    const mux = createPacketMux({
      me: call('KF5UFJ'),
      acceptIncoming: true,
      t1Ms: 1000,
      t3Ms: 10_000,
      n2: 3,
      now: time.now,
    });
    const w1aw = link('W1AW', { accept: true, time });
    const first = mux.connect({ call: call('W1AW'), path: [] });
    const opened = w1aw.receive(first.frames[0] ?? new Uint8Array());
    expect(mux.receive(opened.frames[0] ?? new Uint8Array()).notices.map((notice) => notice.text).join(' ')).toMatch(/Connected/);
    const blocked = mux.connect({ call: call('N0CALL'), path: [] });
    expect(blocked.error).toMatch(/already open/);

    const secondPeer = link('N0CALL');
    const incoming = secondPeer.connect({ call: call('KF5UFJ'), path: [] });
    const accepted = mux.receive(incoming.frames[0] ?? new Uint8Array());
    expect(parsed(accepted.frames[0] ?? new Uint8Array()).uType).toBe('UA');
    expect(mux.snapshots().filter((item) => item.phase === 'connected')).toHaveLength(2);
    expect(mux.snapshots()).toHaveLength(2);

    const mine = encodeAx25Frame({
      destination: call('KF5UFJ'),
      source: call('W1AW'),
      cr: 'command',
      kind: 'I',
      ns: 0,
      nr: 0,
      info: Uint8Array.from([...'one\r'].map((character) => character.charCodeAt(0))),
    });
    const heard = mux.receive(mine ?? new Uint8Array());
    expect(heard.notices.map((notice) => notice.text).join('')).toContain('one\r');
    expect(heard.notices.map((notice) => notice.text).join('')).not.toContain('two');
  });

  it('sends DISC for every open link when the tab closes', () => {
    const mux = createPacketMux({
      me: call('KF5UFJ'),
      acceptIncoming: true,
      now: () => 0,
    });
    const caller = link('W1AW');
    mux.receive(caller.connect({ call: call('KF5UFJ'), path: [] }).frames[0] ?? new Uint8Array());
    const closed = mux.disconnectAll(true);

    expect(closed.frames).toHaveLength(1);
    expect(parsed(closed.frames[0] ?? new Uint8Array()).uType).toBe('DISC');
    expect(mux.snapshots().every((item) => item.phase === 'disconnected')).toBe(true);
    expect(mux.tick(60_000).frames).toEqual([]);
  });

  it('answers DISC with UA and sends DISC after FRMR', () => {
    const left = link('KF5UFJ');
    const right = link('W1AW', { accept: true });
    deliver(left, deliver(right, left.connect({ call: call('W1AW'), path: [] }).frames).frames);
    const disc = encodeAx25Frame({
      destination: call('KF5UFJ'),
      source: call('W1AW'),
      cr: 'command',
      kind: 'U',
      uType: 'DISC',
      pf: true,
    });
    const ua = left.receive(disc ?? new Uint8Array());
    expect(parsed(ua.frames[0] ?? new Uint8Array()).uType).toBe('UA');
    expect(left.snapshot().phase).toBe('disconnected');

    const next = link('KF5UFJ');
    const peer = link('W1AW', { accept: true });
    deliver(next, deliver(peer, next.connect({ call: call('W1AW'), path: [] }).frames).frames);
    const frmr = encodeAx25Frame({
      destination: call('KF5UFJ'),
      source: call('W1AW'),
      cr: 'response',
      kind: 'U',
      uType: 'FRMR',
      info: Uint8Array.from([0x00, 0x00, 0x00]),
    });
    const reply = next.receive(frmr ?? new Uint8Array());
    expect(parsed(reply.frames[0] ?? new Uint8Array()).uType).toBe('DISC');
    expect(next.snapshot().phase).toBe('disconnecting');
  });
});
