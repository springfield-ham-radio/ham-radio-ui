import { describe, expect, it } from 'vitest';
import { PREDEFINED_CHANNEL_GROUP_IDS } from '../../app/utils/predefined-channel-groups.ts';
import {
  defaultPredefinedChannelGroupSettings,
  parsePredefinedChannelGroupSettings,
  serializePredefinedChannelGroupSettings,
  settingsWithGroupHidden,
} from '../../app/utils/predefined-channel-settings.ts';

describe('predefined channel group settings', () => {
  it('should show every built-in group by default', () => {
    expect(defaultPredefinedChannelGroupSettings()).toEqual({
      hideWeather: false,
      hideFrs: false,
      hideGmrs: false,
    });
  });

  it('should fall back to defaults when storage is empty or invalid', () => {
    expect(parsePredefinedChannelGroupSettings(null)).toEqual(defaultPredefinedChannelGroupSettings());
    expect(parsePredefinedChannelGroupSettings('')).toEqual(defaultPredefinedChannelGroupSettings());
    expect(parsePredefinedChannelGroupSettings('{')).toEqual(defaultPredefinedChannelGroupSettings());
    expect(parsePredefinedChannelGroupSettings('[]')).toEqual(defaultPredefinedChannelGroupSettings());
  });

  it('should hide a group only when that flag is true', () => {
    expect(
      parsePredefinedChannelGroupSettings(
        JSON.stringify({
          hideWeather: true,
          hideFrs: false,
          hideGmrs: 'yes',
          extra: true,
        }),
      ),
    ).toEqual({
      hideWeather: true,
      hideFrs: false,
      hideGmrs: false,
    });
  });

  it('should treat missing flags as shown', () => {
    expect(parsePredefinedChannelGroupSettings(JSON.stringify({}))).toEqual(defaultPredefinedChannelGroupSettings());
  });

  it('should round-trip settings through serialize and parse', () => {
    const settings = {
      hideWeather: true,
      hideFrs: false,
      hideGmrs: true,
    };

    expect(parsePredefinedChannelGroupSettings(serializePredefinedChannelGroupSettings(settings))).toEqual(settings);
  });

  it('should set the hide flag for one group and leave the others', () => {
    const next = settingsWithGroupHidden(
      defaultPredefinedChannelGroupSettings(),
      PREDEFINED_CHANNEL_GROUP_IDS.frs,
      true,
    );

    expect(next).toEqual({
      hideWeather: false,
      hideFrs: true,
      hideGmrs: false,
    });
  });
});
