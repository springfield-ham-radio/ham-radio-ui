/**
 * One APRS COM connection for Stations, Map, Messages, Packet, and Raw log.
 *
 * Connect opens the passive monitor or the host session. The passive monitor
 * writes nothing. Host Connect runs detection and does not transmit on the
 * air. KISS confirmation is a property of the open host session, not a
 * second port.
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
      detail: input.mode === 'host'
        ? 'Opening the APRS COM port. Detection starts after it opens and does not transmit on the air. This is not the CAT connection.'
        : 'Opening the APRS COM port. Nothing is written. This is not the CAT connection.',
    };
  }

  if (open === 'host') {
    return {
      badge: 'Connected',
      open: 'host',
      kiss: input.kissConfirmed ? 'confirmed' : 'unconfirmed',
      detail: input.kissConfirmed
        ? 'APRS COM is open for the host session. AX.25 UI seen. This is not the CAT connection.'
        : 'APRS COM is open for the host session. KISS unconfirmed until an AX.25 UI frame. This is not the CAT connection.',
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
      detail: 'APRS COM is closed. Connect listens, enters KISS if the TNC is in command mode, writes the interrupt once on silence, and writes kissExit once if the module declares it. Otherwise it stops. It does not transmit on the air. Software and Off keep RTS low. Hardware lets the driver manage RTS. This is not the CAT connection.',
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

/** Detection fields already published by the host session. This view does not change them. */
export interface AprsTncModeInput {
  open: AprsConnectionMode | undefined;
  kissConfirmed: boolean;
  detectPhase: 'idle' | 'listening' | 'awaiting-prompt' | 'entering' | 'waiting-traffic' | 'failed' | undefined;
  commandPhase:
    | 'idle'
    | 'waiting-prompt'
    | 'prompt'
    | 'timed-out'
    | 'cancelled'
    | 'waiting-accept'
    | 'restart-sent'
    | 'rejected'
    | 'kiss-framed'
    | undefined;
}

export interface AprsTncModeView {
  visible: boolean;
  label: string;
  color: 'neutral' | 'info' | 'secondary' | 'warning' | 'primary' | 'error';
  tooltip: string;
}

const TNC_HIDDEN: AprsTncModeView = { visible: false, label: '', color: 'neutral', tooltip: '' };

/**
 * Mode pill beside Connected. Reads the session's detect and command phases.
 * It does not start detection or write.
 *
 * A closed port has no pill. The Connected pill already says Disconnected, and
 * a dash would describe a TNC this connection is not talking to.
 * Passive monitor shows Monitor: that path is menu 604 text, not command or KISS,
 * and a blank beside Connected would look like a missing reading.
 */
export function aprsTncModeBadge(input: AprsTncModeInput): AprsTncModeView {
  if (input.open === 'passive') {
    return {
      visible: true,
      label: 'Monitor',
      color: 'neutral',
      tooltip: 'Passive monitor. Menu 604 text only. Nothing is written.',
    };
  }

  if (input.open !== 'host') {
    return TNC_HIDDEN;
  }

  if (input.kissConfirmed) {
    return {
      visible: true,
      label: 'KISS confirmed',
      color: 'primary',
      tooltip: 'An AX.25 UI frame confirmed KISS.',
    };
  }

  if (input.detectPhase === 'failed' || input.commandPhase === 'timed-out' || input.commandPhase === 'rejected' || input.commandPhase === 'cancelled') {
    return {
      visible: true,
      label: 'No reply',
      color: 'error',
      tooltip: 'Detection stopped before an AX.25 UI frame.',
    };
  }

  if (input.detectPhase === 'waiting-traffic' || input.commandPhase === 'restart-sent' || input.commandPhase === 'kiss-framed') {
    return {
      visible: true,
      label: 'KISS · waiting',
      color: 'warning',
      tooltip: 'KISS is entered. No AX.25 UI frame yet.',
    };
  }

  if (input.detectPhase === 'entering' || input.commandPhase === 'prompt' || input.commandPhase === 'waiting-accept') {
    return {
      visible: true,
      label: 'Command',
      color: 'secondary',
      tooltip: 'The TNC is in command mode. A prompt was seen.',
    };
  }

  return {
    visible: true,
    label: 'Detecting…',
    color: 'info',
    tooltip: 'Listening for a KISS frame or the command prompt.',
  };
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
