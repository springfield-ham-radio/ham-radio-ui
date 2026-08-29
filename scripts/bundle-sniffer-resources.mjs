#!/usr/bin/env node
/**
 * Copy publishable ham-radio-sniffer sources into Tauri resources for optional
 * SSH install. Native deps are built on the remote host, so node_modules and
 * .output are excluded.
 */

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const uiRoot = resolve(scriptDirectory, '..');
const workspaceRoot = resolve(uiRoot, '../..');
const snifferRoot = resolve(workspaceRoot, 'utils/ham-radio-sniffer');
const destinationRoot = resolve(uiRoot, 'src-tauri/resources/ham-radio-sniffer');

const relativeEntries = [
  'package.json',
  'yarn.lock',
  '.yarnrc.yml',
  '.nvmrc',
  'nuxt.config.ts',
  'tsconfig.json',
  'src',
  'server',
  'shared',
];

const sourcePackage = join(snifferRoot, 'package.json');
const destinationPackage = join(destinationRoot, 'package.json');

if (!existsSync(sourcePackage)) {
  if (existsSync(destinationPackage)) {
    console.warn(
      `Sniffer package not found at ${snifferRoot}; keeping existing bundle at ${destinationRoot}`,
    );
    process.exit(0);
  }

  console.error(`Sniffer package not found at ${snifferRoot}`);
  process.exit(1);
}

rmSync(destinationRoot, { recursive: true, force: true });
mkdirSync(destinationRoot, { recursive: true });

for (const entry of relativeEntries) {
  const source = join(snifferRoot, entry);

  if (!existsSync(source)) {
    console.error(`Missing sniffer entry: ${source}`);
    process.exit(1);
  }

  cpSync(source, join(destinationRoot, entry), { recursive: true });
}

console.log(`Bundled sniffer sources into ${destinationRoot}`);
