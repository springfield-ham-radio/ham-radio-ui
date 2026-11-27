/**
 * Sub-tabs on the APRS page.
 *
 * Station details are the selected row of Stations, not their own tab.
 * Map uses that same selected callsign.
 */
const APRS_PANEL_TABS_BASE = [
  { label: 'Stations', icon: 'i-lucide-list', slot: 'stations', value: 'stations' },
  { label: 'Map', icon: 'i-lucide-map', slot: 'map', value: 'map' },
  { label: 'Messages', icon: 'i-lucide-message-square', slot: 'messages', value: 'messages' },
] as const;

const APRS_PANEL_TAB_RAW_LOG = {
  label: 'Raw log',
  icon: 'i-lucide-scroll-text',
  slot: 'log',
  value: 'log',
} as const;

/** @deprecated Use {@link aprsPanelTabs} so Raw log can respect developer preferences. */
export const APRS_PANEL_TABS = [...APRS_PANEL_TABS_BASE, APRS_PANEL_TAB_RAW_LOG] as const;

export type AprsPanelTabValue =
  | (typeof APRS_PANEL_TABS_BASE)[number]['value']
  | (typeof APRS_PANEL_TAB_RAW_LOG)['value'];

export function aprsPanelTabs(showRawLog: boolean): typeof APRS_PANEL_TABS {
  if (!showRawLog) {
    return [...APRS_PANEL_TABS_BASE];
  }

  return [...APRS_PANEL_TABS_BASE, APRS_PANEL_TAB_RAW_LOG];
}