#!/usr/bin/env node
/**
 * Build the ham-radio-sniffer binary and copy it into Tauri resources.
 *
 * Local install uses the host binary. SSH install onto a Raspberry Pi uses
 * ham-radio-sniffer-linux-aarch64 when that file is already in the sniffer
 * dist directory (CI builds it on ubuntu-22.04-arm).
 */

import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const uiRoot = resolve(scriptDirectory, '..');
const destinationRoot = resolve(uiRoot, 'src-tauri/resources/ham-radio-sniffer');
const hostBinaryName = process.platform === 'win32' ? 'ham-radio-sniffer.exe' : 'ham-radio-sniffer';

const snifferCandidates = [
  resolve(uiRoot, '../ham-radio-sniffer'),
  resolve(uiRoot, 'vendor/ham-radio-sniffer'),
  resolve(uiRoot, '../../utils/ham-radio-sniffer'),
];

function findSnifferRoot() {
  return snifferCandidates.find((candidate) => existsSync(join(candidate, 'Cargo.toml')));
}

function readCrateVersion(snifferRoot) {
  const cargoToml = readFileSync(join(snifferRoot, 'Cargo.toml'), 'utf8');
  const match = cargoToml.match(/^version = "([^"]+)"/m);

  if (!match) {
    console.error(`Cargo.toml in ${snifferRoot} has no version`);
    process.exit(1);
  }

  return match[1];
}

function copyExecutable(source, destination) {
  cpSync(source, destination);
  if (process.platform !== 'win32') {
    chmodSync(destination, 0o755);
  }
}

const snifferRoot = findSnifferRoot();

if (!snifferRoot) {
  if (existsSync(join(destinationRoot, 'version'))) {
    console.warn(`Sniffer crate not found; keeping existing bundle at ${destinationRoot}`);
    process.exit(0);
  }

  console.error(`Sniffer crate not found. Looked in:\n${snifferCandidates.join('\n')}`);
  process.exit(1);
}

const build = spawnSync('cargo', ['build', '--release'], {
  cwd: snifferRoot,
  stdio: 'inherit',
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const builtBinary = join(snifferRoot, 'target', 'release', hostBinaryName);

if (!existsSync(builtBinary)) {
  console.error(`Sniffer build did not produce ${builtBinary}`);
  process.exit(1);
}

rmSync(destinationRoot, { recursive: true, force: true });
mkdirSync(destinationRoot, { recursive: true });
copyExecutable(builtBinary, join(destinationRoot, hostBinaryName));
writeFileSync(join(destinationRoot, 'version'), `${readCrateVersion(snifferRoot)}\n`);

const linuxArm64 = join(snifferRoot, 'dist', 'ham-radio-sniffer-linux-aarch64');

if (existsSync(linuxArm64)) {
  copyExecutable(linuxArm64, join(destinationRoot, 'ham-radio-sniffer-linux-aarch64'));
} else if (process.platform === 'linux' && process.arch === 'arm64') {
  copyExecutable(builtBinary, join(destinationRoot, 'ham-radio-sniffer-linux-aarch64'));
}

if (process.platform === 'linux' && process.arch === 'x64') {
  copyExecutable(builtBinary, join(destinationRoot, 'ham-radio-sniffer-linux-x64'));
}

console.log(`Bundled sniffer binary into ${destinationRoot}`);
