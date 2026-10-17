import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('ChannelLibraryFilterCheckbox', () => {
  it('uses a bordered card UCheckbox aligned like sm inputs', () => {
    const source = readFileSync(
      new URL('../../app/components/ChannelLibraryFilterCheckbox.vue', import.meta.url),
      'utf8',
    );

    expect(source).toContain('variant="card"');
    expect(source).toContain('UCheckbox');
    expect(source).not.toContain('URadio');
    expect(source).toContain('h-8');
    expect(source).toContain('rounded-md');
    expect(source).toContain('ring-accented');
    expect(source).toContain("label: 'sr-only'");
  });
});
