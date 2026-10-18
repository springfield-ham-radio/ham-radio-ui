import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { IMPORT_EXPORT_IDS } from '~/importExport/ids';
import { registerBuiltinImportExport } from '~/importExport/builtins';
import { channelLibraryFileImportSources } from '~/importExport/channel-file-catalog';
import { createImportExportRegistry, importExportContext } from '~/importExport/registry';
import { parseChannelPack } from '~/utils/channel-pack';
import {
  assessChannelPackUpdate,
  ChannelPackFetchError,
  compareChannelPackRevision,
  fetchChannelPack,
  isChannelPackFixtureUrl,
  setChannelPackFetchImpl,
} from '~/utils/channel-pack-fetch';

const sampleText = readFileSync(new URL('../../public/fixtures/sample-club.hpack', import.meta.url), 'utf8');
const samplePack = parseChannelPack(sampleText);

describe('channel pack fetch', () => {
  it('rejects non-https and fixture token outside dev', async () => {
    await expect(fetchChannelPack('http://example.com/pack.hpack')).rejects.toThrow(ChannelPackFetchError);
  });

  it('parses a successful mocked download', async () => {
    setChannelPackFetchImpl(async (url) => ({
      pack: samplePack,
      requestedUrl: url,
      finalUrl: url,
      contentType: 'text/plain',
    }));

    const result = await fetchChannelPack('https://example.com/club.hpack');
    expect(result.pack.name).toBe('Sample Club Net');
    setChannelPackFetchImpl(undefined);
  });

  it('maps http failures from the mock', async () => {
    setChannelPackFetchImpl(async (url) => {
      throw new ChannelPackFetchError({
        summary: 'Channel pack download failed: HTTP 404',
        requestedUrl: url,
        httpStatus: 404,
      });
    });

    await expect(fetchChannelPack('https://example.com/missing.hpack')).rejects.toMatchObject({
      details: { httpStatus: 404 },
    });
    setChannelPackFetchImpl(undefined);
  });

  it('refuses image content types in the mock', async () => {
    setChannelPackFetchImpl(async (url) => {
      throw new ChannelPackFetchError({
        summary: 'Unexpected content type: image/png',
        requestedUrl: url,
        contentType: 'image/png',
      });
    });

    await expect(fetchChannelPack('https://example.com/pack.hpack')).rejects.toThrow(/image\/png/);
    setChannelPackFetchImpl(undefined);
  });

  it('compares updated timestamps for newer, same, and older', () => {
    expect(compareChannelPackRevision('2026-10-17T21:00:00.000Z', '2026-10-18T12:00:00.000Z')).toBe('newer');
    expect(compareChannelPackRevision('2026-10-17T21:00:00.000Z', '2026-10-17T21:00:00.000Z')).toBe('same');
    expect(compareChannelPackRevision('2026-10-18T12:00:00.000Z', '2026-10-17T21:00:00.000Z')).toBe('older');
    expect(compareChannelPackRevision('2026-10-17T21:00:00.000Z', '2026-10-17T21:00:00.000Z')).toBe('same');
    expect(compareChannelPackRevision('not-a-date', '2026-10-17T21:00:00.000Z')).toBe('unknown');
  });

  it('detects pack id mismatch and declared source opt-in', () => {
    const assessment = assessChannelPackUpdate(
      {
        packId: 'a1b2c3d4-e5f6-4789-a012-3456789abcde',
        packUpdated: '2026-10-17T21:00:00.000Z',
        packSourceUrl: 'https://example.com/a.hpack',
      },
      {
        ...samplePack,
        id: 'b2c3d4e5-f6a7-4890-b123-456789abcdef',
        source: 'https://example.com/declared.hpack',
      },
    );

    expect(assessment.packIdMismatch).toBe(true);
    expect(assessment.declaredSourceHttps).toBe(true);
  });

  it('registers the online pack url import source', async () => {
    const registry = createImportExportRegistry();
    registerBuiltinImportExport(registry);
    const entry = registry.require(IMPORT_EXPORT_IDS.importChannelsPackUrl);
    expect(entry.category).toBe('online');
    await expect(entry.handler({})).rejects.toThrow(/needs a url/);
  });

  it('lists import from url in the channel catalog without adding it to file ids', () => {
    const rows = channelLibraryFileImportSources(importExportContext());
    expect(rows.map((row) => row.id)).toContain(IMPORT_EXPORT_IDS.importChannelsPackUrl);
  });

  it('recognizes the dev fixture token', () => {
    expect(isChannelPackFixtureUrl('fixture:sample-club')).toBe(true);
  });
});
