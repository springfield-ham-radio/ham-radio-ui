import type { AprsHostFlowControl } from '~/utils/aprs-serial-options';

/**
 * Per-radio value saved by the removed flow-control menu.
 * Connect does not read it. Opening the TNC bar deletes the key.
 */
export const APRS_HOST_FLOW_STORAGE_KEY = 'hbench.aprs.host-flow';

export interface AprsHostFlowStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function isAprsHostFlow(value: unknown): value is AprsHostFlowControl {
  return value === 'software' || value === 'none' || value === 'hardware';
}

/** Drop the old menu so a saved choice cannot override the module. */
export function clearAprsHostFlowPreference(storage: AprsHostFlowStorage): void {
  storage.removeItem(APRS_HOST_FLOW_STORAGE_KEY);
}

export function browserAprsHostFlowStorage(): AprsHostFlowStorage | undefined {
  if (!import.meta.client) {
    return undefined;
  }

  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

export interface AprsTncFlowInput {
  /** `aprs.host.flowControl` when the installed module published a recognized value. */
  declared: AprsHostFlowControl | undefined;
  mode: 'host' | 'passive';
  /**
   * True for a TM-D710 model id or name.
   *
   * Kenwood 1.15.1 omits `flowControl` and keeps `defaultFlow: "software"`
   * so older HamBench builds leave their menu default alone. That software
   * value is not the RTS/CTS setting verified on the D710A COM jack.
   */
  d710Family: boolean;
}

/**
 * Flow control applied when the shared TNC port opens.
 *
 * Host and Monitor only both use `aprs.host.flowControl` when the module
 * declares it. `defaultFlow` and a saved menu choice are not consulted.
 *
 * When the field is missing, a TM-D710 host open uses hardware RTS/CTS.
 * Monitor only on that older module stays off, which is how this app
 * already opened the passive session. Any other module keeps the previous
 * defaults: software (XON/XOFF) for Host, and off for Monitor only.
 */
export function aprsTncFlowControl(input: AprsTncFlowInput): AprsHostFlowControl {
  if (input.declared) {
    return input.declared;
  }

  if (input.mode === 'host' && input.d710Family) {
    return 'hardware';
  }

  return input.mode === 'host' ? 'software' : 'none';
}

/** Short read-only line for the shared connection bar. Not a control. */
export function aprsFlowControlNote(flow: AprsHostFlowControl): string {
  if (flow === 'hardware') {
    return 'Flow control is hardware (RTS/CTS).';
  }

  if (flow === 'none') {
    return 'Flow control is off.';
  }

  return 'Flow control is software (XON/XOFF).';
}
