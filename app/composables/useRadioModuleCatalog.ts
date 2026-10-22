import type { RadioModuleCatalogEntry } from '@springfield/ham-radio-registry';
import type { RadioCatalogRecord } from '~/utils/radio-catalog-db';
import { listRadioCatalogRecords } from '~/utils/radio-catalog-db';
import {
  fetchOfficialModuleCatalog,
  officialCatalogFailureFromCause,
  reconcileInstalledRadioModules,
  type OfficialModuleCatalogFailure,
} from '~/utils/radio-module-install';
import { buildInstalledRadioListItems } from '~/utils/radio-module-listing';

let reloadPromise: Promise<void> | undefined;

/**
 * Shared installed-driver list and official catalog fetch used by Preferences → Drivers
 * and the global driver update banner.
 */
export function useRadioModuleCatalog() {
  const catalogRecords = useState<RadioCatalogRecord[]>('radio-module-catalog-records', () => []);
  const catalogEntries = useState<RadioModuleCatalogEntry[]>('radio-module-catalog-entries', () => []);
  const catalogFailure = useState<OfficialModuleCatalogFailure | null>(
    'radio-module-catalog-failure',
    () => null,
  );
  const catalogLoading = useState('radio-module-catalog-loading', () => false);

  const { configurations } = useRadio();

  const installedListItems = computed(() =>
    buildInstalledRadioListItems(catalogRecords.value, catalogEntries.value),
  );

  async function refreshInstalledRadios(): Promise<void> {
    try {
      await reconcileInstalledRadioModules();
      catalogRecords.value = await listRadioCatalogRecords();
    } catch {
      catalogRecords.value = [];
    }
  }

  async function loadOfficialCatalog(): Promise<void> {
    catalogLoading.value = true;
    catalogFailure.value = null;

    try {
      const catalog = await fetchOfficialModuleCatalog();
      catalogEntries.value = catalog.modules;
    } catch (cause) {
      catalogEntries.value = [];
      catalogFailure.value = officialCatalogFailureFromCause(cause);
    } finally {
      catalogLoading.value = false;
    }
  }

  async function reload(): Promise<void> {
    if (reloadPromise) {
      await reloadPromise;
      return;
    }

    reloadPromise = Promise.all([refreshInstalledRadios(), loadOfficialCatalog()]).then(() => undefined);
    await reloadPromise;
    reloadPromise = undefined;
  }

  watch(configurations, () => {
    void refreshInstalledRadios();
  });

  return {
    catalogRecords,
    catalogEntries,
    catalogFailure,
    catalogLoading,
    installedListItems,
    refreshInstalledRadios,
    loadOfficialCatalog,
    reload,
  };
}
