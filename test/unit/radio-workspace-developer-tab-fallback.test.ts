// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { computed, ref, watch, nextTick, type ComputedRef, type Ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { defaultDeveloperPanels } from '../../app/utils/developer-panels.ts';

const WORKSPACE_PATH = 'app/components/RadioWorkspace.vue';

/**
 * Pull the developer-tab visibility watch from RadioWorkspace. The pattern is
 * specific to items.value.map — not the CAT fallback watch.
 */
function extractDeveloperTabVisibilityWatch(source: string): string | null {
  const match = source.match(
    /watch\(\s*\(\)\s*=>\s*items\.value\.map\(\(item\)\s*=>\s*item\.value\),\s*\(visible\)\s*=>\s*\{[\s\S]*?\n\s*\}\s*,?\s*\);/,
  );

  return match?.[0] ?? null;
}

function registerDeveloperTabVisibilityWatch(
  items: ComputedRef<{ value: string }[]>,
  activeTab: Ref<string>,
  workspaceSource: string,
): void {
  const watchSource = extractDeveloperTabVisibilityWatch(workspaceSource);

  if (!watchSource) {
    throw new Error('Developer tab visibility watch is missing from RadioWorkspace.vue');
  }

  const register = new Function('watch', 'items', 'activeTab', watchSource) as (
    watchFn: typeof watch,
    itemsRef: ComputedRef<{ value: string }[]>,
    activeTabRef: Ref<string>,
  ) => void;

  register(watch, items, activeTab);
}

describe('radio workspace developer tab fallback', () => {
  it('keeps the developer-tab visibility watch in RadioWorkspace', () => {
    const workspace = readFileSync(WORKSPACE_PATH, 'utf8');

    expect(extractDeveloperTabVisibilityWatch(workspace)).not.toBeNull();
    expect(workspace).toMatch(
      /if\s*\(\s*!visible\.some\(\(value\)\s*=>\s*value\s*===\s*current\)\s*\)\s*\{\s*activeTab\.value\s*=\s*'channels';\s*\}/,
    );
  });

  it('falls back to Channels when a hidden developer tab was active', async () => {
    const workspace = readFileSync(WORKSPACE_PATH, 'utf8');
    const developerPanels = ref({
      ...defaultDeveloperPanels(),
      radioHex: true,
    });

    const items = computed(() => {
      const tabs: { value: string }[] = [{ value: 'channels' }, { value: 'settings' }];

      if (developerPanels.value.radioHex) {
        tabs.push({ value: 'hex' });
      }

      return tabs;
    });

    const activeTab = ref('hex');
    registerDeveloperTabVisibilityWatch(items, activeTab, workspace);

    developerPanels.value = { ...developerPanels.value, radioHex: false };
    await nextTick();

    expect(activeTab.value).toBe('channels');
  });

  it('leaves Channels selected when Channels stays visible', async () => {
    const workspace = readFileSync(WORKSPACE_PATH, 'utf8');
    const developerPanels = ref({
      ...defaultDeveloperPanels(),
      radioDriver: true,
    });

    const items = computed(() => {
      const tabs: { value: string }[] = [{ value: 'channels' }, { value: 'settings' }];

      if (developerPanels.value.radioDriver) {
        tabs.push({ value: 'driver' });
      }

      return tabs;
    });

    const activeTab = ref('channels');
    registerDeveloperTabVisibilityWatch(items, activeTab, workspace);

    developerPanels.value = { ...defaultDeveloperPanels() };
    await nextTick();

    expect(activeTab.value).toBe('channels');
  });
});