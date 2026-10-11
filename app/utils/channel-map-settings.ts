export const CHANNEL_MAP_SETTINGS_STORAGE_KEY = 'ham-radio-channels-map';

const KILOMETERS_PER_MILE = 1.609344;

export interface ChannelMapSettings {
  /** Map panel open on the Channels page. Default closed on first visit. */
  open: boolean;
  /** Straight-line range ring radius in kilometers. Blank means off. */
  rangeRadiusKm?: number;
}

export const DEFAULT_CHANNEL_MAP_SETTINGS: ChannelMapSettings = {
  open: false,
};

export function parseChannelMapSettings(raw: string | null): ChannelMapSettings {
  if (!raw) {
    return { ...DEFAULT_CHANNEL_MAP_SETTINGS };
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_CHANNEL_MAP_SETTINGS };
    }

    const record = parsed as { open?: unknown; rangeRadius?: unknown; rangeRadiusKm?: unknown };
    const open = record.open === true;
    let rangeRadiusKm =
      typeof record.rangeRadiusKm === 'number' && Number.isFinite(record.rangeRadiusKm) && record.rangeRadiusKm > 0
        ? record.rangeRadiusKm
        : undefined;

    if (rangeRadiusKm === undefined && typeof record.rangeRadius === 'number' && Number.isFinite(record.rangeRadius) && record.rangeRadius > 0) {
      // Legacy: radius was stored in miles (the app default distance unit).
      rangeRadiusKm = record.rangeRadius * KILOMETERS_PER_MILE;
    }

    return { open, rangeRadiusKm };
  } catch {
    return { ...DEFAULT_CHANNEL_MAP_SETTINGS };
  }
}

export function serializeChannelMapSettings(settings: ChannelMapSettings): string {
  const rangeRadiusKm =
    typeof settings.rangeRadiusKm === 'number' && Number.isFinite(settings.rangeRadiusKm) && settings.rangeRadiusKm > 0
      ? settings.rangeRadiusKm
      : undefined;

  return JSON.stringify({
    open: settings.open === true,
    rangeRadiusKm,
  });
}

export function readChannelMapSettings(): ChannelMapSettings {
  if (!import.meta.client) {
    return { ...DEFAULT_CHANNEL_MAP_SETTINGS };
  }

  try {
    return parseChannelMapSettings(localStorage.getItem(CHANNEL_MAP_SETTINGS_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_CHANNEL_MAP_SETTINGS };
  }
}

export function writeChannelMapSettings(settings: ChannelMapSettings): void {
  if (!import.meta.client) {
    return;
  }

  localStorage.setItem(CHANNEL_MAP_SETTINGS_STORAGE_KEY, serializeChannelMapSettings(settings));
}
