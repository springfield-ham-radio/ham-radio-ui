import {
  dismissDriverUpdate,
  readDriverUpdateDismissals,
} from '~/utils/driver-update-dismissals';
import {
  driverModuleUpdateAlertDescription,
  driverModuleUpdateAlertTitle,
  driverModuleUpdatesFromInstalledItems,
  filterVisibleDriverModuleUpdates,
  type DriverModuleUpdate,
} from '~/utils/driver-module-update-alert';

export function useDriverModuleUpdateBanner() {
  const dismissals = useState('driver-update-dismissals', () => readDriverUpdateDismissals());
  const { installedListItems, reload } = useRadioModuleCatalog();

  const pendingUpdates = computed(() => driverModuleUpdatesFromInstalledItems(installedListItems.value));

  const visibleUpdates = computed(() =>
    filterVisibleDriverModuleUpdates(pendingUpdates.value, dismissals.value),
  );

  const alertOpen = computed(() => visibleUpdates.value.length > 0);

  const alertTitle = computed(() => driverModuleUpdateAlertTitle(visibleUpdates.value));

  const alertDescription = computed(() => driverModuleUpdateAlertDescription(visibleUpdates.value));

  function refreshDismissals(): void {
    dismissals.value = readDriverUpdateDismissals();
  }

  function dismissBanner(): void {
    for (const update of visibleUpdates.value) {
      dismissDriverUpdate(update.modelId, update.availableVersion);
    }

    refreshDismissals();
  }

  function onAlertOpenChange(open: boolean): void {
    if (!open) {
      dismissBanner();
    }
  }

  onMounted(() => {
    refreshDismissals();
    void reload();
  });

  return {
    visibleUpdates,
    alertOpen,
    alertTitle,
    alertDescription,
    dismissBanner,
    onAlertOpenChange,
  };
}
