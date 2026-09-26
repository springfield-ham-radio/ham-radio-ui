import {
  PREDEFINED_CHANNEL_GROUP_IDS,
  type PredefinedChannelGroupId,
} from '~/utils/predefined-channel-groups';

export const PREDEFINED_CHANNEL_GROUP_SETTINGS_KEY = 'ham-radio-predefined-channel-groups';

export interface PredefinedChannelGroupSettings {
  hideWeather: boolean;
  hideFrs: boolean;
  hideGmrs: boolean;
}

const HIDE_KEY: Record<PredefinedChannelGroupId, keyof PredefinedChannelGroupSettings> = {
  [PREDEFINED_CHANNEL_GROUP_IDS.weather]: 'hideWeather',
  [PREDEFINED_CHANNEL_GROUP_IDS.frs]: 'hideFrs',
  [PREDEFINED_CHANNEL_GROUP_IDS.gmrs]: 'hideGmrs',
};

/** Default: every built-in group is visible. */
export function defaultPredefinedChannelGroupSettings(): PredefinedChannelGroupSettings {
  return {
    hideWeather: false,
    hideFrs: false,
    hideGmrs: false,
  };
}

function hideFlag(value: unknown): boolean {
  return value === true;
}

/**
 * Parse built-in channel group visibility from localStorage.
 *
 * A missing or invalid flag leaves that group visible.
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
      hideWeather: hideFlag(record.hideWeather),
      hideFrs: hideFlag(record.hideFrs),
      hideGmrs: hideFlag(record.hideGmrs),
    };
  } catch {
    return defaults;
  }
}

export function serializePredefinedChannelGroupSettings(settings: PredefinedChannelGroupSettings): string {
  return JSON.stringify({
    hideWeather: settings.hideWeather === true,
    hideFrs: settings.hideFrs === true,
    hideGmrs: settings.hideGmrs === true,
  });
}

export function settingsWithGroupHidden(
  settings: PredefinedChannelGroupSettings,
  groupId: PredefinedChannelGroupId,
  hidden: boolean,
): PredefinedChannelGroupSettings {
  return {
    ...settings,
    [HIDE_KEY[groupId]]: hidden,
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

/** Persist which built-in channel groups are hidden. */
export function writePredefinedChannelGroupSettings(settings: PredefinedChannelGroupSettings): void {
  if (!import.meta.client) {
    return;
  }

  localStorage.setItem(PREDEFINED_CHANNEL_GROUP_SETTINGS_KEY, serializePredefinedChannelGroupSettings(settings));
}
