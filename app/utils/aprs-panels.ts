/**
 * Sub-tabs on the APRS page.
 *
 * Station details are the selected row of Stations, not their own tab.
 * Map uses that same selected callsign.
 */
export const APRS_PANEL_TABS = [
  { label: 'Stations', icon: 'i-lucide-list', slot: 'stations', value: 'stations' },
  { label: 'Map', icon: 'i-lucide-map', slot: 'map', value: 'map' },
  { label: 'Messages', icon: 'i-lucide-message-square', slot: 'messages', value: 'messages' },
  { label: 'Raw log', icon: 'i-lucide-scroll-text', slot: 'log', value: 'log' },
] as const;

export type AprsPanelTabValue = (typeof APRS_PANEL_TABS)[number]['value'];
