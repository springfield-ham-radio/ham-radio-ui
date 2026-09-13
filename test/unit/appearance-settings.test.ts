import { describe, it } from 'node:test';
import { expect } from 'chai';
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
    expect(defaultAppearanceSettings()).to.deep.equal({
      settingsColumns: DEFAULT_SETTINGS_COLUMNS,
    });
    expect(DEFAULT_SETTINGS_COLUMNS).to.equal(2);
  });

  it('should fall back to defaults when storage is empty or invalid', () => {
    expect(parseAppearanceSettings(null)).to.deep.equal(defaultAppearanceSettings());
    expect(parseAppearanceSettings('')).to.deep.equal(defaultAppearanceSettings());
    expect(parseAppearanceSettings('{')).to.deep.equal(defaultAppearanceSettings());
    expect(parseAppearanceSettings('[]')).to.deep.equal(defaultAppearanceSettings());
  });

  it('should parse stored column counts and ignore unknown fields', () => {
    const parsed = parseAppearanceSettings(
      JSON.stringify({
        settingsColumns: 3,
        extra: true,
      }),
    );

    expect(parsed).to.deep.equal({
      settingsColumns: 3,
    });
  });

  it('should treat a missing column count as the default', () => {
    expect(parseAppearanceSettings(JSON.stringify({}))).to.deep.equal(defaultAppearanceSettings());
  });

  it('should reject column counts outside 1 through 4', () => {
    expect(parseSettingsColumnCount(0)).to.equal(DEFAULT_SETTINGS_COLUMNS);
    expect(parseSettingsColumnCount(5)).to.equal(DEFAULT_SETTINGS_COLUMNS);
    expect(parseSettingsColumnCount(1.5)).to.equal(DEFAULT_SETTINGS_COLUMNS);
    expect(parseSettingsColumnCount('3')).to.equal(3);
    expect(parseSettingsColumnCount(1)).to.equal(1);
    expect(parseSettingsColumnCount(4)).to.equal(4);
  });

  it('should round-trip settings through serialize and parse', () => {
    const settings = {
      settingsColumns: 4 as const,
    };

    expect(parseAppearanceSettings(serializeAppearanceSettings(settings))).to.deep.equal(settings);
  });

  it('should expose the column count as a CSS custom property', () => {
    expect(settingsFieldsGridStyle(3)).to.deep.equal({
      '--settings-columns': '3',
    });
  });
});
