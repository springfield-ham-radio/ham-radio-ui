import { aprsReceiveProfile } from '~/utils/aprs-capability';
import { D710_APRS_MODE_HINT, D710_APRS_MODE_LIKELY_HINT } from '~/utils/aprs-d710-host';
import type { AprsHostEntry } from '~/utils/aprs-host-profile';

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
      detail: 'APRS COM is closed. Connect listens, enters KISS if the TNC is in command mode, writes the interrupt once on silence, and writes kissExit once if the module declares it. Otherwise it stops. It does not transmit on the air. This is not the CAT connection.',
    };
  }

  return {
    badge: 'Disconnected',
    open: undefined,
    kiss: 'hidden',
    detail: 'APRS COM is closed. The passive monitor reads menu 604 text and writes nothing. Leave the radio showing APRS. This is not the CAT connection.',
  };
}

/** Face of the shared split button. The caret does not use this label. */
export function aprsConnectLabel(mode: AprsConnectionMode): string {
  return mode === 'host' ? 'Connect (Host)' : 'Connect (Monitor only)';
}

/**
 * Why the shared Connect face is disabled. Undefined when the click can open
 * the port. The caret can still change the mode.
 */
export function aprsConnectDisabledReason(input: {
  hasRadio: boolean;
  hasPort: boolean;
  portBusy: boolean;
  hostAvailable: boolean;
  mode: AprsConnectionMode;
}): string | undefined {
  if (!input.hasRadio) {
    return 'Save this radio under Preferences to choose an APRS port.';
  }

  if (!input.hasPort) {
    return 'Choose an APRS serial port in Preferences.';
  }

  if (input.portBusy) {
    return 'That serial port is already open. Disconnect it first.';
  }

  if (input.mode === 'host' && !input.hostAvailable) {
    return 'This radio has no host session.';
  }

  return undefined;
}

/** Quiet time on the passive monitor before the Menu 604 hint. */
export const APRS_MONITOR_SILENCE_MS = 60_000;

export const APRS_MONITOR_SILENCE_HINT =
  'No APRS text yet. Is the radio in PACKET/KISS mode? Monitor only needs the TNC in APRS mode with Menu 604 output on.';

export interface AprsMonitorQuiet {
  lastLogId: number;
  quietSinceMs: number;
}

/**
 * Start the quiet clock when Monitor only opens. A newer log id restarts it.
 * Closing the passive session drops the clock. This does not open a port or write.
 */
export function nextAprsMonitorQuiet(input: {
  passiveOpen: boolean;
  lastLogId: number | undefined;
  nowMs: number;
  current: AprsMonitorQuiet | undefined;
}): AprsMonitorQuiet | undefined {
  if (!input.passiveOpen) {
    return undefined;
  }

  const lastLogId = input.lastLogId ?? 0;

  if (!input.current || lastLogId > input.current.lastLogId) {
    return { lastLogId, quietSinceMs: input.nowMs };
  }

  return input.current;
}

/** Inline hint while Monitor only has had no new line for the threshold. */
export function aprsMonitorSilenceHint(input: {
  passiveOpen: boolean;
  nowMs: number;
  quietSinceMs: number | undefined;
  thresholdMs?: number;
}): string | undefined {
  if (!input.passiveOpen || input.quietSinceMs === undefined) {
    return undefined;
  }

  if (input.nowMs - input.quietSinceMs < (input.thresholdMs ?? APRS_MONITOR_SILENCE_MS)) {
    return undefined;
  }

  return APRS_MONITOR_SILENCE_HINT;
}

export interface AprsHostModeHintCopy {
  hint?: string;
  likelyHint?: string;
}

/**
 * Sentences for the Host No-reply hint.
 *
 * A module that sets either string owns the copy. A TM-D710 host block that
 * sets neither still uses the compatibility sentences, so an installed module
 * from before those fields still explains the TNC key. Any other radio stays
 * quiet until its module sets them. This does not write.
 */
export function aprsHostModeHintText(input: {
  aprsModeHint?: string;
  aprsModeLikelyHint?: string;
  d710: boolean;
  hasHost: boolean;
}): AprsHostModeHintCopy {
  if (input.aprsModeHint || input.aprsModeLikelyHint) {
    return { hint: input.aprsModeHint, likelyHint: input.aprsModeLikelyHint };
  }

  if (!input.d710 || !input.hasHost) {
    return {};
  }

  return { hint: D710_APRS_MODE_HINT, likelyHint: D710_APRS_MODE_LIKELY_HINT };
}

/**
 * Inline hint when Host detection has stopped short of the command prompt and KISS.
 *
 * A TNC2 monitor line uses the claimed sentence. Silence, or other command
 * text with no prompt, uses the weaker sentence. A pass that already saw the
 * prompt, an incomplete KISS frame, and non-text bytes do not.
 */
