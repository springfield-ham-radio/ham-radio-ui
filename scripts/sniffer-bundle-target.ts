/**
 * Which `ham-radio-sniffer` binary `bundle-sniffer-resources` builds.
 *
 * Tauri sets `TAURI_ENV_TARGET_TRIPLE` for `beforeBuildCommand`. A macOS
 * release job on an arm64 runner passes `x86_64-apple-darwin` for the Intel
 * app. The host `cargo build --release` would otherwise copy an arm64
 * sniffer into that bundle.
 *
 * Linux and Windows release jobs build for the host triple. Leaving
 * `--target` off in that case keeps their output at `target/release`, which
 * is the path this script has always used.
 */

export function hostRustTriple(platform: NodeJS.Platform, arch: string): string | undefined {
  if (platform === 'darwin' && arch === 'arm64') {
    return 'aarch64-apple-darwin';
  }

  if (platform === 'darwin' && arch === 'x64') {
    return 'x86_64-apple-darwin';
  }

  if (platform === 'linux' && arch === 'arm64') {
    return 'aarch64-unknown-linux-gnu';
  }

  if (platform === 'linux' && arch === 'x64') {
    return 'x86_64-unknown-linux-gnu';
  }

  if (platform === 'win32' && arch === 'x64') {
    return 'x86_64-pc-windows-msvc';
  }

  return undefined;
}

/**
 * Rust target to pass to Cargo, or `undefined` to build the host (no
 * `--target`), matching a native Linux, Windows, or macOS release.
 */
export function snifferCargoTarget(
  requested: string | undefined,
  platform: NodeJS.Platform,
  arch: string,
): string | undefined {
  const triple = requested?.trim();

  if (!triple) {
    return undefined;
  }

  if (triple === hostRustTriple(platform, arch)) {
    return undefined;
  }

  return triple;
}

export function snifferCargoArguments(target: string | undefined): string[] {
  const args = ['build', '--release'];

  if (target) {
    args.push('--target', target);
  }

  return args;
}

/** Path parts under the sniffer crate for the binary Cargo just built. */
export function snifferReleaseBinaryParts(target: string | undefined, binaryName: string): string[] {
  if (target) {
    return ['target', target, 'release', binaryName];
  }

  return ['target', 'release', binaryName];
}

/** Mach-O arch token expected in `file` output for an Apple target. */
export function expectedMachOArch(targetTriple: string | undefined): 'x86_64' | 'arm64' | undefined {
  if (!targetTriple?.endsWith('-apple-darwin')) {
    return undefined;
  }

  if (targetTriple.startsWith('x86_64-')) {
    return 'x86_64';
  }

  if (targetTriple.startsWith('aarch64-')) {
    return 'arm64';
  }

  return undefined;
}

/**
 * True when `file -b` describes a single-arch Mach-O of `expected`.
 * A universal binary mentions both arches and does not match.
 */
export function machODescriptionMatches(description: string, expected: 'x86_64' | 'arm64'): boolean {
  const other = expected === 'x86_64' ? 'arm64' : 'x86_64';

  return description.includes(expected) && !description.includes(other);
}
