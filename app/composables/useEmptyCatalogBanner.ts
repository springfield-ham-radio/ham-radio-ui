import {
  readEmptyCatalogBannerDismissed,
  shouldShowEmptyCatalogBanner,
  writeEmptyCatalogBannerDismissed,
} from '~/utils/empty-catalog-banner';

export function useEmptyCatalogBanner() {
  const dismissed = useState('empty-catalog-banner-dismissed', () => readEmptyCatalogBannerDismissed());
  const { configurations, catalogLoaded } = useRadio();
  const { shellOpen, persisted } = useOnboarding();

  const catalogEmpty = computed(() => catalogLoaded.value && configurations.value.length === 0);

  const alertOpen = computed(() =>
    shouldShowEmptyCatalogBanner({
      catalogEmpty: catalogEmpty.value,
      dismissed: dismissed.value,
      guideOpen: shellOpen.value,
      onboardingStatus: persisted.value?.status,
    }),
  );

  watch(catalogEmpty, (empty) => {
    if (!empty && dismissed.value) {
      dismissed.value = false;
      writeEmptyCatalogBannerDismissed(false);
    }
  });

  function onAlertOpenChange(open: boolean): void {
    if (open) {
      return;
    }

    dismissed.value = true;
    writeEmptyCatalogBannerDismissed(true);
  }

  onMounted(() => {
    dismissed.value = readEmptyCatalogBannerDismissed();
  });

  return {
    alertOpen,
    onAlertOpenChange,
  };
}
