export const APPEARANCE_SETTINGS_STORAGE_KEY = 'ham-radio-appearance';

export const SETTINGS_COLUMN_COUNTS = [1, 2, 3, 4] as const;

export type SettingsColumnCount = (typeof SETTINGS_COLUMN_COUNTS)[number];

/** Default Settings tab layout: two fields per row from the `sm` breakpoint up. */
export const DEFAULT_SETTINGS_COLUMNS: SettingsColumnCount = 2;

export interface AppearanceSettings {
  /** Number of fields per row on the Radio Settings tab and channel editors. */
  settingsColumns: SettingsColumnCount;
}

/**
 * Coerce a stored or UI value to a supported column count.
 *
 * Counts outside 1–4 fall back to two columns so a corrupt preference cannot
 * collapse or overflow the settings layout.
 */
export function parseSettingsColumnCount(value: unknown): SettingsColumnCount {
  const count = typeof value === 'string' ? Number(value) : value;

  if (count === 1 || count === 2 || count === 3 || count === 4) {
    return count;
  }

  return DEFAULT_SETTINGS_COLUMNS;
}

/** Default appearance preferences: two settings columns. */
export function defaultAppearanceSettings(): AppearanceSettings {
  return {
    settingsColumns: DEFAULT_SETTINGS_COLUMNS,
  };
}

/**
 * Parse appearance preferences from localStorage.
 *
 * A missing or invalid column count is treated as two so the Settings tab
 * matches the layout used before this preference existed.
 */
export function parseAppearanceSettings(raw: string | null): AppearanceSettings {
  const defaults = defaultAppearanceSettings();

  if (!raw) {
    return defaults;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return defaults;
    }

    const record = parsed as Record<string, unknown>;

    return {
      settingsColumns: parseSettingsColumnCount(record.settingsColumns),
    };
  } catch {
    return defaults;
  }
}

export function serializeAppearanceSettings(settings: AppearanceSettings): string {
  return JSON.stringify({
    settingsColumns: parseSettingsColumnCount(settings.settingsColumns),
  });
}

/**
 * Bind the chosen column count to the settings field grid.
 *
 * The CSS custom property is read by `.settings-fields-grid` from `sm` up.
 */
export function settingsFieldsGridStyle(columns: SettingsColumnCount): Record<string, string> {
  return {
    '--settings-columns': String(columns),
  };
}

export function readAppearanceSettings(): AppearanceSettings {
  if (!import.meta.client) {
    return defaultAppearanceSettings();
  }

  try {
    return parseAppearanceSettings(localStorage.getItem(APPEARANCE_SETTINGS_STORAGE_KEY));
  } catch {
    return defaultAppearanceSettings();
  }
}

export function writeAppearanceSettings(settings: AppearanceSettings): void {
  if (!import.meta.client) {
    return;
  }

  localStorage.setItem(APPEARANCE_SETTINGS_STORAGE_KEY, serializeAppearanceSettings(settings));
}
