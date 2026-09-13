import { RadioModelId, type RadioId } from '@springfield/ham-radio-api';

export const REMEMBERED_RADIO_STORAGE_KEY = 'ham-radio-selected-radio';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Parse the last selected radio from localStorage.
 */
export function parseRememberedRadio(raw: string | null): RadioId | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }

    const record = parsed as Record<string, unknown>;

    if (!isNonEmptyString(record.model) || !isNonEmptyString(record.name) || !isNonEmptyString(record.manufacturer)) {
      return undefined;
    }

    return {
      model: RadioModelId(record.model),
      name: record.name,
      manufacturer: record.manufacturer,
    };
  } catch {
    return undefined;
  }
}

export function serializeRememberedRadio(radioId: RadioId): string {
  return JSON.stringify({
    model: String(radioId.model),
    name: radioId.name,
    manufacturer: radioId.manufacturer,
  });
}

export function readRememberedRadio(): RadioId | undefined {
  if (!import.meta.client) {
    return undefined;
  }

  try {
    return parseRememberedRadio(localStorage.getItem(REMEMBERED_RADIO_STORAGE_KEY));
  } catch {
    return undefined;
  }
}

/**
 * Persist the last radio the user chose in Import or by opening a memory file.
 */
export function writeRememberedRadio(radioId: RadioId): void {
  if (!import.meta.client || radioId.model.length === 0 || radioId.name.length === 0 || radioId.manufacturer.length === 0) {
    return;
  }

  localStorage.setItem(REMEMBERED_RADIO_STORAGE_KEY, serializeRememberedRadio(radioId));
}

/**
 * Return the catalog radio that matches a remembered selection, if it is still installed.
 */
export function resolveRememberedRadio(remembered: RadioId | undefined, available: RadioId[]): RadioId | undefined {
  if (!remembered) {
    return undefined;
  }

  return available.find((radioId) => radioId.model === remembered.model);
}
