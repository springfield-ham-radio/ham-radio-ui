/**
 * Lucide icons a radio module may name.
 *
 * HamBench is an offline Tauri app: Nuxt Icon uses provider `none` and does
 * not call Iconify. The client bundle scans app source, which does not include
 * JSON from an installed module. Names in this list are passed to
 * `icon.clientBundle.icons` so a module can use them without an app release.
 *
 * Module JSON uses `i-lucide-<name>`. The client bundle uses `lucide:<name>`.
 * Add a name here and in `docs/module-icons.md`.
 */
export const MODULE_LUCIDE_ICONS = [
  'a-large-small',
  'activity',
  'alarm-clock',
  'antenna',
  'arrow-down-to-line',
  'arrow-left-right',
  'arrow-up-from-line',
  'audio-lines',
  'audio-waveform',
  'badge',
  'battery',
  'battery-charging',
  'battery-full',
  'battery-low',
  'battery-medium',
  'battery-warning',
  'bell',
  'bell-off',
  'binary',
  'bluetooth',
  'bookmark',
  'briefcase',
  'bug',
  'cable',
  'calendar',
  'car',
  'circle-alert',
  'circuit-board',
  'clock',
  'cloud',
  'cloud-rain',
  'cloud-sun',
  'cog',
  'compass',
  'contrast',
  'copy',
  'cpu',
  'crosshair',
  'database',
  'earth',
  'ellipsis',
  'ethernet-port',
  'eye',
  'eye-off',
  'file-text',
  'filter',
  'flashlight',
  'folder',
  'folder-open',
  'gauge',
  'globe',
  'grid-3x3',
  'hard-drive',
  'hash',
  'headphones',
  'hourglass',
  'info',
  'key',
  'key-round',
  'keyboard',
  'lamp',
  'languages',
  'layers',
  'layout-dashboard',
  'leaf',
  'lightbulb',
  'list',
  'locate',
  'locate-fixed',
  'lock',
  'mail',
  'map',
  'map-pin',
  'map-pinned',
  'memory-stick',
  'menu',
  'message-square',
  'mic',
  'mic-off',
  'microchip',
  'monitor',
  'monitor-smartphone',
  'moon',
  'more-horizontal',
  'mountain',
  'music',
  'navigation',
  'network',
  'palette',
  'phone',
  'plug',
  'plug-zap',
  'podcast',
  'power',
  'power-off',
  'printer',
  'puzzle',
  'radar',
  'radio',
  'radio-receiver',
  'radio-tower',
  'refresh-cw',
  'repeat',
  'repeat-2',
  'rotate-ccw',
  'rss',
  'ruler',
  'satellite',
  'satellite-dish',
  'save',
  'scan',
  'scan-search',
  'search',
  'server',
  'settings',
  'settings-2',
  'share-2',
  'shield',
  'shield-alert',
  'signal',
  'signal-high',
  'signal-low',
  'signal-medium',
  'signal-zero',
  'siren',
  'sliders-horizontal',
  'sliders-vertical',
  'smartphone',
  'speaker',
  'sun',
  'sun-medium',
  'table',
  'tablet',
  'thermometer',
  'timer',
  'toggle-left',
  'toggle-right',
  'triangle-alert',
  'truck',
  'type',
  'unlock',
  'unplug',
  'usb',
  'users',
  'volume',
  'volume-1',
  'volume-2',
  'volume-off',
  'volume-x',
  'waves',
  'waypoints',
  'wifi',
  'wifi-off',
  'wind',
  'wrench',
  'zap',
] as const;

/** Shown when a module omits an icon or names one that is not bundled. */
export const DEFAULT_MODULE_ICON = 'i-lucide-sliders-horizontal';

const ALLOWED_MODULE_ICONS = new Set<string>(MODULE_LUCIDE_ICONS.map((name) => `i-lucide-${name}`));

/** `lucide:<name>` entries for `icon.clientBundle.icons`. */
export function moduleIconCollectionNames(): string[] {
  return MODULE_LUCIDE_ICONS.map((name) => `lucide:${name}`);
}

export function isAllowedModuleIcon(icon: string | undefined): boolean {
  return typeof icon === 'string' && ALLOWED_MODULE_ICONS.has(icon.trim());
}

/**
 * Icon name safe to pass to `UIcon`.
 * Unknown and empty names become `fallback`, which is bundled.
 */
export function resolveModuleIcon(icon: string | undefined, fallback: string = DEFAULT_MODULE_ICON): string {
  const trimmed = icon?.trim();

  if (trimmed && ALLOWED_MODULE_ICONS.has(trimmed)) {
    return trimmed;
  }

  return fallback;
}

/** Driver-editor warning when a settings group names an icon outside the bundled set. */
export function moduleIconWarning(icon: string | undefined): string | undefined {
  const trimmed = icon?.trim();

  if (!trimmed || ALLOWED_MODULE_ICONS.has(trimmed)) {
    return undefined;
  }

  return `${trimmed} is not a bundled icon. The Settings tab shows ${DEFAULT_MODULE_ICON} instead.`;
}
