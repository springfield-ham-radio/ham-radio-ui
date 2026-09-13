import {
  parseSettingsColumnCount,
  readAppearanceSettings,
  settingsFieldsGridStyle,
  writeAppearanceSettings,
  type SettingsColumnCount,
} from '~/utils/appearance-settings';

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

  const settingsFieldsGridStyleValue = computed(() => settingsFieldsGridStyle(settingsColumns.value));

  function setSettingsColumns(value: unknown): void {
    const next = parseSettingsColumnCount(value);
    settingsColumns.value = next;
    writeAppearanceSettings({
      settingsColumns: next,
    });
  }

  return {
    settingsColumns,
    settingsFieldsGridStyle: settingsFieldsGridStyleValue,
    setSettingsColumns,
  };
}
