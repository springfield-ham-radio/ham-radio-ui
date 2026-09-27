import {
  PREDEFINED_CHANNEL_GROUP_IDS,
  type PredefinedChannelGroupId,
} from '~/utils/predefined-channel-groups';

export const PREDEFINED_CHANNEL_GROUP_SETTINGS_KEY = 'ham-radio-predefined-channel-groups';

export interface PredefinedChannelGroupSettings {
  showWeather: boolean;
  showFrs: boolean;
  showGmrs: boolean;
}

const SHOW_KEY: Record<PredefinedChannelGroupId, keyof PredefinedChannelGroupSettings> = {
  [PREDEFINED_CHANNEL_GROUP_IDS.weather]: 'showWeather',
  [PREDEFINED_CHANNEL_GROUP_IDS.frs]: 'showFrs',
  [PREDEFINED_CHANNEL_GROUP_IDS.gmrs]: 'showGmrs',
};

const LEGACY_HIDE_KEY: Record<keyof PredefinedChannelGroupSettings, string> = {
  showWeather: 'hideWeather',
  showFrs: 'hideFrs',
  showGmrs: 'hideGmrs',
};

/** Default: every built-in group is on. */
export function defaultPredefinedChannelGroupSettings(): PredefinedChannelGroupSettings {
  return {
    showWeather: true,
    showFrs: true,
    showGmrs: true,
  };
}

/**
 * A boolean show flag wins. Older storage used hide flags, where true meant off.
 * Anything else leaves the group on.
 */
function showFlag(record: Record<string, unknown>, key: keyof PredefinedChannelGroupSettings): boolean {
  const shown = record[key];

  if (typeof shown === 'boolean') {
    return shown;
  }

  return record[LEGACY_HIDE_KEY[key]] !== true;
}

/**
 * Parse built-in channel group visibility from localStorage.
 *
 * A missing or invalid flag leaves that group on.
 */
export function parsePredefinedChannelGroupSettings(raw: string | null): PredefinedChannelGroupSettings {
  const defaults = defaultPredefinedChannelGroupSettings();

  if (!raw) {
    return defaults;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return defaults;
    }

    const record = parsed as Record<string, unknown>;

    return {
      showWeather: showFlag(record, 'showWeather'),
      showFrs: showFlag(record, 'showFrs'),
      showGmrs: showFlag(record, 'showGmrs'),
    };
  } catch {
    return defaults;
  }
}

export function serializePredefinedChannelGroupSettings(settings: PredefinedChannelGroupSettings): string {
  return JSON.stringify({
    showWeather: settings.showWeather === true,
    showFrs: settings.showFrs === true,
    showGmrs: settings.showGmrs === true,
  });
}

export function settingsWithGroupShown(
  settings: PredefinedChannelGroupSettings,
  groupId: PredefinedChannelGroupId,
  shown: boolean,
): PredefinedChannelGroupSettings {
  return {
    ...settings,
    [SHOW_KEY[groupId]]: shown,
  };
}

export function readPredefinedChannelGroupSettings(): PredefinedChannelGroupSettings {
  if (!import.meta.client) {
    return defaultPredefinedChannelGroupSettings();
  }

  try {
    return parsePredefinedChannelGroupSettings(localStorage.getItem(PREDEFINED_CHANNEL_GROUP_SETTINGS_KEY));
  } catch {
    return defaultPredefinedChannelGroupSettings();
  }
}

/** Persist which built-in channel groups are shown. */
export function writePredefinedChannelGroupSettings(settings: PredefinedChannelGroupSettings): void {
  if (!import.meta.client) {
    return;
  }

  localStorage.setItem(PREDEFINED_CHANNEL_GROUP_SETTINGS_KEY, serializePredefinedChannelGroupSettings(settings));
}
