import { formatAx25Call, type Ax25Call } from '~/utils/aprs-ax25';
import { createPacketMux, type PacketMux, type PacketMuxStep } from '~/utils/packet-link';
import type { PacketSettings } from '~/utils/packet-settings';

export type PacketMuxBuildParams = Pick<PacketSettings, 'modulo' | 'paclen' | 'maxframe' | 't1Ms' | 't3Ms' | 'n2' | 'acceptIncoming'> & {
  me: string;
};

export function packetMuxBuildParams(me: Ax25Call, settings: PacketSettings): PacketMuxBuildParams {
  return {
    me: formatAx25Call(me),
    modulo: settings.modulo,
    paclen: settings.paclen,
    maxframe: settings.maxframe,
    t1Ms: settings.t1Ms,
    t3Ms: settings.t3Ms,
    n2: settings.n2,
    acceptIncoming: settings.acceptIncoming,
  };
}

export function samePacketMuxBuild(left: PacketMuxBuildParams | undefined, right: PacketMuxBuildParams): boolean {
  if (!left) {
    return false;
  }

  return left.me === right.me
    && left.modulo === right.modulo
    && left.paclen === right.paclen
    && left.maxframe === right.maxframe
    && left.t1Ms === right.t1Ms
    && left.t3Ms === right.t3Ms
    && left.n2 === right.n2
    && left.acceptIncoming === right.acceptIncoming;
}

/** Build the link mux a Packet card uses to hear and answer SABM. */
export function createPacketCardMux(me: Ax25Call, settings: PacketSettings): PacketMux {
  return createPacketMux({
    me,
    modulo: settings.modulo,
    paclen: settings.paclen,
    maxframe: settings.maxframe,
    t1Ms: settings.t1Ms,
    t3Ms: settings.t3Ms,
    n2: settings.n2,
    acceptIncoming: settings.acceptIncoming,
    now: () => Date.now(),
  });
}

export function receiveOnPacketCardMux(mux: PacketMux, payload: Uint8Array): PacketMuxStep {
  return mux.receive(payload);
}