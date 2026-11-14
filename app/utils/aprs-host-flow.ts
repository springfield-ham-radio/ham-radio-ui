import type { AprsHostFlowControl } from '~/utils/aprs-serial-options';

/** Per-radio host flow chosen on the APRS COM row. Packet reads the same map. */
export const APRS_HOST_FLOW_STORAGE_KEY = 'hbench.aprs.host-flow';

export interface AprsHostFlowStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function isAprsHostFlow(value: unknown): value is AprsHostFlowControl {
  return value === 'software' || value === 'none' || value === 'hardware';
}

function parseFlowMap(raw: string | null): Record<string, AprsHostFlowControl> {
  if (!raw) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const flows: Record<string, AprsHostFlowControl> = {};

    for (const [radioId, flow] of Object.entries(parsed)) {
      const id = radioId.trim();

      if (id.length > 0 && isAprsHostFlow(flow)) {
        flows[id] = flow;
      }
    }

    return flows;
  } catch {
    return {};
  }
}

/** Flow last chosen for this radio. Undefined when the operator has not chosen one. */
export function readAprsHostFlow(storage: AprsHostFlowStorage, radioId: string): AprsHostFlowControl | undefined {
  const id = radioId.trim();

  if (id.length === 0) {
    return undefined;
  }

  return parseFlowMap(storage.getItem(APRS_HOST_FLOW_STORAGE_KEY))[id];
}

/** Remember the APRS host flow for this radio. Other radios stay as they were. */
export function writeAprsHostFlow(storage: AprsHostFlowStorage, radioId: string, flow: AprsHostFlowControl): void {
  const id = radioId.trim();

  if (id.length === 0 || !isAprsHostFlow(flow)) {
    return;
  }

  const flows = parseFlowMap(storage.getItem(APRS_HOST_FLOW_STORAGE_KEY));
  flows[id] = flow;
  storage.setItem(APRS_HOST_FLOW_STORAGE_KEY, JSON.stringify(flows));
}

/**
 * Flow used to open the shared host session.
 *
 * The saved per-radio choice wins. The module `defaultFlow` is only the
 * fallback when this radio has no saved choice.
 */
export function aprsHostFlowForConnect(
  saved: AprsHostFlowControl | undefined,
  moduleDefault: AprsHostFlowControl | undefined,
): AprsHostFlowControl {
  return saved ?? moduleDefault ?? 'software';
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
