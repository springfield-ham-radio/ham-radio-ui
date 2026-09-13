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
  modes: string[];
  powers: string[];
  modeCommand?: string;
  powerBandIndex: boolean;
  bandControl: boolean;
}

function normalizeName(value: string): string {
  return value.trim().toUpperCase();
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

  return {
    wakeCr: Boolean(cat.wakeCr),
    vfoCount,
    frequencyCommands,
    frequencyWidth: cat.frequencyWidth ?? (vfoChannel ? 10 : 11),
    vfoChannel,
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
