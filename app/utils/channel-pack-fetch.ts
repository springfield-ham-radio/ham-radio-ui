import type { ChannelPackDocument } from '~/utils/channel-pack';
import { CHANNEL_PACK_MAX_CHARS, parseChannelPack } from '~/utils/channel-pack';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';

export const CHANNEL_PACK_FIXTURE_URL = 'fixture:sample-club';

export const CHANNEL_PACK_FETCH_TIMEOUT_MS = 20_000;

export type ChannelPackRevisionCompare = 'newer' | 'same' | 'older' | 'unknown';

export interface ChannelPackFetchSuccess {
  pack: ChannelPackDocument;
  requestedUrl: string;
  finalUrl: string;
  contentType?: string;
}

export interface ChannelPackFetchFailure {
  summary: string;
  requestedUrl: string;
  finalUrl?: string;
  httpStatus?: number;
  contentType?: string;
  cause?: unknown;
}

export class ChannelPackFetchError extends Error {
  readonly details: ChannelPackFetchFailure;

  constructor(details: ChannelPackFetchFailure) {
    super(details.summary);
    this.name = 'ChannelPackFetchError';
    this.details = details;
  }
}

export interface ChannelPackUpdateAssessment {
  compare: ChannelPackRevisionCompare;
  packIdMismatch: boolean;
  declaredSourceUrl?: string;
  declaredSourceHttps: boolean;
}

export type ChannelPackFetchFn = (url: string) => Promise<ChannelPackFetchSuccess>;

let fetchImpl: ChannelPackFetchFn | undefined;

export function setChannelPackFetchImpl(impl: ChannelPackFetchFn | undefined): void {
  fetchImpl = impl;
}

function trimUrl(url: string): string {
  return url.trim();
}

export function isChannelPackFixtureUrl(url: string): boolean {
  return trimUrl(url) === CHANNEL_PACK_FIXTURE_URL;
}

/**
 * Returns an error message when the URL must not be fetched.
 * The fixture token is accepted only when `dev` is true.
 */
export function channelPackFetchRejection(url: string, dev: boolean): string | undefined {
  const trimmed = trimUrl(url);

  if (!trimmed) {
    return 'Enter a channel pack URL';
  }

  if (isChannelPackFixtureUrl(trimmed)) {
    return dev ? undefined : 'Enter an https URL';
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    return 'Channel pack URL is not valid';
  }

  if (parsed.protocol !== 'https:') {
    return 'Channel pack URL must use https';
  }

  if (parsed.username || parsed.password) {
    return 'Channel pack URL cannot include credentials';
  }

  return undefined;
}

function assertHttpsUrl(url: string): void {
  const summary = channelPackFetchRejection(url, import.meta.dev);

  if (summary) {
    throw new ChannelPackFetchError({
      summary,
      requestedUrl: url,
    });
  }
}

/** Dev-only stub path. Production (`dev === false`) ignores `packRev` and returns nothing. */
export function channelPackDevFixturePath(rev: string | null | undefined, dev: boolean): string | undefined {
  if (!dev) {
    return undefined;
  }

  switch (rev) {
    case 'newer':
      return '/fixtures/sample-club-newer.hpack';
    case 'older':
      return '/fixtures/sample-club-older.hpack';
    case 'other':
      return '/fixtures/sample-club-other.hpack';
    case 'error':
      return '/fixtures/sample-club-error.txt';
    default:
      return '/fixtures/sample-club.hpack';
  }
}

function devFixturePath(): string {
  const rev = typeof window === 'undefined' ? null : new URL(window.location.href).searchParams.get('packRev');
  return channelPackDevFixturePath(rev, import.meta.dev) ?? '/fixtures/sample-club.hpack';
}

async function fetchFixturePack(requestedUrl: string): Promise<ChannelPackFetchSuccess> {
  const response = await fetch(devFixturePath());

  if (!response.ok) {
    throw new ChannelPackFetchError({
      summary: `Channel pack download failed: HTTP ${response.status}`,
      requestedUrl,
      httpStatus: response.status,
      contentType: response.headers.get('content-type') ?? undefined,
    });
  }

  const text = await response.text();

  if (text.length > CHANNEL_PACK_MAX_CHARS) {
    throw new ChannelPackFetchError({
      summary: `Channel pack is too large (maximum ${CHANNEL_PACK_MAX_CHARS} characters)`,
      requestedUrl,
    });
  }

  let pack: ChannelPackDocument;

  try {
    pack = parseChannelPack(text);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Channel pack is not valid';
    throw new ChannelPackFetchError({
      summary: message,
      requestedUrl,
      cause,
    });
  }

  return {
    pack,
    requestedUrl,
    finalUrl: requestedUrl,
    contentType: response.headers.get('content-type') ?? undefined,
  };
}

function contentTypeAllowed(contentType: string | null | undefined): void {
  const raw = contentType?.split(';')[0]?.trim().toLowerCase();

  if (!raw) {
    return;
  }

  if (raw.startsWith('text/') || raw === 'application/json' || raw === 'application/octet-stream') {
    return;
  }

  if (
    raw.startsWith('image/')
    || raw.startsWith('audio/')
    || raw.startsWith('video/')
    || raw === 'application/pdf'
    || raw === 'application/zip'
  ) {
    throw new ChannelPackFetchError({
      summary: `Unexpected content type: ${raw}`,
      requestedUrl: '',
      contentType: raw,
    });
  }
}

