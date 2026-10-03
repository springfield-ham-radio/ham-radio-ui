import {
  parseSettingsColumnCount,
  readAppearanceSettings,
  settingsFieldsGridStyle,
  writeAppearanceSettings,
  type SettingsColumnCount,
} from '~/utils/appearance-settings';
import { parseStationLogMapStyle, type StationLogMapStylePreference } from '~/utils/station-log-map';

/**
 * Shared appearance preferences for layout that is not color mode.
 *
 * Theme stays on `useColorMode`. This covers the Settings field grid so
 * Preferences and the Radio page stay in sync without a remount.
 */
export function useAppearanceSettings() {
  const settingsColumns = useState<SettingsColumnCount>(
    'appearance-settings-columns',
    () => readAppearanceSettings().settingsColumns,
  );
  const mapStyle = useState<StationLogMapStylePreference>(
    'appearance-map-style',
    () => readAppearanceSettings().mapStyle,
  );

  const settingsFieldsGridStyleValue = computed(() => settingsFieldsGridStyle(settingsColumns.value));

  function persist(): void {
    writeAppearanceSettings({
      settingsColumns: settingsColumns.value,
      mapStyle: mapStyle.value,
    });
  }

  function setSettingsColumns(value: unknown): void {
    settingsColumns.value = parseSettingsColumnCount(value);
    persist();
  }

  function setMapStyle(value: unknown): void {
    mapStyle.value = parseStationLogMapStyle(value);
    persist();
  }

  return {
    settingsColumns,
    mapStyle,
    settingsFieldsGridStyle: settingsFieldsGridStyleValue,
    setSettingsColumns,
    setMapStyle,
  };
}
