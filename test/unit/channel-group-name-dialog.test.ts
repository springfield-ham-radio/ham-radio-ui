import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('ChannelGroupNameDialog', () => {
  it('marks the name field required', () => {
    const source = readFileSync(new URL('../../app/components/ChannelGroupNameDialog.vue', import.meta.url), 'utf8');

    expect(source).toMatch(/label="Name"[^>]*required/);
  });
});