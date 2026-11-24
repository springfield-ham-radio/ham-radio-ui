import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('developer panels wiring', () => {
  it('gates radio card developer tabs and falls back when hidden', () => {
    const workspace = readFileSync('app/components/RadioWorkspace.vue', 'utf8');

    expect(workspace).toContain('useDeveloperPanels');
    expect(workspace).toContain('developerPanels.value.radioDriver');
    expect(workspace).toContain('developerPanels.value.radioHex');
    expect(workspace).toContain('developerPanels.value.radioDebug');
    expect(workspace).toContain('developerPanels.value.radioSniffer');
  });

  it('always exposes menu capture on the radio Driver tab', () => {
    const driver = readFileSync('app/components/RadioDriver.vue', 'utf8');

    expect(driver).not.toContain('useDeveloperTools');
    expect(driver).not.toContain('useDeveloperPanels');
    expect(driver).toContain('Menu capture');
    expect(driver).toContain("driverTab === 'menu-capture'");
  });

  it('gates the main Driver editor from Developer panels', () => {
    const header = readFileSync('app/components/AppHeader.vue', 'utf8');
    const driverPage = readFileSync('app/pages/driver.vue', 'utf8');

    expect(header).toContain('useDeveloperPanels');
    expect(header).toContain('developerPanels.value.driverDevelopment');
    expect(driverPage).toContain('panels.value.driverDevelopment');
    expect(driverPage).toContain('panels.driverDevelopment');
  });

  it('removes View menu developer mode from the desktop shell', () => {
    const lib = readFileSync('src-tauri/src/lib.rs', 'utf8');
    const tauriMenu = readFileSync('app/plugins/tauri-menu.client.ts', 'utf8');

    expect(lib).not.toContain('developer-mode');
    expect(lib).not.toContain('set_developer_mode');
    expect(tauriMenu).not.toContain('developer-mode-changed');
    expect(tauriMenu).not.toContain('set_developer_mode');
  });
});