export function aprsHostAprsModeHint(input: {
  open: AprsConnectionMode | undefined;
  detectPhase: AprsTncModeInput['detectPhase'];
  commandPhase: AprsTncModeInput['commandPhase'];
  kissConfirmed: boolean;
  sawMonitorLine: boolean;
  detectDetail: string | undefined;
  hint: string | undefined;
  likelyHint: string | undefined;
}): string | undefined {
  if (input.open !== 'host' || input.kissConfirmed || input.detectPhase !== 'failed') {
    return undefined;
  }

  if (
    input.commandPhase === 'prompt'
    || input.commandPhase === 'waiting-accept'
    || input.commandPhase === 'restart-sent'
    || input.commandPhase === 'kiss-framed'
    || input.commandPhase === 'rejected'
    || input.commandPhase === 'timed-out'
    || input.commandPhase === 'cancelled'
  ) {
    return undefined;
  }

  if (input.sawMonitorLine) {
    return input.hint;
  }

  const detail = input.detectDetail ?? '';
  const noPrompt = detail.includes('not answering') || detail.includes('Command-mode text was seen');

  if (!noPrompt) {
    return undefined;
  }

  return input.likelyHint;
}

/** Shown on the Packet tab while the shared session is not in Host mode. */
export function packetNeedsHostNotice(input: {
  hostOpen: boolean;
  passiveOpen: boolean;
  selected: AprsConnectionMode;
}): string | undefined {
  if (input.hostOpen) {
    return undefined;
  }

  if (input.passiveOpen || input.selected === 'passive') {
    return 'Packet needs Host mode. Monitor only reads APRS text and does not open a KISS session.';
  }

  return undefined;
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

/**
 * Host Disconnect writes kissExit only when this session is already in KISS.
 * Command mode, detection, a failed pass, and the passive monitor do not.
 */
export function aprsHostShouldExitKiss(input: AprsTncModeInput): boolean {
  if (input.open !== 'host') {
    return false;
  }

  const label = aprsTncModeBadge(input).label;
  return label === 'KISS confirmed' || label === 'KISS · waiting';
}

export interface AprsStatusBadge {
  label: string;
  color: 'neutral' | 'success' | 'info' | 'secondary' | 'warning' | 'primary' | 'error';
  tooltip?: string;
}

/** One pill for the port and the TNC mode. It does not write. */
export function aprsStatusBadge(input: {
  connection: AprsConnectionView['badge'];
  tnc: AprsTncModeInput;
}): AprsStatusBadge {
  if (input.connection === 'Disconnected') {
    return { label: 'Disconnected', color: 'neutral' };
  }

  if (input.connection === 'Connecting') {
    return { label: 'Connecting', color: 'info' };
  }

  const mode = aprsTncModeBadge(input.tnc);
  const tooltip = mode.visible && mode.tooltip ? mode.tooltip : undefined;

  if (input.tnc.open === 'passive') {
    return { label: 'Connected · Monitor', color: 'success', tooltip };
  }

  const modeLabel = mode.label === 'KISS · waiting'
    ? 'KISS waiting'
    : mode.label === 'Detecting…'
      ? 'Detecting'
      : mode.label;
  const label = mode.visible && modeLabel ? `Connected · Host · ${modeLabel}` : 'Connected';
  const color = modeLabel === 'KISS confirmed' || !mode.visible
    ? 'success'
    : modeLabel === 'No reply'
      ? 'error'
      : 'warning';

  return { label, color, tooltip };
}

/** Appended to CAT or clone handshake failures on kiss-only radios. */
export const APRS_KISS_STILL_ON_HINT =
  'The radio may still be in KISS mode. PC commands are not accepted until KISS is off. Turn KISS off on the radio, or Connect and Disconnect on the APRS tab to send the KISS exit once.';

export function aprsConnectionModeMenuVisible(passive: boolean | undefined): boolean {
  return passive !== false;
}

export function aprsHostRetryDetectionVisible(entry: AprsHostEntry | undefined): boolean {
  return entry !== 'manual';
}

export function aprsHostEntryGuidance(input: {
  entryHint?: string;
  setup?: readonly string[];
}): string | undefined {
  if (input.entryHint) {
    return input.entryHint;
  }

  if (input.setup && input.setup.length > 0) {
    return input.setup.join(' ');
  }

  return undefined;
}

/**
 * Extra sentence for handshake timeouts when the module declares kiss-only APRS.
 */
export function aprsKissOnHandshakeSupplement(config: unknown, cause: unknown): string | undefined {
  const profile = aprsReceiveProfile({ config });

  if (profile?.passive !== false) {
    return undefined;
  }

  const message = cause instanceof Error ? cause.message : String(cause);

  if (!/timed out|timeout|not reply/i.test(message)) {
    return undefined;
  }

  return APRS_KISS_STILL_ON_HINT;
}

/** Merges {@link aprsKissOnHandshakeSupplement} into a radio read/write failure summary when config is set. */
export function appendAprsKissHandshakeSupplement(summary: string, config: unknown, cause: unknown): string {
  const supplement = aprsKissOnHandshakeSupplement(config, cause);

  return supplement ? `${summary} ${supplement}` : summary;
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
