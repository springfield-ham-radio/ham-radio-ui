import type { RadioProtocolStep } from '@springfield/ham-radio-api';

/**
 * Driver-declared live PC-port control. Matches ham-radio-registry `RadioCatConfig`.
 */
export interface RadioCatConfig {
  protocol: string;
  dialect?: string;
}

export interface RadioCatCapability {
  id?: {
    manufacturer?: string;
  };
  capabilities?: {
    liveControl?: boolean;
  };
  cat?: RadioCatConfig;
  readMemory?: RadioProtocolStep[];
  writeMemory?: RadioProtocolStep[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKenwoodCatProtocol(protocol: string | undefined): boolean {
  const normalized = protocol?.trim().toLowerCase();
  return normalized === undefined || normalized === '' || normalized === 'kenwood';
}

function protocolHasCatMemory(steps: RadioProtocolStep[] | undefined): boolean {
  if (!steps) {
    return false;
  }

  return steps.some((step) => isRecord(step) && ('catRead' in step || 'catWrite' in step));
}

function tokenIsCarriageReturn(token: unknown): boolean {
  return token === '0x0D' || token === '0x0d' || token === 0x0d;
}

function protocolSendsKenwoodId(steps: RadioProtocolStep[] | undefined): boolean {
  if (!steps) {
    return false;
  }

  return steps.some((step) => {
    if (!isRecord(step) || !Array.isArray(step.send)) {
      return false;
    }

    const send = step.send;

    for (let index = 0; index < send.length - 2; index++) {
      if (send[index] === 'I' && send[index + 1] === 'D' && tokenIsCarriageReturn(send[index + 2])) {
        return true;
      }
    }

    return false;
  });
}

/**
 * True when HamBench can open a Kenwood CAT session for this radio.
 *
 * Prefer `capabilities.liveControl` from the driver. Modules published before
 * that flag still match via `catRead`/`catWrite`, a Kenwood `ID\r` handshake,
 * or manufacturer Kenwood.
 */
export function radioSupportsLiveCat(radio: RadioCatCapability): boolean {
  if (radio.capabilities?.liveControl === true) {
    return isKenwoodCatProtocol(radio.cat?.protocol);
  }

  if (radio.capabilities?.liveControl === false) {
    return false;
  }

  if (protocolHasCatMemory(radio.readMemory) || protocolHasCatMemory(radio.writeMemory)) {
    return true;
  }

  if (protocolSendsKenwoodId(radio.readMemory) || protocolSendsKenwoodId(radio.writeMemory)) {
    return true;
  }

  return radio.id?.manufacturer?.toLowerCase() === 'kenwood';
}
