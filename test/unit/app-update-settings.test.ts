import { describe, expect, it } from 'vitest';
import {
  defaultAppUpdateSettings,
  parseAppUpdateSettings,
  serializeAppUpdateSettings,
} from '../../app/utils/app-update-settings.ts';

describe('app update settings', () => {
  it('should enable auto-update by default', () => {
    expect(defaultAppUpdateSettings()).toEqual({
      autoUpdateEnabled: true,
      lastCheckAt: undefined,
    });
  });

  it('should fall back to defaults when storage is empty or invalid', () => {
    expect(parseAppUpdateSettings(null)).toEqual(defaultAppUpdateSettings());
    expect(parseAppUpdateSettings('')).toEqual(defaultAppUpdateSettings());
    expect(parseAppUpdateSettings('{')).toEqual(defaultAppUpdateSettings());
    expect(parseAppUpdateSettings('[]')).toEqual(defaultAppUpdateSettings());
  });

  it('should parse stored settings and ignore unknown fields', () => {
    const parsed = parseAppUpdateSettings(
      JSON.stringify({
        autoUpdateEnabled: false,
        lastCheckAt: '2026-08-28T12:00:00.000Z',
        extra: true,
      }),
    );

    expect(parsed).toEqual({
      autoUpdateEnabled: false,
      lastCheckAt: '2026-08-28T12:00:00.000Z',
    });
  });

  it('should treat a missing auto-update flag as enabled', () => {
    expect(parseAppUpdateSettings(JSON.stringify({ lastCheckAt: '2026-08-28T12:00:00.000Z' }))).toEqual({
      autoUpdateEnabled: true,
      lastCheckAt: '2026-08-28T12:00:00.000Z',
    });
  });

  it('should round-trip settings through serialize and parse', () => {
    const settings = {
      autoUpdateEnabled: false,
      lastCheckAt: '2026-08-28T12:00:00.000Z',
    };

    expect(parseAppUpdateSettings(serializeAppUpdateSettings(settings))).toEqual(settings);
  });
});
