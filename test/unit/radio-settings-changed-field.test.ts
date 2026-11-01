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
    expect(source).toContain('visibleMenuNumber(field)');

    const preferences = readFileSync('app/pages/preferences.vue', 'utf8');
    expect(preferences).toContain('aria-label="Show radio menu numbers"');
    expect(preferences).toContain('setShowMenuNumbers');

    const fields = source.slice(source.indexOf('v-for="field in section.fields"'));

    for (const tag of ['UInputNumber', 'USelect', 'USwitch', 'UInput']) {
      const match = fields.match(new RegExp(`<${tag}(?![A-Za-z])[\\s\\S]*?/>`));

      expect(match, tag).not.toBeNull();
      expect(match?.[0]).toContain('changedControlBindings(field.path)');
    }
  });
});
