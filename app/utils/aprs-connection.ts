/**
 * One APRS COM connection for Stations, Map, Messages, Packet, and Raw log.
 *
 * Connect opens the passive monitor or the host session. It does not send a
 * command, a beacon, or a message, and it does not enter KISS. KISS
 * confirmation is a property of the open host session, not a second port.
 * CAT is a different connection and is not represented here. Changing tabs
 * does not call these functions, so it cannot open the port again.
 */

export type AprsConnectionMode = 'passive' | 'host';

export interface AprsConnectionInput {
  mode: AprsConnectionMode;
  passiveOpen: boolean;
  hostOpen: boolean;
  passiveConnecting: boolean;
  hostConnecting: boolean;
  kissConfirmed: boolean;
}

export interface AprsConnectionView {
  badge: 'Disconnected' | 'Connecting' | 'Connected';
  open: AprsConnectionMode | undefined;
  kiss: 'hidden' | 'unconfirmed' | 'confirmed';
  detail: string;
}

export type AprsPortAction =
  | { kind: 'open-passive' }
  | { kind: 'open-host' }
  | { kind: 'close-passive' }
  | { kind: 'close-host' }
  | { kind: 'close-both' }
  | { kind: 'blocked'; reason: string };

export function aprsConnectionView(input: AprsConnectionInput): AprsConnectionView {
  const open: AprsConnectionMode | undefined = input.hostOpen ? 'host' : input.passiveOpen ? 'passive' : undefined;

  if ((input.passiveConnecting || input.hostConnecting) && !open) {
    return {
      badge: 'Connecting',
      open: undefined,
      kiss: 'hidden',
      detail: 'Opening the APRS COM port. Nothing is written. This is not the CAT connection.',
    };
  }

  if (open === 'host') {
    return {
      badge: 'Connected',
      open: 'host',
      kiss: input.kissConfirmed ? 'confirmed' : 'unconfirmed',
      detail: input.kissConfirmed
        ? 'APRS COM is open for the host session. AX.25 UI seen. This is not the CAT connection.'
        : 'APRS COM is open for the host session. KISS unconfirmed. Connect did not send a command. This is not the CAT connection.',
    };
  }

  if (open === 'passive') {
    return {
      badge: 'Connected',
      open: 'passive',
      kiss: 'hidden',
      detail: 'APRS COM is open for the passive monitor. Menu 604 text only. Nothing is written. This is not the CAT connection.',
    };
  }

  if (input.mode === 'host') {
    return {
      badge: 'Disconnected',
      open: undefined,
      kiss: 'hidden',
      detail: 'APRS COM is closed. The host session opens that port with the chosen flow and writes nothing. Software and Off keep RTS low. Hardware lets the driver manage RTS. Enter host KISS is a separate step. This is not the CAT connection.',
    };
  }

  return {
    badge: 'Disconnected',
    open: undefined,
    kiss: 'hidden',
    detail: 'APRS COM is closed. The passive monitor reads menu 604 text and writes nothing. Leave the radio showing APRS. This is not the CAT connection.',
  };
}

export function aprsConnectAction(input: { mode: AprsConnectionMode; passiveOpen: boolean; hostOpen: boolean }): AprsPortAction {
  if (input.passiveOpen || input.hostOpen) {
    return { kind: 'blocked', reason: 'The APRS COM port is already open. Disconnect before opening it again.' };
  }

  return input.mode === 'host' ? { kind: 'open-host' } : { kind: 'open-passive' };
}

export function aprsDisconnectAction(input: { passiveOpen: boolean; hostOpen: boolean }): AprsPortAction {
  if (input.passiveOpen && input.hostOpen) {
    return { kind: 'close-both' };
  }

  if (input.hostOpen) {
    return { kind: 'close-host' };
  }

  if (input.passiveOpen) {
    return { kind: 'close-passive' };
  }

  return { kind: 'blocked', reason: 'The APRS COM port is already closed.' };
}
