import { describe, expect, it } from 'vitest';
import { PREDEFINED_CHANNEL_GROUP_IDS } from '../../app/utils/predefined-channel-groups.ts';
import {
  defaultPredefinedChannelGroupSettings,
  parsePredefinedChannelGroupSettings,
  serializePredefinedChannelGroupSettings,
  settingsWithGroupShown,
} from '../../app/utils/predefined-channel-settings.ts';

describe('predefined channel group settings', () => {
  it('should show every built-in group by default', () => {
    expect(defaultPredefinedChannelGroupSettings()).toEqual({
      showWeather: true,
      showFrs: true,
      showGmrs: true,
    });
  });

  it('should fall back to defaults when storage is empty or invalid', () => {
    expect(parsePredefinedChannelGroupSettings(null)).toEqual(defaultPredefinedChannelGroupSettings());
    expect(parsePredefinedChannelGroupSettings('')).toEqual(defaultPredefinedChannelGroupSettings());
    expect(parsePredefinedChannelGroupSettings('{')).toEqual(defaultPredefinedChannelGroupSettings());
    expect(parsePredefinedChannelGroupSettings('[]')).toEqual(defaultPredefinedChannelGroupSettings());
  });

  it('should turn a group off only when that show flag is false', () => {
    expect(
      parsePredefinedChannelGroupSettings(
        JSON.stringify({
          showWeather: false,
          showFrs: true,
          showGmrs: 'yes',
          extra: true,
        }),
      ),
    ).toEqual({
      showWeather: false,
      showFrs: true,
      showGmrs: true,
    });
  });

  it('should treat a saved hide flag as off', () => {
    expect(
      parsePredefinedChannelGroupSettings(
        JSON.stringify({
          hideWeather: true,
          hideFrs: false,
          hideGmrs: 'yes',
        }),
      ),
    ).toEqual({
      showWeather: false,
      showFrs: true,
      showGmrs: true,
    });
  });

  it('should prefer a show flag over an older hide flag', () => {
    expect(
      parsePredefinedChannelGroupSettings(
        JSON.stringify({
          showWeather: true,
          hideWeather: true,
        }),
      ).showWeather,
    ).toBe(true);
  });

  it('should treat missing flags as shown', () => {
    expect(parsePredefinedChannelGroupSettings(JSON.stringify({}))).toEqual(defaultPredefinedChannelGroupSettings());
  });

  it('should round-trip settings through serialize and parse', () => {
    const settings = {
      showWeather: false,
      showFrs: true,
      showGmrs: false,
    };

    expect(parsePredefinedChannelGroupSettings(serializePredefinedChannelGroupSettings(settings))).toEqual(settings);
  });

  it('should set the show flag for one group and leave the others', () => {
    const next = settingsWithGroupShown(
      defaultPredefinedChannelGroupSettings(),
      PREDEFINED_CHANNEL_GROUP_IDS.frs,
      false,
    );

    expect(next).toEqual({
      showWeather: true,
      showFrs: false,
      showGmrs: true,
    });
  });
});
