import { compareSemver } from '@springfield/ham-radio-registry';

export const DRIVER_UPDATE_DISMISSALS_STORAGE_KEY = 'ham-radio-driver-update-dismissals';

/** Catalog version dismissed per installed driver model id. */
export type DriverUpdateDismissals = Record<string, string>;

export function parseDriverUpdateDismissals(raw: string | null): DriverUpdateDismissals {
  if (!raw) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const dismissals: DriverUpdateDismissals = {};

    for (const [modelId, version] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof modelId === 'string' && modelId.length > 0 && typeof version === 'string' && version.length > 0) {
        dismissals[modelId] = version;
      }
    }

    return dismissals;
  } catch {
    return {};
  }
}

export function serializeDriverUpdateDismissals(dismissals: DriverUpdateDismissals): string {
  return JSON.stringify(dismissals);
}

export function readDriverUpdateDismissals(): DriverUpdateDismissals {
  if (!import.meta.client) {
    return {};
  }

  try {
    return parseDriverUpdateDismissals(localStorage.getItem(DRIVER_UPDATE_DISMISSALS_STORAGE_KEY));
  } catch {
    return {};
  }
}

export function writeDriverUpdateDismissals(dismissals: DriverUpdateDismissals): void {
  if (!import.meta.client) {
    return;
  }

  localStorage.setItem(DRIVER_UPDATE_DISMISSALS_STORAGE_KEY, serializeDriverUpdateDismissals(dismissals));
}

export function dismissDriverUpdate(modelId: string, catalogVersion: string): void {
  const next = { ...readDriverUpdateDismissals(), [modelId]: catalogVersion };
  writeDriverUpdateDismissals(next);
}

/**
 * True when the catalog version should surface in the update banner again.
 */
export function isDriverUpdateDismissed(
  modelId: string,
  catalogVersion: string,
  dismissals: DriverUpdateDismissals,
): boolean {
  const dismissedVersion = dismissals[modelId];

  if (!dismissedVersion) {
    return false;
  }

  return compareSemver(catalogVersion, dismissedVersion) <= 0;
}
