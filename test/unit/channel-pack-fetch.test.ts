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
  channelPackDevFixturePath,
  channelPackFetchRejection,
  compareChannelPackRevision,
  fetchChannelPack,
  isChannelPackFixtureUrl,
  isUsableChannelPackSourceUrl,
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

  it('channels page destructures only fields useSavedChannels returns', () => {
    const page = readFileSync(new URL('../../app/pages/channels.vue', import.meta.url), 'utf8');
    const composable = readFileSync(new URL('../../app/composables/useSavedChannels.ts', import.meta.url), 'utf8');
    const destructure = page.match(/const \{([\s\S]*?)\} = useSavedChannels\(\)/);
    expect(destructure?.[1]).toBeTruthy();
    const used = destructure![1]!
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    const start = composable.lastIndexOf('return {');
    const block = composable.slice(start, composable.indexOf('};', start));
    const returned = [...block.matchAll(/^\s+(\w+),?\s*$/gm)].map((match) => match[1]);

    expect(used.length).toBeGreaterThan(0);
    expect(returned).toEqual(expect.arrayContaining(used));

    for (const file of [
      '../../app/components/ChannelPackFetchAlert.vue',
      '../../app/components/ChannelPackUpdateDialog.vue',
      '../../app/components/ChannelPackUrlDialog.vue',
      '../../app/components/ChannelGroupTabs.vue',
    ]) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(source).not.toContain('useSavedChannels');
    }
  });

  it('recognizes the dev fixture token', () => {
    expect(isChannelPackFixtureUrl('fixture:sample-club')).toBe(true);
  });

  it('rejects the fixture token and ignores packRev outside development', () => {
    expect(channelPackFetchRejection('fixture:sample-club', false)).toBe('Enter an https URL');
    expect(channelPackFetchRejection('fixture:sample-club', true)).toBeUndefined();
    expect(channelPackFetchRejection('http://example.com/pack.hpack', false)).toMatch(/https/);
    expect(channelPackDevFixturePath('newer', false)).toBeUndefined();
    expect(channelPackDevFixturePath('error', false)).toBeUndefined();
    expect(channelPackDevFixturePath('newer', true)).toBe('/fixtures/sample-club-newer.hpack');
    expect(channelPackDevFixturePath('other', true)).toBe('/fixtures/sample-club-other.hpack');
    expect(isUsableChannelPackSourceUrl('fixture:sample-club', false)).toBe(false);
    expect(isUsableChannelPackSourceUrl('fixture:sample-club', true)).toBe(true);
    expect(isUsableChannelPackSourceUrl('https://example.com/club.hpack', false)).toBe(true);
  });

  it('keeps the fetched URL unless the operator adopts a different https source', () => {
    const group = {
      packId: samplePack.id,
      packUpdated: '2026-10-17T21:00:00.000Z',
      packSourceUrl: 'https://example.com/stored.hpack',
    };
    const remote = { ...samplePack, source: 'http://example.com/declared.hpack', updated: '2026-10-18T12:00:00.000Z' };
    const assessment = assessChannelPackUpdate(group, remote);

    expect(assessment.packIdMismatch).toBe(false);
    expect(assessment.compare).toBe('newer');
    expect(assessment.declaredSourceHttps).toBe(false);
    expect(assessment.declaredSourceUrl).toBe('http://example.com/declared.hpack');
  });
});
