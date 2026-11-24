export const DEVELOPER_TOOLS_STORAGE_KEY = 'ham-radio-developer-tools';

/**
 * Developer tools is on only when the stored flag is the string "1".
 * Anything else, including a missing value, stays off.
 */
export function parseDeveloperTools(raw: string | null): boolean {
  return raw === '1';
}

/** Read the Developer tools preference from localStorage. */
export function readDeveloperTools(): boolean {
  if (typeof localStorage === 'undefined') {
    return false;
  }

  return parseDeveloperTools(localStorage.getItem(DEVELOPER_TOOLS_STORAGE_KEY));
}

/** Persist the Developer tools preference. */
export function writeDeveloperTools(enabled: boolean): void {
  localStorage.setItem(DEVELOPER_TOOLS_STORAGE_KEY, enabled ? '1' : '0');
}