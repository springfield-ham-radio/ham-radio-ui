import { isAprsHostFlow } from '~/utils/aprs-host-flow';
import type { AprsHostFlowControl } from '~/utils/aprs-serial-options';

/**
 * Host-command procedure from an installed radio module.
 *
 * The bytes and the prompt text belong to that module. HamBench does not
 * invent a Kenwood command for a radio that omits this block. Host Connect
 * runs the detection sequence from this block. A prompt is not proof of
 * packet mode. `kissExit` is optional and is not invented here.
 */
export type AprsHostEntry = 'command' | 'manual';

export interface AprsHostEnterStep {
  text: string;
  label: string;
}

export interface AprsHostLink {
  entry: AprsHostEntry;
  interrupt?: Uint8Array;
  prompt?: string;
  errorReply?: string;
  waitMs: number;
  /** How long Connect listens before the prompt request. Default 3000. */
  listenMs: number;
  /**
   * Optional KISS-exit bytes, sent once only when Connect hears silence
   * after the prompt request. Required for manual entry. Omitted on command
   * modules means that step is skipped.
   */
  kissExit?: Uint8Array;
  /**
   * Optional bytes written once after the interrupt, and only when command
   * text is still arriving and the prompt is not in those bytes. Omitted
   * means that step is skipped. Shared code does not invent these bytes.
   */
  promptNudge?: Uint8Array;
  enter: readonly AprsHostEnterStep[];
}

export interface AprsHostProfile {
  link: AprsHostLink;
  /**
   * Serial flow control for this COM jack.
   *
   * Omitted on modules published before the field (Kenwood 1.15.1).
   * Connect then uses `aprsTncFlowControl`. `flows`, `defaultFlow`, and
   * `flowHelp` stay so those older JSON files still parse. They do not
   * open the port.
   */
  flowControl?: AprsHostFlowControl;
  /**
   * Optional DTR line after open. Omitted means deasserted (low).
   */
  dtr?: boolean;
  /**
   * Optional RTS line after open when flow is not hardware. Omitted means low.
   * Hardware RTS/CTS does not ioctl RTS.
   */
  rts?: boolean;
  flows: readonly AprsHostFlowControl[];
  defaultFlow: AprsHostFlowControl;
  flowHelp: string;
  setup: readonly string[];
  recovery: readonly string[];
  /**
   * Connection-bar sentence when Host detection stops after a TNC2 monitor
   * line and no command prompt. Omitted means the bar stays quiet unless a
   * TM-D710 compatibility copy supplies one. The sentence is not transmitted.
   */
  aprsModeHint?: string;
  /**
   * Weaker sentence when that same stop has no TNC2 line. Omitted means no
   * weaker sentence. It is not transmitted.
   */
  aprsModeLikelyHint?: string;
  /**
   * Shown on the connection bar while disconnected or waiting for manual KISS.
   * Not transmitted.
   */
  entryHint?: string;
}

const FLOWS: readonly AprsHostFlowControl[] = ['software', 'none', 'hardware'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function printable(value: string, max: number): boolean {
  return value.length > 0 && value.length <= max && [...value].every((character) => {
    const code = character.charCodeAt(0);
    return code >= 0x20 && code <= 0x7e;
  });
}

function byteList(value: unknown, min: number, max: number): Uint8Array | undefined {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    return undefined;
  }

  const bytes = new Uint8Array(value.length);

  for (let index = 0; index < value.length; index += 1) {
    const byte = value[index];

    if (typeof byte !== 'number' || !Number.isInteger(byte) || byte < 0 || byte > 255) {
      return undefined;
    }

    bytes[index] = byte;
  }

  return bytes;
}

function lines(value: unknown, max: number): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) {
    return undefined;
  }

  const copy: string[] = [];

  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim().length === 0 || entry.length > 700) {
      return undefined;
    }

    copy.push(entry.trim());
  }

  return copy.slice(0, max);
}

function lineState(value: unknown): boolean | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  if (value === 'asserted') {
    return true;
  }

  if (value === 'low') {
    return false;
  }

  return null;
}

