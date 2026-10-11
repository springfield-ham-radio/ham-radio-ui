import { readFileSync } from 'node:fs';
import { computed, ref, watch } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Frequency, RadioChannelId, RadioToneType } from '@springfield/ham-radio-api';
import { ALL_CHANNELS_TAB_ID } from '../../app/utils/channel-groups.ts';

const storedAustinGroup = {
  id: 'austin-group-id',
  name: 'Austin',
  kind: 'group' as const,
  createdAt: 1,
  updatedAt: 2,
};

const storedTripGroup = {
  id: 'i35-trip-id',
  name: 'I-35 Texas',
  kind: 'trip' as const,
  icon: 'i-lucide-route',
  createdAt: 1,
  updatedAt: 2,
};

const sampleChannel = {
  id: RadioChannelId('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  name: 'Repeater —',
  kind: 'repeater' as const,
  transmitFrequency: Frequency(146_340_000),
  receiveFrequency: Frequency(146_940_000),
  transmitTone: { tone: 1072, type: RadioToneType.CTCSS },
  receiveTone: { tone: 1072, type: RadioToneType.CTCSS },
  createdAt: 1,
  updatedAt: 2,
};

vi.mock('../../app/utils/channel-groups-db.ts', () => ({
  listChannelGroups: vi.fn(async () => [storedAustinGroup, storedTripGroup]),
  listChannelGroupMemberships: vi.fn(async () => []),
  addChannelsToGroup: vi.fn(),
  deleteChannelGroup: vi.fn(),
  insertChannelGroup: vi.fn(),
  renameChannelGroup: vi.fn(),
}));

vi.mock('../../app/utils/saved-channels-db.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../app/utils/saved-channels-db.ts')>();

  return {
    ...actual,
    listSavedChannels: vi.fn(async () => [sampleChannel]),
    insertSavedChannels: vi.fn(async () => []),
    insertSavedChannelModels: vi.fn(async () => []),
    updateSavedChannel: vi.fn(),
    deleteSavedChannel: vi.fn(),
    deleteSavedChannels: vi.fn(),
  };
});

vi.mock('../../app/composables/usePredefinedChannelGroups.ts', () => ({
  usePredefinedChannelGroups: () => ({
    visibleGroups: computed(() => []),
    settings: ref({}),
    setShown: vi.fn(),
    groupIds: [],
  }),
}));

const stateStore = new Map<string, ReturnType<typeof ref>>();

vi.stubGlobal('useState', (key: string, init?: () => unknown) => {
  if (!stateStore.has(key)) {
    stateStore.set(key, ref(typeof init === 'function' ? init() : undefined));
  }

  return stateStore.get(key)!;
});
vi.stubGlobal('computed', computed);
vi.stubGlobal('watch', watch);
vi.stubGlobal('useToast', () => ({ add: vi.fn() }));
vi.stubGlobal('usePredefinedChannelGroups', () => ({
  visibleGroups: computed(() => []),
  settings: ref({}),
  setShown: vi.fn(),
  groupIds: [],
}));

describe('Channels page mount', () => {
  beforeEach(() => {
    stateStore.clear();
  });

  it('loads stored group and trip names for ChannelGroupTabs after refresh', async () => {
    vi.stubGlobal('onMounted', vi.fn());

    const { useSavedChannels } = await import('../../app/composables/useSavedChannels.ts');
    const { refresh, groups } = useSavedChannels();

    await refresh();

    const names = groups.value.map((group) => group.name);
    expect(names).toContain('Austin');
    expect(names).toContain('I-35 Texas');
    expect(groups.value.find((group) => group.name === 'I-35 Texas')?.kind).toBe('trip');
  });

  it('builds tab items for All plus every stored group', async () => {
    vi.stubGlobal('onMounted', vi.fn());

    const { useSavedChannels } = await import('../../app/composables/useSavedChannels.ts');
    const { refresh, groups } = useSavedChannels();

    await refresh();

    const tabItems = [
      { label: 'All', value: ALL_CHANNELS_TAB_ID },
      ...groups.value.map((group) => ({ label: group.name, value: group.id })),
    ];

    expect(tabItems.map((item) => item.label)).toEqual(['All', 'Austin', 'I-35 Texas']);
  });

  it('wires the Channels page to refresh on mount and pass groups to ChannelGroupTabs', () => {
    const source = readFileSync(new URL('../../app/pages/channels.vue', import.meta.url), 'utf8');

    expect(source).toMatch(/onMounted\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*void refresh\(\)/);
    expect(source).toContain(':groups="groups"');
    expect(source).toMatch(/\brefresh,\s*\n/);
  });
});
