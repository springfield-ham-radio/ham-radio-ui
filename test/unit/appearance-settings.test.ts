import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS_COLUMNS,
  defaultAppearanceSettings,
  parseAppearanceSettings,
  parseSettingsColumnCount,
  parseShowMenuNumbers,
  serializeAppearanceSettings,
  settingsFieldsGridStyle,
} from '../../app/utils/appearance-settings.ts';

describe('appearance settings', () => {
  it('should default to two settings columns', () => {
    expect(defaultAppearanceSettings()).toEqual({
      settingsColumns: DEFAULT_SETTINGS_COLUMNS,
      mapStyle: 'theme',
      showMenuNumbers: false,
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
      mapStyle: 'theme',
      showMenuNumbers: false,
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
      mapStyle: 'bright' as const,
      showMenuNumbers: true,
    };

    expect(parseAppearanceSettings(serializeAppearanceSettings(settings))).toEqual(settings);
  });

  it('should round-trip a custom map style URL and drop invalid values', () => {
    const custom = 'https://example.com/maps/style.json';
    const withCustom = {
      settingsColumns: 2 as const,
      mapStyle: 'theme' as const,
      customMapStyleUrl: custom,
      showMenuNumbers: false,
    };

    expect(parseAppearanceSettings(serializeAppearanceSettings(withCustom))).toEqual(withCustom);
    expect(
      parseAppearanceSettings(
        JSON.stringify({
          settingsColumns: 2,
          mapStyle: 'theme',
          customMapStyleUrl: 'http://insecure.example/style.json',
        }),
      ),
    ).toEqual({
      settingsColumns: 2,
      mapStyle: 'theme',
      showMenuNumbers: false,
    });
  });

  it('should keep a stored column count when the map style is missing or unknown', () => {
    expect(parseAppearanceSettings(JSON.stringify({ settingsColumns: 1 }))).toEqual({
      settingsColumns: 1,
      mapStyle: 'theme',
      showMenuNumbers: false,
    });
    expect(parseAppearanceSettings(JSON.stringify({ settingsColumns: 2, mapStyle: 'watercolor' }))).toEqual({
      settingsColumns: 2,
      mapStyle: 'theme',
      showMenuNumbers: false,
    });
  });

  it('should keep menu numbers off unless the stored flag is true', () => {
    expect(parseShowMenuNumbers(undefined)).toBe(false);
    expect(parseShowMenuNumbers('true')).toBe(false);
    expect(parseShowMenuNumbers(1)).toBe(false);
    expect(parseShowMenuNumbers(false)).toBe(false);
    expect(parseShowMenuNumbers(true)).toBe(true);

    expect(parseAppearanceSettings(JSON.stringify({ showMenuNumbers: true }))).toEqual({
      settingsColumns: DEFAULT_SETTINGS_COLUMNS,
      mapStyle: 'theme',
      showMenuNumbers: true,
    });
    expect(parseAppearanceSettings(JSON.stringify({ settingsColumns: 1, showMenuNumbers: 'yes' }))).toEqual({
      settingsColumns: 1,
      mapStyle: 'theme',
      showMenuNumbers: false,
    });
  });

  it('should expose the column count as a CSS custom property', () => {
    expect(settingsFieldsGridStyle(3)).toEqual({
      '--settings-columns': '3',
    });
  });
});
