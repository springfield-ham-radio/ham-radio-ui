import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('toggle group pickers', () => {
  it('uses layout UToggleGroup on the radio board', () => {
    const source = readFileSync(new URL('../../app/components/RadioBoard.vue', import.meta.url), 'utf8');

    expect(source).toContain('<UToggleGroup');
    expect(source).toContain("value: 'tabs'");
    expect(source).toContain("'aria-label': 'Show radios in tabs'");
    expect(source).toContain('requiredToggleGroupModel');
    expect(source).not.toContain('selectLayout(');
  });

  it('uses toggle groups for channel library filters', () => {
    const source = readFileSync(new URL('../../app/pages/channels.vue', import.meta.url), 'utf8');
    const filterRow = source.slice(source.indexOf('flex flex-col gap-1'), source.indexOf('Could not load channel library'));

    expect(filterRow).toContain('v-model="onAirFilterToggle"');
    expect(filterRow).toContain('v-model="linkedFilterToggle"');
    expect(filterRow).toContain('v-model="tripOpenFilterToggle"');
    expect(filterRow).not.toContain('label="On-air" class="w-32');
    expect(filterRow).not.toMatch(/label="On-air"[\s\S]*?<USelect/);
  });

  it('uses icon toggle group for theme preference', () => {
    const source = readFileSync(new URL('../../app/components/ThemeSelect.vue', import.meta.url), 'utf8');

    expect(source).toContain('<UToggleGroup');
    expect(source).toContain('i-lucide-monitor');
    expect(source).toContain('<ClientOnly>');
    expect(source).not.toContain('<USelect');
  });

  it('uses toggle group for distance units', () => {
    const source = readFileSync(new URL('../../app/components/DistanceUnitPreference.vue', import.meta.url), 'utf8');

    expect(source).toContain('<UToggleGroup');
    expect(source).toContain('aria-label="Distance units"');
    expect(source).not.toContain('<USelect');
  });

  it('uses compact toggle groups for wavebench frequency units', () => {
    const modulation = readFileSync(new URL('../../app/components/WaveBenchModulationLab.vue', import.meta.url), 'utf8');
    const filter = readFileSync(new URL('../../app/components/WaveBenchFilterLab.vue', import.meta.url), 'utf8');

    expect(modulation.match(/<UToggleGroup/g)?.length).toBe(3);
    expect(modulation).not.toMatch(/frequencyUnitItems[\s\S]*<USelect/);
    expect(filter.match(/<UToggleGroup/g)?.length).toBe(4);
    expect(filter).not.toContain(':items="frequencyUnitItems" value-key="value" class="w-24"');
  });

  it('renders short driver select fields as toggle groups in the channel editor', () => {
    const source = readFileSync(new URL('../../app/components/RadioChannelEditor.vue', import.meta.url), 'utf8');

    expect(source).toContain('extraSelectUsesToggleGroup');
    expect(source).toContain('extraSelectUsesToggleGroup(field)');
    expect(source).toContain('updateExtraSelect');
  });

  it('marks required frequency fields in the radio channel editor', () => {
    const source = readFileSync(new URL('../../app/components/RadioChannelEditor.vue', import.meta.url), 'utf8');

    expect(source).toMatch(/label="Receive \(MHz\)"[^>]*required/);
    expect(source).toMatch(/label="Transmit \(MHz\)"[^>]*required/);
  });
});