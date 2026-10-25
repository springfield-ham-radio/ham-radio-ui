import { describe, expect, it } from 'vitest';
import {
  parseEmptyCatalogBannerDismissed,
  serializeEmptyCatalogBannerDismissed,
  shouldShowEmptyCatalogBanner,
} from '../../app/utils/empty-catalog-banner.ts';

describe('empty catalog banner', () => {
  it('should show when the catalog is empty and this profile has not dismissed it', () => {
    expect(
      shouldShowEmptyCatalogBanner({
        catalogEmpty: true,
        dismissed: false,
        guideOpen: false,
        onboardingStatus: undefined,
      }),
    ).toBe(true);
    expect(
      shouldShowEmptyCatalogBanner({
        catalogEmpty: true,
        dismissed: false,
        guideOpen: false,
        onboardingStatus: 'completed',
      }),
    ).toBe(true);
  });

  it('should stay hidden after a persisted dismissal, while the guide is open, and once a module exists', () => {
    expect(
      shouldShowEmptyCatalogBanner({
        catalogEmpty: true,
        dismissed: true,
        guideOpen: false,
        onboardingStatus: 'completed',
      }),
    ).toBe(false);
    expect(
      shouldShowEmptyCatalogBanner({
        catalogEmpty: true,
        dismissed: false,
        guideOpen: true,
        onboardingStatus: undefined,
      }),
    ).toBe(false);
    expect(
      shouldShowEmptyCatalogBanner({
        catalogEmpty: true,
        dismissed: false,
        guideOpen: false,
        onboardingStatus: 'active',
      }),
    ).toBe(false);
    expect(
      shouldShowEmptyCatalogBanner({
        catalogEmpty: false,
        dismissed: false,
        guideOpen: false,
        onboardingStatus: undefined,
      }),
    ).toBe(false);
  });

  it('should round-trip a per-profile dismissal', () => {
    expect(parseEmptyCatalogBannerDismissed(null)).toBe(false);
    expect(parseEmptyCatalogBannerDismissed('false')).toBe(false);
    expect(parseEmptyCatalogBannerDismissed(serializeEmptyCatalogBannerDismissed(true))).toBe(true);
    expect(parseEmptyCatalogBannerDismissed(serializeEmptyCatalogBannerDismissed(false))).toBe(false);
  });
});
