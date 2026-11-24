import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('menu capture developer placement', () => {
  it('mounts the wizard from RadioDriver and gates the card Driver tab', () => {
    const workspace = readFileSync('app/components/RadioWorkspace.vue', 'utf8');
    const driver = readFileSync('app/components/RadioDriver.vue', 'utf8');

    expect(workspace).not.toContain('RadioMenuCapture');
    expect(workspace).toContain('developerPanels.value.radioDriver');
    expect(driver).toContain('RadioMenuCapture');
    expect(driver).toContain("driverTab === 'menu-capture'");
    expect(driver).toContain('menu-capture');
  });
});