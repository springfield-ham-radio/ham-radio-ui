import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('changed settings fields', () => {
  it('should mark the control with Nuxt UI highlight instead of a square left border', () => {
    const source = readFileSync('app/components/SettingsFieldGrid.vue', 'utf8');
    const form = readFileSync('app/components/RadioSettingsForm.vue', 'utf8');

    expect(source).not.toContain('border-s-2');
    expect(source).not.toContain('bg-warning/10');
    expect(source).toContain("color: 'warning'");
    expect(source).toContain('highlight: true');
    expect(source).toContain('showMenuNumbers');
    expect(source).toContain('visibleMenuNumber(cell.field)');
    expect(source).toContain(':aria-label="`${cell.label} degrees`"');
    expect(source).toContain(':aria-label="`${cell.label} minutes`"');
    expect(source).toContain('aria-hidden="true">°</span>');
    expect(source).toContain('aria-hidden="true">′</span>');
    expect(source).not.toContain('class="w-full"\n          @update:model-value="editCoordinate');
    expect(form).toContain('layoutSettingsSection(section.fields)');

    const preferences = readFileSync('app/pages/preferences.vue', 'utf8');
    expect(preferences).toContain('aria-label="Show radio menu numbers"');
    expect(preferences).toContain('setShowMenuNumbers');

    const fields = source.slice(source.indexOf('class="settings-fields-grid"'));

    for (const tag of ['UInputNumber', 'USelect', 'USwitch', 'UInput']) {
      const matches = [...fields.matchAll(new RegExp(`<${tag}(?![A-Za-z])[\\s\\S]*?/>`, 'g'))];

      expect(matches.length, tag).toBeGreaterThan(0);

      for (const match of matches) {
        expect(match[0]).toMatch(/changed(?:ControlBindings\((?:cell\.)?field\.path\)|CoordinateBindings\(cell\))/);
      }
    }
  });
});
