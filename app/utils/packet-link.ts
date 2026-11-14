/**
 * Host-side AX.25 v2.0 connected mode, with optional modulo 128 (v2.2 SABME).
 *
 * The machine never transmits by itself. Callers pass received frames and
 * the clock, and send whatever frames come back. Disconnect with `once`
 * sends a single DISC and clears the timers.
 */

import { formatAx25Call, type Ax25Call } from '~/utils/aprs-ax25';
import {
  ax25PathDelivered,
  ax25ReversePath,
  encodeAx25Frame,
  parseAx25Frame,
  sameAx25Call,
  type Ax25Frame,
  type Ax25Modulo,
} from '~/utils/packet-ax25';

export type PacketLinkPhase = 'disconnected' | 'connecting' | 'connected' | 'timer-recovery' | 'disconnecting';

export interface PacketPeer {
  call: Ax25Call;
  path: readonly Ax25Call[];
}

export interface PacketLinkOptions {
  me: Ax25Call;
  modulo?: Ax25Modulo;
  paclen?: number;
  maxframe?: number;
  t1Ms?: number;
  t3Ms?: number;
  n2?: number;
  acceptIncoming?: boolean;
  now?: () => number;
}

export interface PacketLinkNotice {
  kind: 'status' | 'rx';
  text: string;
}

export interface PacketLinkStep {
  frames: Uint8Array[];
  notices: PacketLinkNotice[];
}

export interface PacketLinkSnapshot {
  phase: PacketLinkPhase;
  peer?: string;
  vs: number;
  vr: number;
  va: number;
  retries: number;
  unacked: number;
  queued: number;
  acceptIncoming: boolean;
  modulo: Ax25Modulo;
  t1: boolean;
  t3: boolean;
}

interface Outstanding {
  ns: number;
  info: Uint8Array;
}

const EMPTY: PacketLinkStep = { frames: [], notices: [] };

function textOf(info: Uint8Array): string {
  let text = '';

  for (const byte of info) {
    text += String.fromCharCode(byte);
  }

  return text;
}

