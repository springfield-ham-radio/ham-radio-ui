export const CHANNEL_MAP_SETTINGS_STORAGE_KEY = 'ham-radio-channels-map';

export interface ChannelMapSettings {
  /** Map panel open on the Channels page. Default closed on first visit. */
  open: boolean;
  /** Straight-line range ring radius in the operator's distance unit (`mi` or `km`). Blank means off. */
  rangeRadius?: number;
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

    const record = parsed as { open?: unknown; rangeRadius?: unknown };
    const open = record.open === true;
    const rangeRadius =
      typeof record.rangeRadius === 'number' && Number.isFinite(record.rangeRadius) && record.rangeRadius > 0
        ? record.rangeRadius
        : undefined;

    return { open, rangeRadius };
  } catch {
    return { ...DEFAULT_CHANNEL_MAP_SETTINGS };
  }
}

export function serializeChannelMapSettings(settings: ChannelMapSettings): string {
  const rangeRadius =
    typeof settings.rangeRadius === 'number' && Number.isFinite(settings.rangeRadius) && settings.rangeRadius > 0
      ? settings.rangeRadius
      : undefined;

  return JSON.stringify({
    open: settings.open === true,
    rangeRadius,
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