async function fetchPackInBrowser(requestedUrl: string): Promise<ChannelPackFetchSuccess> {
  let response: Response;

  try {
    response = await fetch(requestedUrl, { signal: AbortSignal.timeout(CHANNEL_PACK_FETCH_TIMEOUT_MS) });
  } catch (cause) {
    const isBlocked =
      cause instanceof TypeError
      || (cause instanceof Error && cause.name === 'AbortError');

    throw new ChannelPackFetchError({
      summary: isBlocked
        ? 'The browser blocked this download. Open the same https URL in the HamBench desktop app.'
        : cause instanceof Error && cause.name === 'TimeoutError'
          ? 'Channel pack download timed out'
          : 'Channel pack download failed',
      requestedUrl,
      cause,
    });
  }

  const contentType = response.headers.get('content-type') ?? undefined;

  try {
    contentTypeAllowed(contentType);
  } catch (error) {
    if (error instanceof ChannelPackFetchError) {
      throw new ChannelPackFetchError({ ...error.details, requestedUrl, contentType });
    }

    throw error;
  }

  if (!response.ok) {
    throw new ChannelPackFetchError({
      summary: `Channel pack download failed: HTTP ${response.status}`,
      requestedUrl,
      finalUrl: response.url !== requestedUrl ? response.url : undefined,
      httpStatus: response.status,
      contentType,
    });
  }

  const text = await response.text();

  if (text.length > CHANNEL_PACK_MAX_CHARS) {
    throw new ChannelPackFetchError({
      summary: `Channel pack is too large (maximum ${CHANNEL_PACK_MAX_CHARS} characters)`,
      requestedUrl,
      finalUrl: response.url !== requestedUrl ? response.url : undefined,
      contentType,
    });
  }

  let pack: ChannelPackDocument;

  try {
    pack = parseChannelPack(text);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Channel pack is not valid';
    throw new ChannelPackFetchError({
      summary: message,
      requestedUrl,
      finalUrl: response.url !== requestedUrl ? response.url : undefined,
      contentType,
      cause,
    });
  }

  return {
    pack,
    requestedUrl,
    finalUrl: response.url,
    contentType,
  };
}

async function fetchPackInTauri(requestedUrl: string): Promise<ChannelPackFetchSuccess> {
  const { invoke } = await import('@tauri-apps/api/core');

  try {
    const result = await invoke<{ text: string; finalUrl: string; contentType?: string }>('fetch_channel_pack', {
      url: requestedUrl,
    });

    const pack = parseChannelPack(result.text);

    return {
      pack,
      requestedUrl,
      finalUrl: result.finalUrl,
      contentType: result.contentType,
    };
  } catch (cause) {
    const message = typeof cause === 'string' ? cause : cause instanceof Error ? cause.message : 'Channel pack download failed';

    throw new ChannelPackFetchError({
      summary: message,
      requestedUrl,
      cause,
    });
  }
}

export async function fetchChannelPack(url: string): Promise<ChannelPackFetchSuccess> {
  if (fetchImpl) {
    return fetchImpl(url);
  }

  const requestedUrl = trimUrl(url);
  assertHttpsUrl(requestedUrl);

  if (isChannelPackFixtureUrl(requestedUrl)) {
    return fetchFixturePack(requestedUrl);
  }

  if (isTauriRuntime()) {
    return fetchPackInTauri(requestedUrl);
  }

  return fetchPackInBrowser(requestedUrl);
}

export function parseChannelPackUpdatedMs(updated: string | undefined): number | undefined {
  if (!updated) {
    return undefined;
  }

  const ms = Date.parse(updated);

  if (Number.isNaN(ms)) {
    return undefined;
  }

  return ms;
}

export function compareChannelPackRevision(
  localUpdated: string | undefined,
  remoteUpdated: string,
): ChannelPackRevisionCompare {
  const localMs = parseChannelPackUpdatedMs(localUpdated);
  const remoteMs = parseChannelPackUpdatedMs(remoteUpdated);

  if (localMs === undefined || remoteMs === undefined) {
    return 'unknown';
  }

  if (remoteMs > localMs) {
    return 'newer';
  }

  if (remoteMs < localMs) {
    return 'older';
  }

  return 'same';
}

export function isUsableChannelPackSourceUrl(url: string | undefined, dev: boolean): boolean {
  if (!url?.trim()) {
    return false;
  }

  if (isHttpsSourceUrl(url)) {
    return true;
  }

  return dev && isChannelPackFixtureUrl(url);
}

export function isChannelPackSourceUrl(url: string | undefined): boolean {
  return isUsableChannelPackSourceUrl(url, import.meta.dev);
}

export function isHttpsSourceUrl(url: string | undefined): boolean {
  if (!url?.trim()) {
    return false;
  }

  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export function assessChannelPackUpdate(
  group: { packId?: string; packUpdated?: string; packSourceUrl?: string },
  remote: ChannelPackDocument,
): ChannelPackUpdateAssessment {
  const declared = remote.source?.trim();
  const declaredSourceHttps = isHttpsSourceUrl(declared);

  return {
    compare: compareChannelPackRevision(group.packUpdated, remote.updated),
    packIdMismatch: Boolean(group.packId && group.packId !== remote.id),
    declaredSourceUrl: declared || undefined,
    declaredSourceHttps,
  };
}

export function formatChannelPackFetchDetails(failure: ChannelPackFetchFailure): string {
  const lines = [`Requested URL: ${failure.requestedUrl}`];

  if (failure.finalUrl && failure.finalUrl !== failure.requestedUrl) {
    lines.push(`Final URL: ${failure.finalUrl}`);
  }

  if (failure.httpStatus !== undefined) {
    lines.push(`HTTP status: ${failure.httpStatus}`);
  }

  if (failure.contentType) {
    lines.push(`Content-Type: ${failure.contentType}`);
  }

  lines.push('');
  lines.push(failure.summary);

  if (failure.cause instanceof Error && failure.cause.stack) {
    lines.push('');
    lines.push(failure.cause.stack);
  }

  return lines.join('\n');
}