export function createPacketLink(options: PacketLinkOptions) {
  const modulo = options.modulo === 128 ? 128 : 8;
  const paclen = options.paclen ?? 128;
  const maxframe = options.maxframe ?? (modulo === 128 ? 4 : 4);
  const t1Ms = options.t1Ms ?? 3000;
  const t3Ms = options.t3Ms ?? 180_000;
  const n2 = options.n2 ?? 10;
  let acceptIncoming = options.acceptIncoming === true;
  let time = options.now?.() ?? 0;
  let phase: PacketLinkPhase = 'disconnected';
  let peer: Ax25Call | undefined;
  let route: Ax25Call[] = [];
  let vs = 0;
  let vr = 0;
  let va = 0;
  let retries = 0;
  let remoteBusy = false;
  let rejectArmed = false;
  let t1At: number | undefined;
  let t3At: number | undefined;
  const unacked: Outstanding[] = [];
  const queued: Uint8Array[] = [];
  let attempts = 0;

  function touch(explicit?: number): void {
    const reported = explicit ?? options.now?.() ?? time;
    time = Math.max(time, reported);
  }

  function mod(value: number): number {
    return ((value % modulo) + modulo) % modulo;
  }

  function span(from: number, to: number): number {
    return mod(to - from);
  }

  function label(call: Ax25Call | undefined): string {
    return call ? formatAx25Call(call) : 'peer';
  }

  function clearQueues(): void {
    unacked.splice(0, unacked.length);
    queued.splice(0, queued.length);
    vs = 0;
    vr = 0;
    va = 0;
    retries = 0;
    attempts = 0;
    remoteBusy = false;
    rejectArmed = false;
  }

  function clearTimers(): void {
    t1At = undefined;
    t3At = undefined;
  }

  function armT1(): void {
    t1At = time + t1Ms;
    t3At = undefined;
  }

  function armT3(): void {
    t1At = undefined;
    t3At = phase === 'connected' || phase === 'timer-recovery' ? time + t3Ms : undefined;
  }

  function goDisconnected(): void {
    phase = 'disconnected';
    clearQueues();
    clearTimers();
  }

  function goConnected(nextPeer: Ax25Call, nextRoute: readonly Ax25Call[]): void {
    peer = { call: nextPeer.call, ssid: nextPeer.ssid };
    route = nextRoute.map((hop) => ({ call: hop.call, ssid: hop.ssid }));
    phase = 'connected';
    clearQueues();
    armT3();
  }

  function addressed(frame: Ax25Frame): boolean {
    if (!sameAx25Call(frame.destination, options.me) || !ax25PathDelivered(frame.path)) {
      return false;
    }

    return true;
  }

  function rememberRoute(frame: Ax25Frame): void {
    peer = { call: frame.source.call, ssid: frame.source.ssid };
    route = ax25ReversePath(frame.path);
  }

  function encode(draft: Parameters<typeof encodeAx25Frame>[0]): Uint8Array | undefined {
    if (!peer) {
      return undefined;
    }

    return encodeAx25Frame({
      ...draft,
      destination: peer,
      source: options.me,
      path: route,
    });
  }

  function command(draft: Parameters<typeof encodeAx25Frame>[0]): Uint8Array | undefined {
    return encode({ ...draft, cr: 'command' });
  }

  function response(draft: Parameters<typeof encodeAx25Frame>[0]): Uint8Array | undefined {
    return encode({ ...draft, cr: 'response' });
  }

  function pushFrame(frames: Uint8Array[], frame: Uint8Array | undefined): void {
    if (frame) {
      frames.push(frame);
    }
  }

  function sabm(): Uint8Array | undefined {
    return command({
      destination: options.me,
      source: options.me,
      cr: 'command',
      kind: 'U',
      uType: modulo === 128 ? 'SABME' : 'SABM',
      pf: true,
    });
  }

  function disc(): Uint8Array | undefined {
    return command({
      destination: options.me,
      source: options.me,
      cr: 'command',
      kind: 'U',
      uType: 'DISC',
      pf: true,
    });
  }

  function ua(): Uint8Array | undefined {
    return response({
      destination: options.me,
      source: options.me,
      cr: 'response',
      kind: 'U',
      uType: 'UA',
      pf: true,
    });
  }

  function supervisory(type: 'RR' | 'RNR' | 'REJ', pf: boolean, asResponse: boolean): Uint8Array | undefined {
    const draft = {
      destination: options.me,
      source: options.me,
      cr: asResponse ? 'response' as const : 'command' as const,
      kind: 'S' as const,
      sType: type,
      nr: vr,
      pf,
      modulo,
    };
    return asResponse ? response(draft) : command(draft);
  }

  function information(item: Outstanding, pf = false): Uint8Array | undefined {
    return command({
      destination: options.me,
      source: options.me,
      cr: 'command',
      kind: 'I',
      ns: item.ns,
      nr: vr,
      pf,
      modulo,
      info: item.info,
    });
  }

  function outstandingCount(): number {
    return span(va, vs);
  }

  function nrAccepts(nr: number): boolean {
    return span(va, nr) <= outstandingCount();
  }

  function ackThrough(nr: number): void {
    if (!nrAccepts(nr)) {
      return;
    }

    while (unacked.length > 0 && unacked[0]?.ns !== nr) {
      unacked.shift();
      va = mod(va + 1);
    }
  }

  function pump(frames: Uint8Array[]): void {
    if (phase !== 'connected' || remoteBusy) {
      return;
    }

    let sent = false;

    while (queued.length > 0 && outstandingCount() < maxframe) {
      const info = queued.shift();

      if (!info) {
        break;
      }

      const item = { ns: vs, info };
      unacked.push(item);
      vs = mod(vs + 1);
      pushFrame(frames, information(item));
      sent = true;
    }

    if (sent) {
      if (t1At === undefined) {
        retries = 0;
        attempts = 1;
      }

      armT1();
    } else if (unacked.length === 0 && phase === 'connected') {
      armT3();
    }
  }

  function retransmit(frames: Uint8Array[], onlyNs?: number): void {
    for (const item of unacked) {
      if (onlyNs === undefined || item.ns === onlyNs) {
        pushFrame(frames, information(item));
      }
    }

    if (unacked.length > 0) {
      armT1();
    }
  }

  function snapshot(): PacketLinkSnapshot {
    return {
      phase,
      peer: peer ? formatAx25Call(peer) : undefined,
      vs,
      vr,
      va,
      retries,
      unacked: unacked.length,
      queued: queued.length,
      acceptIncoming,
      modulo,
      t1: t1At !== undefined,
      t3: t3At !== undefined,
    };
  }

  function connect(next: PacketPeer): PacketLinkStep {
    touch();

    if (phase !== 'disconnected') {
      return { frames: [], notices: [{ kind: 'status', text: 'A link is already open. Nothing was sent.' }] };
    }

    peer = { call: next.call.call, ssid: next.call.ssid };
    route = next.path.map((hop) => ({ call: hop.call, ssid: hop.ssid }));
    phase = 'connecting';
    clearQueues();
    attempts = 1;
    armT1();
    const frame = sabm();
    return {
      frames: frame ? [frame] : [],
      notices: [{ kind: 'status', text: `${modulo === 128 ? 'SABME' : 'SABM'} sent to ${label(peer)}.` }],
    };
  }

  function disconnect(once = false): PacketLinkStep {
    touch();

    if (phase === 'disconnected') {
      return EMPTY;
    }

    const frames: Uint8Array[] = [];

    if (phase !== 'disconnecting') {
      pushFrame(frames, disc());
    }

    if (once) {
      goDisconnected();
      return { frames, notices: [{ kind: 'status', text: 'Disconnected. Timers stopped.' }] };
    }

    phase = 'disconnecting';
    retries = 0;
    attempts = 1;
    queued.splice(0, queued.length);
    armT1();
    return { frames, notices: [{ kind: 'status', text: `DISC sent to ${label(peer)}.` }] };
  }

  function stop(): PacketLinkStep {
    if (phase === 'disconnected') {
      return EMPTY;
    }

    goDisconnected();
    return { frames: [], notices: [{ kind: 'status', text: 'Link stopped. Nothing was sent.' }] };
  }

  function send(info: Uint8Array): PacketLinkStep & { error?: string } {
    touch();

    if (phase !== 'connected' && phase !== 'timer-recovery') {
      return { frames: [], notices: [], error: 'The link is not connected. Nothing was sent.' };
    }

    if (info.length === 0) {
      return { frames: [], notices: [], error: 'Nothing to send.' };
    }

    const frames: Uint8Array[] = [];

    for (let offset = 0; offset < info.length; offset += paclen) {
      if (queued.length >= 32) {
        return { frames, notices: [], error: 'The send queue is full. Nothing more was queued.' };
      }

      queued.push(info.slice(offset, offset + paclen));
    }

    pump(frames);
    return { frames, notices: [] };
  }

  function finishConnect(frame: Ax25Frame, notices: PacketLinkNotice[]): void {
    rememberRoute(frame);
    goConnected(frame.source, route);
    notices.push({ kind: 'status', text: `Connected to ${label(peer)}.` });
  }

  function receive(payload: Uint8Array): PacketLinkStep {
    touch();
    const frame = parseAx25Frame(payload, { modulo });

    if (!frame || !addressed(frame)) {
      return EMPTY;
    }

    if (frame.kind === 'U' && (frame.uType === 'SABM' || frame.uType === 'SABME')) {
      return receiveSabm(frame);
    }

    if (peer && !sameAx25Call(frame.source, peer) && phase !== 'disconnected') {
      return EMPTY;
    }

    if (frame.kind === 'U') {
      return receiveU(frame);
    }

    if (phase === 'disconnected' || phase === 'connecting' || phase === 'disconnecting') {
      return EMPTY;
    }

    if (frame.kind === 'I') {
      return receiveI(frame);
    }

    return receiveS(frame);
  }

  function receiveSabm(frame: Ax25Frame): PacketLinkStep {
    const wanted = modulo === 128 ? 'SABME' : 'SABM';

    if (frame.uType !== wanted) {
      return {
        frames: [],
        notices: [{ kind: 'status', text: `Ignored ${frame.uType} from ${label(frame.source)}. This link is modulo ${modulo}.` }],
      };
    }

    const samePeer = peer !== undefined && sameAx25Call(frame.source, peer);

    if (phase === 'disconnected' && !acceptIncoming) {
      return {
        frames: [],
        notices: [{ kind: 'status', text: `Ignored ${frame.uType} from ${label(frame.source)}. Accept incoming connections is off.` }],
      };
    }

    if (phase !== 'disconnected' && !samePeer) {
      return EMPTY;
    }

    rememberRoute(frame);
    goConnected(frame.source, route);
    const frames: Uint8Array[] = [];
    pushFrame(frames, ua());
    return { frames, notices: [{ kind: 'status', text: `Connected to ${label(peer)}.` }] };
  }

  function receiveU(frame: Ax25Frame): PacketLinkStep {
    if (frame.uType === 'UA' && (phase === 'connecting' || phase === 'disconnecting') && (peer === undefined || sameAx25Call(frame.source, peer))) {
      if (phase === 'connecting') {
        const notices: PacketLinkNotice[] = [];
        finishConnect(frame, notices);
        const frames: Uint8Array[] = [];
        pump(frames);
        return { frames, notices };
      }

      const name = label(peer);
      goDisconnected();
      return { frames: [], notices: [{ kind: 'status', text: `Disconnected from ${name}.` }] };
    }

    if (frame.uType === 'DM' && phase !== 'disconnected' && (peer === undefined || sameAx25Call(frame.source, peer))) {
      const name = label(peer);
      goDisconnected();
      return { frames: [], notices: [{ kind: 'status', text: `${name} sent DM. Timers stopped.` }] };
    }

    if (frame.uType === 'DISC' && phase !== 'disconnected' && (peer === undefined || sameAx25Call(frame.source, peer))) {
      const frames: Uint8Array[] = [];
      pushFrame(frames, ua());
      const name = label(frame.source);
      goDisconnected();
      return { frames, notices: [{ kind: 'status', text: `${name} disconnected.` }] };
    }

    if (frame.uType === 'FRMR' && phase !== 'disconnected' && (peer === undefined || sameAx25Call(frame.source, peer))) {
      const frames: Uint8Array[] = [];
      pushFrame(frames, disc());
      phase = 'disconnecting';
      retries = 0;
      attempts = 1;
      armT1();
      return { frames, notices: [{ kind: 'status', text: `${label(frame.source)} sent FRMR. DISC sent.` }] };
    }

    return EMPTY;
  }

  function receiveI(frame: Ax25Frame): PacketLinkStep {
    if (frame.ns === undefined || frame.nr === undefined) {
      return EMPTY;
    }

    const frames: Uint8Array[] = [];
    const notices: PacketLinkNotice[] = [];
    ackThrough(frame.nr);
    const ahead = span(vr, frame.ns);

    const accepted = frame.ns === vr;

    if (accepted) {
      vr = mod(vr + 1);
      rejectArmed = false;
      notices.push({ kind: 'rx', text: textOf(frame.info) });
    } else if (ahead !== 0 && ahead < modulo / 2 && !rejectArmed) {
      rejectArmed = true;
      pushFrame(frames, supervisory('REJ', false, false));
    }

    pump(frames);
    const sentInfo = frames.some((item) => parseAx25Frame(item, { modulo })?.kind === 'I');

    if (frame.pf) {
      pushFrame(frames, supervisory('RR', true, true));
    } else if (!sentInfo && !frames.some((item) => parseAx25Frame(item, { modulo })?.sType === 'REJ')) {
      pushFrame(frames, supervisory('RR', false, false));
    }

    if (unacked.length === 0) {
      armT3();
    } else {
      armT1();
    }

    return { frames, notices };
  }

  function receiveS(frame: Ax25Frame): PacketLinkStep {
    if (frame.nr === undefined || !frame.sType) {
      return EMPTY;
    }

    const frames: Uint8Array[] = [];
    const notices: PacketLinkNotice[] = [];

    if (frame.sType !== 'SREJ') {
      ackThrough(frame.nr);
    }

    if (frame.sType === 'RNR') {
      remoteBusy = true;
      notices.push({ kind: 'status', text: 'Peer is busy.' });
    } else {
      remoteBusy = false;
    }

    const responseFinal = frame.pf && frame.cr !== 'command';
    const commandPoll = frame.pf && frame.cr === 'command';

    if (phase === 'timer-recovery' && responseFinal) {
      phase = 'connected';
      retries = 0;
      attempts = 0;
    }

    if (frame.sType === 'REJ') {
      retransmit(frames);
    } else if (frame.sType === 'SREJ') {
      retransmit(frames, frame.nr);
    } else if (phase === 'connected' && responseFinal && unacked.length > 0) {
      retransmit(frames);
    }

    if (commandPoll) {
      pushFrame(frames, supervisory(remoteBusy ? 'RNR' : 'RR', true, true));
    }

    pump(frames);

    if (unacked.length === 0 && phase === 'connected') {
      armT3();
    } else if (unacked.length > 0) {
      armT1();
    }

    return { frames, notices };
  }

  function giveUp(notices: PacketLinkNotice[], text: string): void {
    goDisconnected();
    notices.push({ kind: 'status', text });
  }

  function tick(now: number): PacketLinkStep {
    touch(now);

    if (phase === 'disconnected') {
      return EMPTY;
    }

    if (t3At !== undefined && now >= t3At && phase === 'connected' && unacked.length === 0) {
      const frames: Uint8Array[] = [];
      pushFrame(frames, supervisory('RR', true, false));
      attempts = 1;
      retries = 0;
      armT1();
      return { frames, notices: [{ kind: 'status', text: 'T3 poll.' }] };
    }

    if (t1At === undefined || now < t1At) {
      return EMPTY;
    }

    retries += 1;

    if (attempts + retries > n2) {
      const notices: PacketLinkNotice[] = [];
      giveUp(notices, phase === 'connecting'
        ? `Connect to ${label(peer)} failed after ${n2} attempts. Nothing more was sent.`
        : `Retry limit (${n2}). The link was cleared and nothing more was sent.`);
      return { frames: [], notices };
    }

    const frames: Uint8Array[] = [];

    if (phase === 'connecting') {
      pushFrame(frames, sabm());
      armT1();
      return { frames, notices: [] };
    }

    if (phase === 'disconnecting') {
      pushFrame(frames, disc());
      armT1();
      return { frames, notices: [] };
    }

    phase = 'timer-recovery';
    pushFrame(frames, supervisory('RR', true, false));
    armT1();
    return { frames, notices: [{ kind: 'status', text: 'T1 retry.' }] };
  }

  return {
    snapshot,
    connect,
    disconnect,
    stop,
    send,
    receive,
    tick,
    setAcceptIncoming(on: boolean) {
      acceptIncoming = on;
    },
  };
}