function parseManualHost(value: Record<string, unknown>): AprsHostProfile | undefined {
  if (value.entry !== 'manual') {
    return undefined;
  }

  if (value.interrupt !== undefined || value.prompt !== undefined || value.promptNudge !== undefined || value.errorReply !== undefined) {
    return undefined;
  }

  const kissExit = byteList(value.kissExit, 1, 16);

  if (!kissExit) {
    return undefined;
  }

  if (value.enter !== undefined && (!Array.isArray(value.enter) || value.enter.length !== 0)) {
    return undefined;
  }

  let flowControl: AprsHostFlowControl | undefined;

  if (value.flowControl === undefined) {
    flowControl = 'none';
  } else if (value.flowControl === 'software') {
    return undefined;
  } else if (!isAprsHostFlow(value.flowControl) || value.flowControl === 'software') {
    return undefined;
  } else {
    flowControl = value.flowControl;
  }

  const dtr = lineState(value.dtr);

  if (dtr === null) {
    return undefined;
  }

  const rts = lineState(value.rts);

  if (rts === null) {
    return undefined;
  }

  const waitMs = value.waitMs === undefined ? 5000 : value.waitMs;

  if (typeof waitMs !== 'number' || !Number.isInteger(waitMs) || waitMs < 1000 || waitMs > 60_000) {
    return undefined;
  }

  const listenMs = value.listenMs === undefined ? 3000 : value.listenMs;

  if (typeof listenMs !== 'number' || !Number.isInteger(listenMs) || listenMs < 500 || listenMs > 15_000) {
    return undefined;
  }

  const listed = Array.isArray(value.flows)
    ? value.flows.filter((flow): flow is AprsHostFlowControl => typeof flow === 'string' && FLOWS.includes(flow as AprsHostFlowControl))
    : [...FLOWS];
  const flows = listed.length > 0 ? [...new Set(listed)] : [...FLOWS];
  const defaultFlow = typeof value.defaultFlow === 'string' && flows.includes(value.defaultFlow as AprsHostFlowControl)
    ? value.defaultFlow as AprsHostFlowControl
    : flows[0]!;
  const setup = lines(value.setup, 8);
  const recovery = lines(value.recovery, 8);

  if (!setup || !recovery) {
    return undefined;
  }

  const flowHelp = typeof value.flowHelp === 'string' && value.flowHelp.trim().length > 0
    ? value.flowHelp.trim()
    : 'Flow control comes from the module.';
  const entryHint = optionalHint(value.entryHint);

  if (entryHint === null) {
    return undefined;
  }

  const aprsModeHint = optionalHint(value.aprsModeHint);
  const aprsModeLikelyHint = optionalHint(value.aprsModeLikelyHint);

  if (aprsModeHint === null || aprsModeLikelyHint === null) {
    return undefined;
  }

  return {
    link: {
      entry: 'manual',
      waitMs,
      listenMs,
      kissExit,
      enter: [],
    },
    flowControl,
    dtr,
    rts,
    flows,
    defaultFlow,
    flowHelp,
    setup,
    recovery,
    entryHint,
    aprsModeHint,
    aprsModeLikelyHint,
  };
}

