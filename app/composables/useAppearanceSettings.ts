import {
  parseSettingsColumnCount,
  readAppearanceSettings,
  settingsFieldsGridStyle,
  writeAppearanceSettings,
  type SettingsColumnCount,
} from '~/utils/appearance-settings';
import {
  parseCustomMapStyleUrl,
  parseStationLogMapStyle,
  type StationLogMapStylePreference,
} from '~/utils/station-log-map';

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
  const customMapStyleUrl = useState<string | undefined>(
    'appearance-custom-map-style-url',
    () => readAppearanceSettings().customMapStyleUrl,
  );
  const showMenuNumbers = useState<boolean>(
    'appearance-show-menu-numbers',
    () => readAppearanceSettings().showMenuNumbers,
  );

  const settingsFieldsGridStyleValue = computed(() => settingsFieldsGridStyle(settingsColumns.value));

  function persist(): void {
    writeAppearanceSettings({
      settingsColumns: settingsColumns.value,
      mapStyle: mapStyle.value,
      customMapStyleUrl: customMapStyleUrl.value,
      showMenuNumbers: showMenuNumbers.value,
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

  function setCustomMapStyleUrl(value: unknown): void {
    customMapStyleUrl.value = parseCustomMapStyleUrl(value);
    persist();
  }

  function setShowMenuNumbers(value: unknown): void {
    showMenuNumbers.value = value === true;
    persist();
  }

  return {
    settingsColumns,
    mapStyle,
    customMapStyleUrl,
    showMenuNumbers,
    settingsFieldsGridStyle: settingsFieldsGridStyleValue,
    setSettingsColumns,
    setMapStyle,
    setCustomMapStyleUrl,
    setShowMenuNumbers,
  };
}
