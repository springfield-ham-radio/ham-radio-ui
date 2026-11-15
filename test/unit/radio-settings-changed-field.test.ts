import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('changed settings fields', () => {
  it('should mark the control with Nuxt UI highlight instead of a square left border', () => {
    const source = readFileSync('app/components/RadioSettingsForm.vue', 'utf8');

    expect(source).not.toContain('border-s-2');
    expect(source).not.toContain('bg-warning/10');
    expect(source).toContain("color: 'warning'");
    expect(source).toContain('highlight: true');
    expect(source).toContain('showMenuNumbers');
    expect(source).toContain('settingsFieldLabel');
    expect(source).toContain('visibleMenuNumber(cell.field)');

    const preferences = readFileSync('app/pages/preferences.vue', 'utf8');
    expect(preferences).toContain('aria-label="Show radio menu numbers"');
    expect(preferences).toContain('setShowMenuNumbers');

    expect(source).toContain('layoutSettingsFields(section.fields)');

    const fields = source.slice(source.indexOf('class="settings-fields-grid"'));

    for (const tag of ['UInputNumber', 'USelect', 'USwitch', 'UInput']) {
      const matches = [...fields.matchAll(new RegExp(`<${tag}(?![A-Za-z])[\\s\\S]*?/>`, 'g'))];

      expect(matches.length, tag).toBeGreaterThan(0);

      for (const match of matches) {
        expect(match[0]).toMatch(/changedControlBindings\((?:cell\.)?field\.path\)/);
      }
    }
  });
});