function parseCommandHost(value: Record<string, unknown>): AprsHostProfile | undefined {
  if (value.entry !== undefined && value.entry !== 'command') {
    return undefined;
  }

  const interrupt = byteList(value.interrupt, 1, 16);

  if (!interrupt) {
    return undefined;
  }

  let kissExit: Uint8Array | undefined;

  if (value.kissExit !== undefined) {
    kissExit = byteList(value.kissExit, 1, 16);

    if (!kissExit) {
      return undefined;
    }
  }

  let promptNudge: Uint8Array | undefined;

  if (value.promptNudge !== undefined) {
    promptNudge = byteList(value.promptNudge, 1, 16);

    if (!promptNudge) {
      return undefined;
    }
  }

  if (typeof value.prompt !== 'string' || !printable(value.prompt, 16)) {
    return undefined;
  }

  const errorReply = typeof value.errorReply === 'string' ? value.errorReply : undefined;

  if (errorReply !== undefined && !printable(errorReply, 16)) {
    return undefined;
  }

  const waitMs = value.waitMs === undefined ? 5000 : value.waitMs;

  if (typeof waitMs !== 'number' || !Number.isInteger(waitMs) || waitMs < 1000 || waitMs > 60_000) {
    return undefined;
  }

  const listenMs = value.listenMs === undefined ? 3000 : value.listenMs;

  if (typeof listenMs !== 'number' || !Number.isInteger(listenMs) || listenMs < 500 || listenMs > 15_000) {
    return undefined;
  }

  if (!Array.isArray(value.enter) || value.enter.length < 1 || value.enter.length > 4) {
    return undefined;
  }

  const enter: AprsHostEnterStep[] = [];

  for (const step of value.enter) {
    if (!isRecord(step) || typeof step.text !== 'string' || typeof step.label !== 'string') {
      return undefined;
    }

    if (!printable(step.label, 24) || step.text.length < 1 || step.text.length > 40) {
      return undefined;
    }

    if ([...step.text].some((character) => character.charCodeAt(0) < 0x09 || character.charCodeAt(0) > 0x7e)) {
      return undefined;
    }

    enter.push({ text: step.text, label: step.label });
  }

  let flowControl: AprsHostFlowControl | undefined;

  if (value.flowControl !== undefined) {
    if (!isAprsHostFlow(value.flowControl)) {
      return undefined;
    }

    flowControl = value.flowControl;
  }

  const dtr = lineState(value.dtr);

  if (dtr === null) {
    return undefined;
  }

  const rts = lineState(value.rts);

  if (rts === null) {
    return undefined;
  }

  const listed = Array.isArray(value.flows)
    ? value.flows.filter((flow): flow is AprsHostFlowControl => typeof flow === 'string' && FLOWS.includes(flow as AprsHostFlowControl))
    : [...FLOWS];
  const flows = listed.length > 0 ? [...new Set(listed)] : [...FLOWS];
  const defaultFlow = typeof value.defaultFlow === 'string' && flows.includes(value.defaultFlow as AprsHostFlowControl)
    ? value.defaultFlow as AprsHostFlowControl
    : flows[0]!;
  const setup = lines(value.setup, 8);
  const recovery = lines(value.recovery, 8);

  if (!setup || !recovery) {
    return undefined;
  }

  const flowHelp = typeof value.flowHelp === 'string' && value.flowHelp.trim().length > 0
    ? value.flowHelp.trim()
    : 'Flow control comes from the module.';
  const aprsModeHint = optionalHint(value.aprsModeHint);
  const aprsModeLikelyHint = optionalHint(value.aprsModeLikelyHint);
  const entryHint = optionalHint(value.entryHint);

  if (aprsModeHint === null || aprsModeLikelyHint === null || entryHint === null) {
    return undefined;
  }

  return {
    link: {
      entry: 'command',
      interrupt,
      prompt: value.prompt,
      errorReply,
      waitMs,
      listenMs,
      kissExit,
      promptNudge,
      enter,
    },
    flowControl,
    dtr,
    rts,
    flows,
    defaultFlow,
    flowHelp,
    setup,
    recovery,
    aprsModeHint,
    aprsModeLikelyHint,
    entryHint,
  };
}

/**
 * Parse `aprs.host` from a module config. An unusable block is ignored.
 * The caller then offers the passive monitor only, or hides kiss-only APRS.
 */
export function parseAprsHostProfile(value: unknown): AprsHostProfile | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (value.entry === 'manual') {
    return parseManualHost(value);
  }

  return parseCommandHost(value);
}

/** A display sentence. Undefined when omitted, null when present but unusable. */
function optionalHint(value: unknown): string | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  if (!printable(trimmed, 240)) {
    return null;
  }

  return trimmed;
}

export function isAprsHostCommandLink(link: AprsHostLink | undefined): link is AprsHostLink & { entry: 'command'; interrupt: Uint8Array; prompt: string } {
  return link !== undefined
    && link.entry !== 'manual'
    && link.interrupt !== undefined
    && link.prompt !== undefined;
}