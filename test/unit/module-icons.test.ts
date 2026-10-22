import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateClientBundleCode, resolveBundleIcons } from '@nuxt/icon/utils';
import {
  DEFAULT_MODULE_ICON,
  MODULE_LUCIDE_ICONS,
  isAllowedModuleIcon,
  moduleIconCollectionNames,
  moduleIconWarning,
  resolveModuleIcon,
} from '../../app/utils/module-icons.ts';

const rootDirectory = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Settings-group icons in the current org modules.
 * radio-module-kenwood is installed at runtime and is not an npm dependency,
 * so the node_modules walk below cannot see it. This list keeps those names
 * in the bundled set.
 */
const CURRENT_MODULE_ICONS = [
  'i-lucide-battery-medium',
  'i-lucide-cloud',
  'i-lucide-database',
  'i-lucide-ellipsis',
  'i-lucide-folder',
  'i-lucide-gauge',
  'i-lucide-hash',
  'i-lucide-keyboard',
  'i-lucide-layers',
  'i-lucide-layout-dashboard',
  'i-lucide-map-pinned',
  'i-lucide-monitor',
  'i-lucide-radio-tower',
  'i-lucide-repeat-2',
  'i-lucide-settings-2',
  'i-lucide-sliders-horizontal',
  'i-lucide-unplug',
  'i-lucide-volume-2',
  'i-lucide-waypoints',
  'i-lucide-wrench',
];

function iconFields(text: string): string[] {
  return [...text.matchAll(/"icon"\s*:\s*"([^"]*)"/g)].map((match) => match[1] ?? '');
}

function collectIconFields(directory: string): { file: string; icon: string }[] {
  const found: { file: string; icon: string }[] = [];

  if (!existsSync(directory)) {
    return found;
  }

  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') {
        continue;
      }

      const path = join(current, entry.name);

      if (entry.isDirectory()) {
        visit(path);
        continue;
      }

      if (!entry.name.endsWith('.json')) {
        continue;
      }

      for (const icon of iconFields(readFileSync(path, 'utf8'))) {
        found.push({ file: path, icon });
      }
    }
  };

  visit(directory);
  return found;
}

describe('module icons', () => {
  it('should bundle the curated lucide set for offline module json', async () => {
    const config = readFileSync(join(rootDirectory, 'nuxt.config.ts'), 'utf8');
    expect(config).toContain("provider: 'none'");
    expect(config).toContain('fallbackToApi: false');
    expect(config).toContain('icons: moduleIconCollectionNames()');

    const names = moduleIconCollectionNames();
    expect(names).toEqual(MODULE_LUCIDE_ICONS.map((name) => `lucide:${name}`));
    expect(new Set(MODULE_LUCIDE_ICONS).size).toBe(MODULE_LUCIDE_ICONS.length);
    expect(isAllowedModuleIcon(DEFAULT_MODULE_ICON)).toBe(true);

    const icons = JSON.parse(readFileSync(join(rootDirectory, 'node_modules/@iconify-json/lucide/icons.json'), 'utf8')) as {
      icons: Record<string, unknown>;
      aliases?: Record<string, unknown>;
    };
    const known = new Set([...Object.keys(icons.icons), ...Object.keys(icons.aliases ?? {})]);
    const missing = MODULE_LUCIDE_ICONS.filter((name) => !known.has(name));
    expect(missing).toEqual([]);

    const resolved = await resolveBundleIcons({
      icons: names,
      resolvePaths: [rootDirectory],
    });
    expect(resolved.failed).toEqual([]);
    expect(resolved.collections.map((collection) => collection.prefix)).toEqual(['lucide']);
    const bundled = new Set(Object.keys(resolved.collections[0]?.icons ?? {}));
    expect(MODULE_LUCIDE_ICONS.filter((name) => !bundled.has(name))).toEqual([]);

    const { bundleSizeKb } = generateClientBundleCode(resolved.collections);
    expect(bundleSizeKb).toBeLessThan(128);
  });

  it('should resolve unknown module icons to the default group icon', () => {
    expect(resolveModuleIcon('i-lucide-layout-dashboard')).toBe('i-lucide-layout-dashboard');
    expect(resolveModuleIcon('  i-lucide-volume-2  ')).toBe('i-lucide-volume-2');
    expect(resolveModuleIcon(undefined)).toBe(DEFAULT_MODULE_ICON);
    expect(resolveModuleIcon('')).toBe(DEFAULT_MODULE_ICON);
    expect(resolveModuleIcon('i-lucide-not-a-real-icon')).toBe(DEFAULT_MODULE_ICON);
    expect(resolveModuleIcon('i-mdi-radio')).toBe(DEFAULT_MODULE_ICON);
    expect(moduleIconWarning('i-lucide-hash')).toBeUndefined();
    expect(moduleIconWarning('i-lucide-not-a-real-icon')).toContain(DEFAULT_MODULE_ICON);
  });

  it('should keep docs/module-icons.md aligned with the allowed set', () => {
    const doc = readFileSync(join(rootDirectory, 'docs/module-icons.md'), 'utf8');
    const documented = [...doc.matchAll(/`i-lucide-([a-z0-9-]+)`/g)].map((match) => match[1] ?? '');
    expect(new Set(documented)).toEqual(new Set(MODULE_LUCIDE_ICONS));
  });

  it('should reject icon fields outside the allowed set in bundled module config', () => {
    for (const icon of CURRENT_MODULE_ICONS) {
      expect(isAllowedModuleIcon(icon), icon).toBe(true);
    }

    const springfield = join(rootDirectory, 'node_modules/@springfield');
    const moduleDirs = readdirSync(springfield).filter((name) => name.startsWith('radio-module-'));
    expect(moduleDirs.length).toBeGreaterThan(0);

    const references = [
      ...collectIconFields(join(rootDirectory, 'test/fixtures')),
      ...moduleDirs.flatMap((name) => collectIconFields(join(springfield, name))),
    ];
    expect(references.length).toBeGreaterThan(0);

    const outside = references.filter((reference) => !isAllowedModuleIcon(reference.icon));
    expect(outside).toEqual([]);
  });
});
