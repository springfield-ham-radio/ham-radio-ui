import type { AprsHostFlowControl } from '~/utils/aprs-serial-options';

/**
 * Host-command procedure from an installed radio module.
 *
 * The bytes and the prompt text belong to that module. HamBench does not
 * invent a Kenwood command for a radio that omits this block. Host Connect
 * runs the detection sequence from this block. A prompt is not proof of
 * packet mode. `kissExit` is optional and is not invented here.
 */
export interface AprsHostEnterStep {
  text: string;
  label: string;
}

export interface AprsHostLink {
  interrupt: Uint8Array;
  prompt: string;
  errorReply?: string;
  waitMs: number;
  /** How long Connect listens before the prompt request. Default 3000. */
  listenMs: number;
  /**
   * Optional KISS-exit bytes, sent once only when Connect hears silence
   * after the prompt request. Omitted means that step is skipped.
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
  flows: readonly AprsHostFlowControl[];
  defaultFlow: AprsHostFlowControl;
  flowHelp: string;
  setup: readonly string[];
  recovery: readonly string[];
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

/**
 * Parse `aprs.host` from a module config. An unusable block is ignored.
 * The caller then offers the passive monitor only.
 */
export function parseAprsHostProfile(value: unknown): AprsHostProfile | undefined {
  if (!isRecord(value)) {
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
    : 'Flow control is chosen before Connect.';

  return {
    link: { interrupt, prompt: value.prompt, errorReply, waitMs, listenMs, kissExit, promptNudge, enter },
    flows,
    defaultFlow,
    flowHelp,
    setup,
    recovery,
  };
}