export type PacketLink = ReturnType<typeof createPacketLink>;

export interface PacketMuxStep extends PacketLinkStep {
  id?: string;
  error?: string;
}

/**
 * Several links on one callsign. The terminal opens one. Incoming SABM is
 * answered only when accept is on, and a second peer gets its own link.
 */
export function createPacketMux(options: PacketLinkOptions) {
  const links = new Map<string, PacketLink>();
  let nextId = 1;
  let acceptIncoming = options.acceptIncoming === true;

  function fresh(): PacketLink {
    return createPacketLink({ ...options, acceptIncoming });
  }

  function add(link: PacketLink): string {
    const id = `s${nextId}`;
    nextId += 1;
    links.set(id, link);
    return id;
  }

  function combine(parts: PacketLinkStep[]): PacketLinkStep {
    return {
      frames: parts.flatMap((part) => part.frames),
      notices: parts.flatMap((part) => part.notices),
    };
  }

  function findByPeer(call: Ax25Call): string | undefined {
    for (const [id, link] of links) {
      const peer = link.snapshot().peer;

      if (peer && peer === formatAx25Call(call)) {
        return id;
      }
    }

    return undefined;
  }

  function connect(peer: PacketPeer): PacketMuxStep {
    if ([...links.values()].some((link) => link.snapshot().phase !== 'disconnected')) {
      const active = [...links.entries()].find(([, link]) => link.snapshot().phase !== 'disconnected');
      return {
        id: active?.[0],
        frames: [],
        notices: [],
        error: 'One link is already open. Disconnect it before opening another.',
      };
    }

    links.clear();
    const link = fresh();
    const id = add(link);
    const step = link.connect(peer);
    return { id, ...step };
  }

  function session(id: string): PacketLink | undefined {
    return links.get(id);
  }

  function disconnect(id: string, once = false): PacketLinkStep {
    return links.get(id)?.disconnect(once) ?? EMPTY;
  }

  function disconnectAll(once = false): PacketLinkStep {
    return combine([...links.values()].map((link) => link.disconnect(once)));
  }

  function stopAll(): PacketLinkStep {
    const step = combine([...links.values()].map((link) => link.stop()));
    return step;
  }

  function send(id: string, info: Uint8Array): PacketMuxStep {
    const link = links.get(id);

    if (!link) {
      return { frames: [], notices: [], error: 'That session is gone. Nothing was sent.' };
    }

    return link.send(info);
  }

  function receive(payload: Uint8Array): PacketMuxStep {
    const frame = parseAx25Frame(payload, { modulo: options.modulo === 128 ? 128 : 8 });

    if (!frame || !sameAx25Call(frame.destination, options.me) || !ax25PathDelivered(frame.path)) {
      return EMPTY;
    }

    const existing = findByPeer(frame.source);

    if (existing) {
      return links.get(existing)?.receive(payload) ?? EMPTY;
    }

    if (frame.kind === 'U' && (frame.uType === 'SABM' || frame.uType === 'SABME')) {
      if (!acceptIncoming) {
        return {
          frames: [],
          notices: [{
            kind: 'status',
            text: `Ignored ${frame.uType} from ${formatAx25Call(frame.source)}. Accept incoming connections is off.`,
          }],
        };
      }

      const link = fresh();
      const id = add(link);
      return { id, ...link.receive(payload) };
    }

    return EMPTY;
  }

  function tick(now: number): PacketLinkStep {
    return combine([...links.values()].map((link) => link.tick(now)));
  }

  function setAcceptIncoming(on: boolean): void {
    acceptIncoming = on;

    for (const link of links.values()) {
      link.setAcceptIncoming(on);
    }
  }

  function snapshots(): Array<PacketLinkSnapshot & { id: string }> {
    return [...links.entries()].map(([id, link]) => ({ id, ...link.snapshot() }));
  }

  return {
    connect,
    session,
    disconnect,
    disconnectAll,
    stopAll,
    send,
    receive,
    tick,
    setAcceptIncoming,
    snapshots,
  };
}

export type PacketMux = ReturnType<typeof createPacketMux>;
