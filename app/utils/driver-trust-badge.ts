import type { RadioCatalogRecord } from '~/utils/radio-catalog-db';
import type { RadioModuleCatalogEntry } from '@springfield/ham-radio-registry';
import { isBetaDriverRecord } from '~/utils/radio-module-semver';

export type DriverTrustTier = 'official' | 'community';

/** `deprecated` on a catalog entry. Both fields are required when the object is present. */
export interface CatalogDeprecation {
  reason: string;
  date: string;
}

/** Trust fields from a radio-module-catalog entry. Missing tier means official. */
export interface CatalogDriverTrust {
  tier: DriverTrustTier;
  publisher?: string;
  deprecated?: CatalogDeprecation;
}

export type DriverTrustBadgeKind =
  | 'official'
  | 'community'
  | 'unverified'
  | 'deprecated'
  | 'beta'
  | 'bundled';

export interface DriverTrustBadge {
  kind: DriverTrustBadgeKind;
  label: string;
  color: 'success' | 'primary' | 'warning' | 'error' | 'info';
  /** Shown on the Deprecated badge. */
  tooltip?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** RFC 3339 full-date. `2026-02-31` is not a calendar day. */
function isCalendarDate(value: string): boolean {
  const match = CALENDAR_DATE_PATTERN.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));

  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}

/**
 * `deprecated` is optional. When present it is `{ reason, date }` and both
 * fields are required. A string, boolean, or partial object is not the flag.
 */
function readDeprecation(value: unknown): CatalogDeprecation | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const reason = nonEmptyString(value.reason);
  const date = nonEmptyString(value.date);

  if (!reason || !date || !isCalendarDate(date)) {
    return undefined;
  }

  return { reason, date };
}

/**
 * Read `tier`, `publisher`, and `deprecated` from a catalog entry.
 * Absent or unrecognized `tier` is official so older catalogs keep working.
 */
export function readCatalogDriverTrust(entry: unknown): CatalogDriverTrust {
  if (!isRecord(entry)) {
    return { tier: 'official' };
  }

  const tier: DriverTrustTier = entry.tier === 'community' ? 'community' : 'official';
  const publisher = nonEmptyString(entry.publisher);
  const deprecated = entry.deprecated === undefined ? undefined : readDeprecation(entry.deprecated);

  return {
    tier,
    ...(publisher ? { publisher } : {}),
    ...(deprecated ? { deprecated } : {}),
  };
}

export function communityBadgeLabel(publisher: string | undefined): string {
  return publisher ? `Community, by ${publisher}` : 'Community';
}

export function deprecationTooltip(deprecated: CatalogDeprecation): string {
  return `${deprecated.reason} (${deprecated.date})`;
}

/**
 * Copy trust fields onto catalog modules.
 * `@springfield/ham-radio-registry` parse keeps known keys only, so a catalog
 * that already validates still drops `tier`, `publisher`, and `deprecated`.
 */
export function applyCatalogTrustFields<T extends { modules: RadioModuleCatalogEntry[] }>(
  catalog: T,
  raw: unknown,
): T {
  if (!isRecord(raw) || !Array.isArray(raw.modules)) {
    return catalog;
  }

  const byId = new Map<string, unknown>();

  for (const entry of raw.modules) {
    if (isRecord(entry) && typeof entry.id === 'string') {
      byId.set(entry.id, entry);
    }
  }

  for (const moduleEntry of catalog.modules) {
    const rawEntry = byId.get(moduleEntry.id);

    if (!rawEntry) {
      continue;
    }

    const trust = readCatalogDriverTrust(rawEntry);
    const patch: CatalogDriverTrust = { tier: trust.tier };

    if (trust.publisher) {
      patch.publisher = trust.publisher;
    }

    if (trust.deprecated) {
      patch.deprecated = trust.deprecated;
    }

    Object.assign(moduleEntry, patch);
  }

  return catalog;
}

const BETA_BADGE: DriverTrustBadge = { kind: 'beta', label: 'Beta', color: 'info' };
const UNVERIFIED_BADGE: DriverTrustBadge = { kind: 'unverified', label: 'Unverified', color: 'warning' };
const OFFICIAL_BADGE: DriverTrustBadge = { kind: 'official', label: 'Official', color: 'success' };
const BUNDLED_BADGE: DriverTrustBadge = { kind: 'bundled', label: 'Bundled', color: 'success' };

function catalogTierBadge(trust: CatalogDriverTrust | undefined): DriverTrustBadge {
  if (trust?.tier === 'community') {
    return {
      kind: 'community',
      label: communityBadgeLabel(trust.publisher),
      color: 'primary',
    };
  }

  return OFFICIAL_BADGE;
}

/**
 * Badges for an installed driver and/or a catalog row.
 *
 * Official is the default, including catalogs that omit `tier`. Community uses
 * the publisher display name. Unverified and Beta are file-install labels, not
 * catalog tiers. Deprecated is added beside those labels when the catalog
 * entry has a `{ reason, date }` object. The tooltip is the reason and date.
 */
export function driverTrustBadges(options: {
  record?: Pick<RadioCatalogRecord, 'source' | 'sourcePath'>;
  catalogEntry?: unknown;
  /** Set when a picked zip is beta before it has an install-directory version. */
  beta?: boolean;
}): DriverTrustBadge[] {
  const { record, catalogEntry } = options;
  const trust = catalogEntry == null ? undefined : readCatalogDriverTrust(catalogEntry);
  const beta = options.beta ?? (record ? isBetaDriverRecord(record) : false);
  const fileInstall = record?.source === 'user';
  const badges: DriverTrustBadge[] = [];

  if (fileInstall && !beta) {
    badges.push(UNVERIFIED_BADGE);
  } else if (!fileInstall && record?.source === 'bundled' && trust?.tier !== 'community') {
    badges.push(BUNDLED_BADGE);
  } else if (
    record?.source === 'installed' ||
    (record?.source === 'bundled' && trust?.tier === 'community') ||
    (!record && catalogEntry != null)
  ) {
    badges.push(catalogTierBadge(trust));
  }

  if (trust?.deprecated) {
    badges.push({
      kind: 'deprecated',
      label: 'Deprecated',
      color: 'error',
      tooltip: deprecationTooltip(trust.deprecated),
    });
  }

  if (beta) {
    badges.push(BETA_BADGE);
  }

  return badges;
}
