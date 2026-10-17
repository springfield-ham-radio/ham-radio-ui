import {
  DEFAULT_CHANNEL_LIBRARY_FILTER_SETTINGS,
  type ChannelLibraryFilterSettings,
  type ChannelOnAirFilter,
} from '~/utils/channel-library-filters';

export const CHANNEL_LIBRARY_FILTER_SETTINGS_STORAGE_KEY = 'ham-radio-channel-library-filters';

function isOnAirFilter(value: unknown): value is ChannelOnAirFilter {
  return value === 'all' || value === 'on-air' || value === 'off-air';
}

export function parseChannelLibraryFilterSettings(raw: string | null): ChannelLibraryFilterSettings {
  if (!raw) {
    return { ...DEFAULT_CHANNEL_LIBRARY_FILTER_SETTINGS };
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_CHANNEL_LIBRARY_FILTER_SETTINGS };
    }

    const record = parsed as { bands?: unknown; onAir?: unknown };
    const bands = Array.isArray(record.bands)
      ? record.bands.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : [];
    const onAir = isOnAirFilter(record.onAir) ? record.onAir : 'all';

    return { bands, onAir };
  } catch {
    return { ...DEFAULT_CHANNEL_LIBRARY_FILTER_SETTINGS };
  }
}

export function serializeChannelLibraryFilterSettings(settings: ChannelLibraryFilterSettings): string {
  return JSON.stringify({
    bands: settings.bands,
    onAir: settings.onAir,
  });
}

export function readChannelLibraryFilterSettings(): ChannelLibraryFilterSettings {
  if (!import.meta.client) {
    return { ...DEFAULT_CHANNEL_LIBRARY_FILTER_SETTINGS };
  }

  try {
    return parseChannelLibraryFilterSettings(localStorage.getItem(CHANNEL_LIBRARY_FILTER_SETTINGS_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_CHANNEL_LIBRARY_FILTER_SETTINGS };
  }
}

export function writeChannelLibraryFilterSettings(settings: ChannelLibraryFilterSettings): void {
  if (!import.meta.client) {
    return;
  }

  localStorage.setItem(CHANNEL_LIBRARY_FILTER_SETTINGS_STORAGE_KEY, serializeChannelLibraryFilterSettings(settings));
}
