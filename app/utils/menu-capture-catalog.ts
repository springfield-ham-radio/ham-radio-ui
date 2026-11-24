import type { RadioId, RadioMemoryMap } from '@springfield/ham-radio-api';
import type { LoadedRadioConfig } from '~/utils/radio-catalog-db';
import { memoryMapFromConfig } from '~/utils/radio-catalog-db';

/** Same lookup as `RadioReadDialog` when resolving the driver for a saved radio. */
export function loadedRadioConfigForCardModel(
  model: string | undefined,
  configurations: readonly LoadedRadioConfig[],
): LoadedRadioConfig | undefined {
  if (!model) {
    return undefined;
  }

  return configurations.find((config) => String(config.id.model) === model);
}

export type MenuCaptureWizardGate = 'desktop-required' | 'driver-missing' | 'port-missing' | 'ready';

/** Which blocking alert (if any) the menu capture tab should show. */
export function menuCaptureWizardGate(input: {
  canPersist: boolean;
  model: string | undefined;
  serialPort: string | undefined;
  configurations: readonly LoadedRadioConfig[];
}): MenuCaptureWizardGate {
  if (!input.canPersist) {
    return 'desktop-required';
  }

  if (input.model && !loadedRadioConfigForCardModel(input.model, input.configurations)) {
    return 'driver-missing';
  }

  if (!input.model || !input.serialPort) {
    return 'port-missing';
  }

  return 'ready';
}

export function canStartMenuCaptureSession(input: {
  savedRadioId: string | undefined;
  serialPort: string | undefined;
  config: LoadedRadioConfig | undefined;
}): boolean {
  if (!input.savedRadioId || !input.serialPort || !input.config?.writeMemory) {
    return false;
  }

  return true;
}

/**
 * Driver identity for menu capture transfers without loading editor memory.
 * Uses the open session when present, otherwise the saved card model in the catalog.
 */
export function radioIdForMenuCaptureSession(
  sessionActiveRadioId: RadioId | undefined,
  cardModel: string | undefined,
  configurations: readonly LoadedRadioConfig[],
): RadioId | undefined {
  if (sessionActiveRadioId) {
    return sessionActiveRadioId;
  }

  return loadedRadioConfigForCardModel(cardModel, configurations)?.id;
}

/** Settings map after a full read, otherwise the driver's catalog memory map. */
export function menuCaptureMemoryMap(
  settingsMemoryMap: RadioMemoryMap | undefined,
  config: LoadedRadioConfig | undefined,
): RadioMemoryMap | undefined {
  if (settingsMemoryMap) {
    return settingsMemoryMap;
  }

  return config ? memoryMapFromConfig(config) : undefined;
}