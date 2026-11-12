/**
 * Terminal view. Line input uses CR. Buttons do not imply a transmission
 * until the caller asks the link for frames.
 */

import { canonicalAx25Call, type Ax25Call } from '~/utils/aprs-ax25';
import { formatTraceClock } from '~/utils/aprs-serial-trace';
import type { PacketLinkPhase } from '~/utils/packet-link';
import type { PacketDetectPhase } from '~/utils/packet-port';
import { packetLinkBlockReason } from '~/utils/packet-port';

export interface PacketTerminalInput {
  portOpen: boolean;
  detectPhase: PacketDetectPhase;
  kissConfirmed: boolean;
  hardwareTransmit: boolean;
  phase: PacketLinkPhase | 'none';
  myCall?: string;
  peer?: string;
}

export interface PacketTerminalView {
  linkLabel: string;
  canConnect: boolean;
  canSend: boolean;
  canDisconnect: boolean;
  connectBlocked?: string;
}

const LABELS: Record<PacketLinkPhase | 'none', string> = {
  none: 'Disconnected',
  disconnected: 'Disconnected',
  connecting: 'Connecting',
  connected: 'Connected',
  'timer-recovery': 'Retrying',
  disconnecting: 'Disconnecting',
};

/**
 * Why Call station is disabled. Undefined when the button is enabled,
 * so the tooltip stays hidden.
 */
export function packetCallStationTooltip(input: {
  portOpen: boolean;
  phase: PacketLinkPhase | 'none';
  detectPhase: PacketDetectPhase;
  kissConfirmed: boolean;
  hardwareTransmit: boolean;
  myCall?: string;
  station: string;
}): string | undefined {
  if (!input.portOpen) {
    return 'Connect (Host) first';
  }

  if (input.phase === 'connecting') {
    return 'A call is already in progress';
  }

  if (input.phase === 'connected' || input.phase === 'timer-recovery') {
    return 'Already linked to a station';
  }

  if (input.phase === 'disconnecting') {
    return 'The link is closing';
  }

  if (!input.hardwareTransmit) {
    return 'Transmit is off for this session';
  }

  if (input.detectPhase === 'listening' || input.detectPhase === 'awaiting-prompt' || input.detectPhase === 'entering') {
    return 'Wait until KISS detection finishes';
  }

  if (input.detectPhase === 'failed') {
    return 'KISS detection did not finish';
  }

  if (input.detectPhase !== 'waiting-traffic' && !input.kissConfirmed) {
    return 'KISS is not ready';
  }

  if (!input.myCall) {
    return 'Set a callsign in Preferences';
  }

  const station = input.station.trim();

  if (station.length === 0) {
    return 'Enter a station callsign';
  }

  if (!canonicalAx25Call(station)) {
    return 'Use a callsign of 3 to 6 characters';
  }

  return undefined;
}

export function packetTerminalView(input: PacketTerminalInput): PacketTerminalView {
  const block = packetLinkBlockReason({
    connected: input.portOpen,
    detectPhase: input.detectPhase,
    kissConfirmed: input.kissConfirmed,
    hardwareTransmit: input.hardwareTransmit,
  });
  const phase = input.phase;
  const open = phase === 'connecting' || phase === 'connected' || phase === 'timer-recovery' || phase === 'disconnecting';
  const call = input.myCall ? undefined : 'Set a callsign in Preferences. Nothing will be sent.';

  return {
    linkLabel: phase === 'connected' && input.peer ? `Connected to ${input.peer}` : LABELS[phase],
    canConnect: !open && !block && !call,
    canSend: phase === 'connected' && !block,
    canDisconnect: open,
    connectBlocked: open ? undefined : call ?? block,
  };
}

/** One terminal line, CR terminated, without a newline the field may include. */
export function packetLinePayload(line: string): Uint8Array | undefined {
  const stripped = line.replace(/[\r\n]+$/u, '');

  if ([...stripped].some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code > 0x7e;
  })) {
    return undefined;
  }

  return Uint8Array.from([...stripped].map((character) => character.charCodeAt(0)).concat(0x0d));
}

export function packetPeerPath(text: string): { path?: Ax25Call[]; error?: string } {
  const hops = text.split(/[,\s]+/u).map((hop) => hop.trim()).filter((hop) => hop.length > 0);

  if (hops.length > 6) {
    return { error: 'Use at most six digipeaters.' };
  }

  const path: Ax25Call[] = [];

  for (const hop of hops) {
    const call = canonicalAx25Call(hop);

    if (!call) {
      return { error: 'Use callsigns of 3 to 6 characters, with an SSID from 0 to 15.' };
    }

    path.push(call);
  }

  return { path };
}

function stampLines(body: string, stamp: string): string {
  if (stamp.length === 0 || body.length === 0) {
    return body;
  }

  const ends = body.endsWith('\n');
  const lines = body.split('\n');

  if (ends) {
    lines.pop();
  }

  const stamped = lines.map((line) => `${stamp}${line}`).join('\n');
  return ends ? `${stamped}\n` : stamped;
}

export function packetScrollText(
  current: string,
  notices: ReadonlyArray<{ kind: 'status' | 'rx'; text: string }>,
  sent?: string,
  clock?: { at: number; timeZone?: string },
): string {
  const stamp = clock ? `${formatTraceClock(clock.at, clock.timeZone)} ` : '';
  let next = current;

  if (sent !== undefined && sent.length > 0) {
    next += stampLines(`${sent.replace(/[\r\n]+$/u, '')}\n`, stamp);
  }

  for (const notice of notices) {
    if (notice.kind === 'rx') {
      const text = notice.text.replace(/\r\n/gu, '\n').replace(/\r/gu, '\n');
      next += text.endsWith('\n') ? stampLines(text, stamp) : stampLines(`${text}\n`, stamp);
    } else if (notice.text.length > 0) {
      next += stampLines(`[${notice.text}]\n`, stamp);
    }
  }

  const cap = 32_000;

  if (next.length > cap) {
    return next.slice(next.length - cap);
  }

  return next;
}
