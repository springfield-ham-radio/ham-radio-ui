/**
 * When the Packet link may write a KISS frame on the shared host session.
 *
 * Opening the port and Connect detection stay on the APRS host session.
 * This gate is the extra check for SABM, I, RR, and DISC.
 */

export type PacketDetectPhase = 'idle' | 'listening' | 'awaiting-prompt' | 'entering' | 'waiting-traffic' | 'failed';

export function packetLinkBlockReason(input: {
  connected: boolean;
  detectPhase: PacketDetectPhase;
  kissConfirmed: boolean;
  hardwareTransmit: boolean;
}): string | undefined {
  if (!input.connected) {
    return 'The KISS port is closed. Nothing was sent.';
  }

  if (!input.hardwareTransmit) {
    return 'Transmit is off for this session. Nothing was sent.';
  }

  if (input.detectPhase === 'listening' || input.detectPhase === 'awaiting-prompt' || input.detectPhase === 'entering') {
    return 'KISS detection is still running. Nothing was sent.';
  }

  if (input.detectPhase === 'failed') {
    return 'KISS detection did not finish. Nothing was sent.';
  }

  if (input.detectPhase === 'waiting-traffic' || input.kissConfirmed) {
    return undefined;
  }

  return 'KISS is not ready. Nothing was sent.';
}
