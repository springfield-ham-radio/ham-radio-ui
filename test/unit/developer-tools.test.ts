import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseDeveloperTools,
  readDeveloperTools,
  writeDeveloperTools,
  DEVELOPER_TOOLS_STORAGE_KEY,
} from '../../app/utils/developer-tools.ts';

describe('developer tools preference', () => {
  it('treats only the stored flag 1 as on', () => {
    expect(parseDeveloperTools('1')).toBe(true);
    expect(parseDeveloperTools('0')).toBe(false);
    expect(parseDeveloperTools(null)).toBe(false);
    expect(parseDeveloperTools('true')).toBe(false);
  });

  it('round-trips through localStorage when available', () => {
    if (typeof localStorage === 'undefined') {
      expect(readDeveloperTools()).toBe(false);
      return;
    }

    const previous = localStorage.getItem(DEVELOPER_TOOLS_STORAGE_KEY);

    try {
      writeDeveloperTools(true);
      expect(localStorage.getItem(DEVELOPER_TOOLS_STORAGE_KEY)).toBe('1');
      expect(readDeveloperTools()).toBe(true);

      writeDeveloperTools(false);
      expect(localStorage.getItem(DEVELOPER_TOOLS_STORAGE_KEY)).toBe('0');
      expect(readDeveloperTools()).toBe(false);
    } finally {
      if (previous === null) {
        localStorage.removeItem(DEVELOPER_TOOLS_STORAGE_KEY);
      } else {
        localStorage.setItem(DEVELOPER_TOOLS_STORAGE_KEY, previous);
      }
    }
  });

  it('wires the Developer section switch in preferences', () => {
    const preferences = readFileSync('app/pages/preferences.vue', 'utf8');

    expect(preferences).toContain('aria-label="Developer tools"');
    expect(preferences).toContain('setDeveloperToolsEnabled');
    expect(preferences).toContain("currentSection === 'developer'");
    expect(preferences).toContain('useDeveloperTools');
  });
});