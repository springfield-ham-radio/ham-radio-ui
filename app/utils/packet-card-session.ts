import type { Ax25Call } from '~/utils/aprs-ax25';
import { createPacketMux, type PacketMux, type PacketMuxStep } from '~/utils/packet-link';
import type { PacketSettings } from '~/utils/packet-settings';

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