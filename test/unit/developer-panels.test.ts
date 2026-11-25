import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEVELOPER_PANELS_STORAGE_KEY,
  LEGACY_DEVELOPER_MODE_STORAGE_KEY,
  LEGACY_DEVELOPER_TOOLS_STORAGE_KEY,
  defaultDeveloperPanels,
  parseDeveloperPanelFlag,
  parseDeveloperPanels,
  readDeveloperPanels,
  serializeDeveloperPanels,
  writeDeveloperPanels,
} from '../../app/utils/developer-panels.ts';

describe('developer panels preference', () => {
  it('treats only explicit JSON true as on', () => {
    expect(parseDeveloperPanelFlag(true)).toBe(true);
    expect(parseDeveloperPanelFlag(false)).toBe(false);
    expect(parseDeveloperPanelFlag('1')).toBe(false);
    expect(parseDeveloperPanelFlag(1)).toBe(false);
  });

  it('defaults every panel off when storage is missing or invalid', () => {
    expect(parseDeveloperPanels(null)).toEqual(defaultDeveloperPanels());
    expect(parseDeveloperPanels('')).toEqual(defaultDeveloperPanels());
    expect(parseDeveloperPanels('not-json')).toEqual(defaultDeveloperPanels());
    expect(parseDeveloperPanels(JSON.stringify({ driverDevelopment: '1' }))).toEqual(defaultDeveloperPanels());
  });

  it('round-trips through localStorage when available', () => {
    if (typeof localStorage === 'undefined') {
      expect(readDeveloperPanels()).toEqual(defaultDeveloperPanels());
      return;
    }

    const previousPanels = localStorage.getItem(DEVELOPER_PANELS_STORAGE_KEY);
    const previousMode = localStorage.getItem(LEGACY_DEVELOPER_MODE_STORAGE_KEY);
    const previousTools = localStorage.getItem(LEGACY_DEVELOPER_TOOLS_STORAGE_KEY);

    try {
      localStorage.removeItem(DEVELOPER_PANELS_STORAGE_KEY);
      localStorage.removeItem(LEGACY_DEVELOPER_MODE_STORAGE_KEY);
      localStorage.removeItem(LEGACY_DEVELOPER_TOOLS_STORAGE_KEY);

      const panels = {
        ...defaultDeveloperPanels(),
        driverDevelopment: true,
        radioSniffer: true,
      };
      writeDeveloperPanels(panels);
      expect(JSON.parse(localStorage.getItem(DEVELOPER_PANELS_STORAGE_KEY)!)).toEqual(
        JSON.parse(serializeDeveloperPanels(panels)),
      );
      expect(readDeveloperPanels()).toEqual(panels);
    } finally {
      if (previousPanels === null) {
        localStorage.removeItem(DEVELOPER_PANELS_STORAGE_KEY);
      } else {
        localStorage.setItem(DEVELOPER_PANELS_STORAGE_KEY, previousPanels);
      }
      if (previousMode === null) {
        localStorage.removeItem(LEGACY_DEVELOPER_MODE_STORAGE_KEY);
      } else {
        localStorage.setItem(LEGACY_DEVELOPER_MODE_STORAGE_KEY, previousMode);
      }
      if (previousTools === null) {
        localStorage.removeItem(LEGACY_DEVELOPER_TOOLS_STORAGE_KEY);
      } else {
        localStorage.setItem(LEGACY_DEVELOPER_TOOLS_STORAGE_KEY, previousTools);
      }
    }
  });

  function withLegacyStorage(run: () => void): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    const previousPanels = localStorage.getItem(DEVELOPER_PANELS_STORAGE_KEY);
    const previousMode = localStorage.getItem(LEGACY_DEVELOPER_MODE_STORAGE_KEY);
    const previousTools = localStorage.getItem(LEGACY_DEVELOPER_TOOLS_STORAGE_KEY);

    try {
      localStorage.removeItem(DEVELOPER_PANELS_STORAGE_KEY);
      run();
    } finally {
      if (previousPanels === null) {
        localStorage.removeItem(DEVELOPER_PANELS_STORAGE_KEY);
      } else {
        localStorage.setItem(DEVELOPER_PANELS_STORAGE_KEY, previousPanels);
      }
      if (previousMode === null) {
        localStorage.removeItem(LEGACY_DEVELOPER_MODE_STORAGE_KEY);
      } else {
        localStorage.setItem(LEGACY_DEVELOPER_MODE_STORAGE_KEY, previousMode);
      }
      if (previousTools === null) {
        localStorage.removeItem(LEGACY_DEVELOPER_TOOLS_STORAGE_KEY);
      } else {
        localStorage.setItem(LEGACY_DEVELOPER_TOOLS_STORAGE_KEY, previousTools);
      }
    }
  }

  it('migrates legacy mode and tools flags once when both are on', () => {
    withLegacyStorage(() => {
      localStorage.setItem(LEGACY_DEVELOPER_MODE_STORAGE_KEY, '1');
      localStorage.setItem(LEGACY_DEVELOPER_TOOLS_STORAGE_KEY, '1');

      expect(readDeveloperPanels()).toEqual({
        driverDevelopment: true,
        radioDriver: true,
        radioHex: false,
        radioDebug: false,
        radioSniffer: false,
      });
      expect(localStorage.getItem(DEVELOPER_PANELS_STORAGE_KEY)).not.toBeNull();

      localStorage.setItem(LEGACY_DEVELOPER_MODE_STORAGE_KEY, '0');
      expect(readDeveloperPanels().driverDevelopment).toBe(true);
    });
  });

  it('migrates legacy developer mode only to driverDevelopment', () => {
    withLegacyStorage(() => {
      localStorage.setItem(LEGACY_DEVELOPER_MODE_STORAGE_KEY, '1');
      localStorage.removeItem(LEGACY_DEVELOPER_TOOLS_STORAGE_KEY);

      expect(readDeveloperPanels()).toEqual({
        driverDevelopment: true,
        radioDriver: false,
        radioHex: false,
        radioDebug: false,
        radioSniffer: false,
      });
    });
  });

  it('migrates legacy developer tools only to radioDriver', () => {
    withLegacyStorage(() => {
      localStorage.removeItem(LEGACY_DEVELOPER_MODE_STORAGE_KEY);
      localStorage.setItem(LEGACY_DEVELOPER_TOOLS_STORAGE_KEY, '1');

      expect(readDeveloperPanels()).toEqual({
        driverDevelopment: false,
        radioDriver: true,
        radioHex: false,
        radioDebug: false,
        radioSniffer: false,
      });
    });
  });

  it('does not enable panels from legacy values other than the string 1', () => {
    for (const legacyValue of ['0', 'true', null] as const) {
      withLegacyStorage(() => {
        if (legacyValue === null) {
          localStorage.removeItem(LEGACY_DEVELOPER_MODE_STORAGE_KEY);
          localStorage.removeItem(LEGACY_DEVELOPER_TOOLS_STORAGE_KEY);
        } else {
          localStorage.setItem(LEGACY_DEVELOPER_MODE_STORAGE_KEY, legacyValue);
          localStorage.setItem(LEGACY_DEVELOPER_TOOLS_STORAGE_KEY, legacyValue);
        }

        expect(readDeveloperPanels()).toEqual(defaultDeveloperPanels());
      });
    }
  });

  it('wires five Developer section switches in preferences', () => {
    const preferences = readFileSync('app/pages/preferences.vue', 'utf8');

    expect(preferences).toContain('aria-label="Driver development"');
    expect(preferences).toContain('aria-label="Radio Driver tab"');
    expect(preferences).toContain('aria-label="Radio Hex Dump tab"');
    expect(preferences).toContain('aria-label="Radio Debug tab"');
    expect(preferences).toContain('aria-label="Radio Sniffer tab"');
    expect(preferences).toContain('setDeveloperPanel');
    expect(preferences).toContain('useDeveloperPanels');
  });
});