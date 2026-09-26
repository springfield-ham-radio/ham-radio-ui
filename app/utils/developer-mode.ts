export const DEVELOPER_MODE_STORAGE_KEY = 'ham-radio-developer-mode';

/**
 * Developer mode is on only when the stored flag is the string "1".
 * Anything else, including a missing value, stays off so the Driver page stays hidden.
 */
export function parseDeveloperMode(raw: string | null): boolean {
  return raw === '1';
}

/** Read the View-menu developer-mode flag from localStorage. */
export function readDeveloperMode(): boolean {
  if (typeof localStorage === 'undefined') {
    return false;
  }

  return parseDeveloperMode(localStorage.getItem(DEVELOPER_MODE_STORAGE_KEY));
}

/** Persist the View-menu developer-mode flag. */
export function writeDeveloperMode(enabled: boolean): void {
  localStorage.setItem(DEVELOPER_MODE_STORAGE_KEY, enabled ? '1' : '0');
}
