import { describe, expect, it } from 'vitest';
import { defaultDeveloperPanels } from '../../app/utils/developer-panels';
import { radioWorkspaceTabs } from '../../app/utils/radio-workspace-tabs';

function tabValues(tabs: ReturnType<typeof radioWorkspaceTabs>): string[] {
  return tabs.map((tab) => tab.value as string);
}

describe('radio workspace tabs', () => {
  it('orders Channels and Settings first when no CAT, APRS, or developer panels', () => {
    const tabs = radioWorkspaceTabs({
      supportsCat: false,
      supportsAprs: false,
      panels: defaultDeveloperPanels(),
    });

    expect(tabValues(tabs)).toEqual(['channels', 'settings']);
    expect(tabs.map((tab) => tab.label)).toEqual(['Channels', 'Settings']);
  });

  it('places CAT after Settings when supported', () => {
    const tabs = radioWorkspaceTabs({
      supportsCat: true,
      supportsAprs: false,
      panels: defaultDeveloperPanels(),
    });

    expect(tabValues(tabs)).toEqual(['channels', 'settings', 'cat']);
  });

  it('places APRS and Packet together after Settings when supported', () => {
    const tabs = radioWorkspaceTabs({
      supportsCat: false,
      supportsAprs: true,
      panels: defaultDeveloperPanels(),
    });

    expect(tabValues(tabs)).toEqual(['channels', 'settings', 'aprs', 'packet']);
  });

  it('orders Channels, Settings, CAT, APRS, Packet for capable radios without developer panels', () => {
    const tabs = radioWorkspaceTabs({
      supportsCat: true,
      supportsAprs: true,
      panels: defaultDeveloperPanels(),
    });

    expect(tabValues(tabs)).toEqual(['channels', 'settings', 'cat', 'aprs', 'packet']);
  });

  it('appends developer tabs after APRS/Packet when all panels are on', () => {
    const tabs = radioWorkspaceTabs({
      supportsCat: true,
      supportsAprs: true,
      panels: {
        ...defaultDeveloperPanels(),
        radioDriver: true,
        radioHex: true,
        radioDebug: true,
        radioSniffer: true,
      },
    });

    expect(tabValues(tabs)).toEqual([
      'channels',
      'settings',
      'cat',
      'aprs',
      'packet',
      'driver',
      'hex',
      'debug',
      'sniffer',
    ]);
  });

  it('appends developer tabs after Settings when CAT and APRS are absent', () => {
    const tabs = radioWorkspaceTabs({
      supportsCat: false,
      supportsAprs: false,
      panels: {
        ...defaultDeveloperPanels(),
        radioDriver: true,
        radioHex: true,
        radioDebug: true,
        radioSniffer: true,
      },
    });

    expect(tabValues(tabs)).toEqual(['channels', 'settings', 'driver', 'hex', 'debug', 'sniffer']);
  });

  it('skips disabled developer tabs without changing the remaining sequence', () => {
    const tabs = radioWorkspaceTabs({
      supportsCat: true,
      supportsAprs: true,
      panels: {
        ...defaultDeveloperPanels(),
        radioHex: true,
        radioSniffer: true,
      },
    });

    expect(tabValues(tabs)).toEqual(['channels', 'settings', 'cat', 'aprs', 'packet', 'hex', 'sniffer']);
  });
});