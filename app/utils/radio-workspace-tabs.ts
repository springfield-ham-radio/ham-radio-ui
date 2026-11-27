import type { TabsItem } from '@nuxt/ui';
import type { DeveloperPanels } from '~/utils/developer-panels';

export interface RadioWorkspaceTabInput {
  supportsCat: boolean;
  supportsAprs: boolean;
  panels: Pick<DeveloperPanels, 'radioDriver' | 'radioHex' | 'radioDebug' | 'radioSniffer'>;
}

export function radioWorkspaceTabs(input: RadioWorkspaceTabInput): TabsItem[] {
  const tabs: TabsItem[] = [
    { label: 'Channels', icon: 'i-lucide-list', slot: 'channels', value: 'channels' },
    { label: 'Settings', icon: 'i-lucide-sliders-horizontal', slot: 'settings', value: 'settings' },
  ];

  if (input.supportsCat) {
    tabs.push({ label: 'CAT', icon: 'i-lucide-antenna', slot: 'cat', value: 'cat' });
  }

  if (input.supportsAprs) {
    tabs.push({ label: 'APRS', icon: 'i-lucide-radio', slot: 'aprs', value: 'aprs' });
    tabs.push({ label: 'Packet', icon: 'i-lucide-waypoints', slot: 'packet', value: 'packet' });
  }

  if (input.panels.radioDriver) {
    tabs.push({ label: 'Driver', icon: 'i-lucide-cable', slot: 'driver', value: 'driver' });
  }

  if (input.panels.radioHex) {
    tabs.push({ label: 'Hex Dump', icon: 'i-lucide-binary', slot: 'hex', value: 'hex' });
  }

  if (input.panels.radioDebug) {
    tabs.push({ label: 'Debug', icon: 'i-lucide-bug', slot: 'debug', value: 'debug' });
  }

  if (input.panels.radioSniffer) {
    tabs.push({ label: 'Sniffer', icon: 'i-lucide-audio-lines', slot: 'sniffer', value: 'sniffer' });
  }

  return tabs;
}