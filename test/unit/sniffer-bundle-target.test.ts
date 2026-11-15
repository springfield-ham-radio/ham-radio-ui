import { describe, expect, it } from 'vitest';
import {
  expectedMachOArch,
  hostRustTriple,
  machODescriptionMatches,
  snifferCargoArguments,
  snifferCargoTarget,
  snifferReleaseBinaryParts,
} from '../../scripts/sniffer-bundle-target.ts';

describe('sniffer bundle target', () => {
  it('should keep a native Linux, Windows, or Apple Silicon build on the host path', () => {
    expect(snifferCargoTarget('x86_64-unknown-linux-gnu', 'linux', 'x64')).toBeUndefined();
    expect(snifferCargoTarget('aarch64-unknown-linux-gnu', 'linux', 'arm64')).toBeUndefined();
    expect(snifferCargoTarget('x86_64-pc-windows-msvc', 'win32', 'x64')).toBeUndefined();
    expect(snifferCargoTarget('aarch64-apple-darwin', 'darwin', 'arm64')).toBeUndefined();
    expect(snifferCargoTarget(undefined, 'linux', 'x64')).toBeUndefined();

    expect(snifferCargoArguments(undefined)).toEqual(['build', '--release']);
    expect(snifferReleaseBinaryParts(undefined, 'ham-radio-sniffer')).toEqual([
      'target',
      'release',
      'ham-radio-sniffer',
    ]);
  });

  it('should cross-compile the sniffer for the macOS Intel target on an arm64 runner', () => {
    const target = snifferCargoTarget('x86_64-apple-darwin', 'darwin', 'arm64');

    expect(target).toBe('x86_64-apple-darwin');
    expect(hostRustTriple('darwin', 'arm64')).toBe('aarch64-apple-darwin');
    expect(snifferCargoArguments(target)).toEqual(['build', '--release', '--target', 'x86_64-apple-darwin']);
    expect(snifferReleaseBinaryParts(target, 'ham-radio-sniffer')).toEqual([
      'target',
      'x86_64-apple-darwin',
      'release',
      'ham-radio-sniffer',
    ]);
  });

  it('should require a single-arch Mach-O matching the Apple target', () => {
    expect(expectedMachOArch('x86_64-apple-darwin')).toBe('x86_64');
    expect(expectedMachOArch('aarch64-apple-darwin')).toBe('arm64');
    expect(expectedMachOArch('x86_64-unknown-linux-gnu')).toBeUndefined();
    expect(machODescriptionMatches('Mach-O 64-bit executable x86_64\n', 'x86_64')).toBe(true);
    expect(machODescriptionMatches('Mach-O 64-bit executable arm64\n', 'x86_64')).toBe(false);
    expect(
      machODescriptionMatches(
        'Mach-O universal binary with 2 architectures: [x86_64:Mach-O 64-bit executable x86_64] [arm64]\n',
        'x86_64',
      ),
    ).toBe(false);
  });
});
