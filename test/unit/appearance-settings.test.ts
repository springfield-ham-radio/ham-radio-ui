import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS_COLUMNS,
  defaultAppearanceSettings,
  parseAppearanceSettings,
  parseSettingsColumnCount,
  serializeAppearanceSettings,
  settingsFieldsGridStyle,
} from '../../app/utils/appearance-settings.ts';

describe('appearance settings', () => {
  it('should default to two settings columns', () => {
    expect(defaultAppearanceSettings()).toEqual({
      settingsColumns: DEFAULT_SETTINGS_COLUMNS,
    });
    expect(DEFAULT_SETTINGS_COLUMNS).toBe(2);
  });

  it('should fall back to defaults when storage is empty or invalid', () => {
    expect(parseAppearanceSettings(null)).toEqual(defaultAppearanceSettings());
    expect(parseAppearanceSettings('')).toEqual(defaultAppearanceSettings());
    expect(parseAppearanceSettings('{')).toEqual(defaultAppearanceSettings());
    expect(parseAppearanceSettings('[]')).toEqual(defaultAppearanceSettings());
  });

  it('should parse stored column counts and ignore unknown fields', () => {
    const parsed = parseAppearanceSettings(
      JSON.stringify({
        settingsColumns: 3,
        extra: true,
      }),
    );

    expect(parsed).toEqual({
      settingsColumns: 3,
    });
  });

  it('should treat a missing column count as the default', () => {
    expect(parseAppearanceSettings(JSON.stringify({}))).toEqual(defaultAppearanceSettings());
  });

  it('should reject column counts outside 1 through 4', () => {
    expect(parseSettingsColumnCount(0)).toBe(DEFAULT_SETTINGS_COLUMNS);
    expect(parseSettingsColumnCount(5)).toBe(DEFAULT_SETTINGS_COLUMNS);
    expect(parseSettingsColumnCount(1.5)).toBe(DEFAULT_SETTINGS_COLUMNS);
    expect(parseSettingsColumnCount('3')).toBe(3);
    expect(parseSettingsColumnCount(1)).toBe(1);
    expect(parseSettingsColumnCount(4)).toBe(4);
  });

  it('should round-trip settings through serialize and parse', () => {
    const settings = {
      settingsColumns: 4 as const,
    };

    expect(parseAppearanceSettings(serializeAppearanceSettings(settings))).toEqual(settings);
  });

  it('should expose the column count as a CSS custom property', () => {
    expect(settingsFieldsGridStyle(3)).toEqual({
      '--settings-columns': '3',
    });
  });
});
