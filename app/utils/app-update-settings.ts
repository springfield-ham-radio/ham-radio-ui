export const APP_UPDATE_STORAGE_KEY = 'ham-radio-app-update';

/** How often the desktop app polls GitHub Releases for a newer installer. */
export const DEFAULT_UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

export interface AppUpdateSettings {
  autoUpdateEnabled: boolean;
  lastCheckAt: string | undefined;
}

/** Default updater preferences: auto-update on, no check has run yet. */
export function defaultAppUpdateSettings(): AppUpdateSettings {
  return {
    autoUpdateEnabled: true,
    lastCheckAt: undefined,
  };
}

/**
 * Parse updater preferences from localStorage.
 *
 * Auto-update is on by default so packaged builds keep themselves current
 * without a settings visit. lastCheckAt throttles background polling.
 */
export function parseAppUpdateSettings(raw: string | null): AppUpdateSettings {
  const defaults = defaultAppUpdateSettings();

  if (!raw) {
    return defaults;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return defaults;
    }

    const record = parsed as Record<string, unknown>;
    const lastCheckAt = typeof record.lastCheckAt === 'string' ? record.lastCheckAt : undefined;

    return {
      autoUpdateEnabled: record.autoUpdateEnabled === undefined ? true : record.autoUpdateEnabled === true,
      lastCheckAt,
    };
  } catch {
    return defaults;
  }
}

export function serializeAppUpdateSettings(settings: AppUpdateSettings): string {
  return JSON.stringify({
    autoUpdateEnabled: settings.autoUpdateEnabled,
    lastCheckAt: settings.lastCheckAt,
  });
}

export function readAppUpdateSettings(): AppUpdateSettings {
  if (!import.meta.client) {
    return defaultAppUpdateSettings();
  }

  try {
    return parseAppUpdateSettings(localStorage.getItem(APP_UPDATE_STORAGE_KEY));
  } catch {
    return defaultAppUpdateSettings();
  }
}

export function writeAppUpdateSettings(settings: AppUpdateSettings): void {
  if (!import.meta.client) {
    return;
  }

  localStorage.setItem(APP_UPDATE_STORAGE_KEY, serializeAppUpdateSettings(settings));
}
