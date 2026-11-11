import { describe, expect, it } from 'vitest';
import { APRS_PANEL_TABS } from '../../app/utils/aprs-panels.ts';

describe('APRS panel tabs', () => {
  it('keeps station details on the Stations tab', () => {
    expect(APRS_PANEL_TABS.map((tab) => tab.label)).toEqual(['Stations', 'Map', 'Messages', 'Raw log']);
    expect(APRS_PANEL_TABS.map((tab) => tab.value)).toEqual(['stations', 'map', 'messages', 'log']);
    expect(APRS_PANEL_TABS.some((tab) => tab.label === 'Station details' || tab.value === 'packet')).toBe(false);
  });
});
