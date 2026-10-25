import type { OnboardingStatus } from '~/utils/onboarding';

/** Per-profile dismissal. `true` stays dismissed across launches while the catalog is empty. */
export const EMPTY_CATALOG_BANNER_STORAGE_KEY = 'ham-radio-empty-catalog-banner-dismissed';

export function parseEmptyCatalogBannerDismissed(raw: string | null): boolean {
  return raw === 'true';
}

export function serializeEmptyCatalogBannerDismissed(dismissed: boolean): string {
  return dismissed ? 'true' : 'false';
}

export function readEmptyCatalogBannerDismissed(): boolean {
  if (!import.meta.client) {
    return false;
  }

  try {
    return parseEmptyCatalogBannerDismissed(localStorage.getItem(EMPTY_CATALOG_BANNER_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function writeEmptyCatalogBannerDismissed(dismissed: boolean): void {
  if (!import.meta.client) {
    return;
  }

  localStorage.setItem(EMPTY_CATALOG_BANNER_STORAGE_KEY, serializeEmptyCatalogBannerDismissed(dismissed));
}

/**
 * Empty catalog, not dismissed, guide closed, and setup is not already `active`.
 * An active guide installs drivers from the Radios step instead of this banner.
 */
export function shouldShowEmptyCatalogBanner(input: {
  catalogEmpty: boolean;
  dismissed: boolean;
  guideOpen: boolean;
  onboardingStatus: OnboardingStatus | undefined;
}): boolean {
  return input.catalogEmpty && !input.dismissed && !input.guideOpen && input.onboardingStatus !== 'active';
}
