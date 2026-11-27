import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('RadioWorkspace special channels section', () => {
  it('renders a labeled special channels block separate from drag reordering', () => {
    const source = readFileSync('app/components/RadioWorkspace.vue', 'utf8');

    expect(source).toContain('Special channels');
    expect(source).toContain('specialDisplayChannels');
    expect(source).toContain('createSpecialChannelNumber');
    expect(source).toContain('columns.filter((column) => column.id !== \'drag\')');
    expect(source).toContain('programEmptySpecial');
  });
});