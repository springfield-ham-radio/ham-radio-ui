import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('menu capture developer placement', () => {
  it('removes the card-level Menu capture tab and mounts the wizard from RadioDriver', () => {
    const workspace = readFileSync('app/components/RadioWorkspace.vue', 'utf8');
    const driver = readFileSync('app/components/RadioDriver.vue', 'utf8');

    expect(workspace).not.toContain("'menu-capture'");
    expect(workspace).not.toContain('RadioMenuCapture');
    expect(driver).toContain('useDeveloperTools');
    expect(driver).toContain('RadioMenuCapture');
    expect(driver).toContain("driverTab === 'menu-capture'");
    expect(driver).toContain('developerTools.value');
  });
});