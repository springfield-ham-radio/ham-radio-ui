import type { RadioCatConfig } from '~/utils/cat-capability';

/**
 * Resolved Kenwood CAT profile. Built from the radio module `cat` block.
 */
export interface KenwoodCatProfile {
  wakeCr: boolean;
  vfoCount: number;
  frequencyCommands: string[];
  frequencyWidth: number;
  vfoChannel: boolean;
  bandIndexed: boolean;
  bandModes?: string[][];
  vfoModeCommand?: string;
  vfoModes?: string[];
  modes: string[];
  powers: string[];
  modeCommand?: string;
  powerBandIndex: boolean;
  bandControl: boolean;
}

function normalizeName(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeBandModes(bandModes: string[][] | undefined, vfoCount: number, modes: readonly string[]): string[][] | undefined {
  if (!bandModes) {
    return undefined;
  }

  if (bandModes.length !== vfoCount) {
    throw new Error(`Radio module CAT bandModes must declare ${vfoCount} band list${vfoCount === 1 ? '' : 's'}`);
  }

  const modeSet = new Set(modes.map((mode) => mode.trim().toLowerCase()));
  const normalized: string[][] = [];

  for (const [bandIndex, names] of bandModes.entries()) {
    const bandList = names.map((mode) => mode.trim()).filter((mode) => mode.length > 0);

    for (const name of bandList) {
      if (!modeSet.has(name.toLowerCase())) {
        throw new Error(`Radio module CAT bandModes[${bandIndex}] mode ${name} is not in modes`);
      }
    }

    normalized.push(bandList);
  }

  return normalized;
}

/**
 * Mode names the operator may select on one band.
 */
export function selectableModesForBand(profile: KenwoodCatProfile, band: 0 | 1): readonly string[] {
  if (profile.bandModes && profile.bandModes[band]) {
    return profile.bandModes[band]!;
  }

  return profile.modes;
}

/**
 * Turn a driver `cat` block into a Kenwood session profile.
 */
export function kenwoodCatProfileFromConfig(cat: RadioCatConfig | undefined): KenwoodCatProfile {
  if (!cat || cat.protocol.trim().toLowerCase() !== 'kenwood') {
    throw new Error('Radio module does not declare Kenwood CAT');
  }

  const vfoCount = Math.max(1, Math.floor(cat.vfoCount ?? 1));
  const frequencyCommands = (cat.frequencyCommands?.length ? cat.frequencyCommands : ['FQ', 'FO']).map(normalizeName);
  const modes = (cat.modes ?? ['FM']).map((mode) => mode.trim()).filter((mode) => mode.length > 0);
  const powers = (cat.powers ?? ['High', 'Medium', 'Low']).map((power) => power.trim()).filter((power) => power.length > 0);

  if (frequencyCommands.length === 0) {
    throw new Error('Radio module CAT block has no frequency command');
  }

  if (modes.length === 0 || powers.length === 0) {
    throw new Error('Radio module CAT block must declare modes and powers');
  }

  const vfoChannel = Boolean(cat.vfoChannel);
  const bandIndexed = Boolean(cat.bandIndexed);

  if (vfoChannel && bandIndexed) {
    throw new Error('Radio module CAT cannot set both vfoChannel and bandIndexed');
  }

  if (vfoCount > 1 && !vfoChannel && !bandIndexed) {
    throw new Error(
      'Radio module CAT must set vfoChannel or bandIndexed for dual-band Kenwood radios. Reinstall the radio module.',
    );
  }

  const bandModes = normalizeBandModes(cat.bandModes, vfoCount, modes);
  const vfoModeCommand = cat.vfoModeCommand ? normalizeName(cat.vfoModeCommand) : undefined;
  const vfoModes = cat.vfoModes?.map((label) => label.trim()).filter((label) => label.length > 0);

  return {
    wakeCr: Boolean(cat.wakeCr),
    vfoCount,
    frequencyCommands,
    frequencyWidth: cat.frequencyWidth ?? (vfoChannel ? 10 : 11),
    vfoChannel,
    bandIndexed,
    ...(bandModes ? { bandModes } : {}),
    ...(vfoModeCommand ? { vfoModeCommand } : {}),
    ...(vfoModes?.length ? { vfoModes } : {}),
    modes,
    powers,
    modeCommand: cat.modeCommand ? normalizeName(cat.modeCommand) : undefined,
    powerBandIndex: cat.powerBandIndex ?? vfoCount > 1,
    bandControl: cat.bandControl ?? false,
  };
}

export function lookupCatCode(labels: readonly string[], value: string): number | undefined {
  const normalized = value.trim().toLowerCase();
  const index = labels.findIndex((label) => label.trim().toLowerCase() === normalized);
  return index >= 0 ? index : undefined;
}

export function labelAt(labels: readonly string[], code: number): string | undefined {
  return labels[code];
}