import { PROPAGATION_BANDS, type PropagationBandId } from '~/utils/propagation-bands';

export type AntennaBandId = PropagationBandId | '2m' | '70cm';

export interface AntennaBand {
  id: AntennaBandId;
  label: string;
  /** Approximate free-space wavelength in meters. */
  wavelengthM: number;
}

/**
 * Bands an antenna can be tagged with. Includes 2 m / 70 cm for station
 * antennas; those are not on the WWV openings chart.
 */
export const ANTENNA_BANDS: readonly AntennaBand[] = [
  ...PROPAGATION_BANDS.map((band) => ({
    id: band.id,
    label: band.label,
    wavelengthM: Number.parseInt(band.id, 10),
  })),
  { id: '2m', label: '2 m', wavelengthM: 2 },
  { id: '70cm', label: '70 cm', wavelengthM: 0.7 },
];

const ANTENNA_BAND_IDS = new Set<string>(ANTENNA_BANDS.map((band) => band.id));

export type AntennaTypeId =
  | 'dipole'
  | 'inverted-v'
  | 'quarter-wave-vertical'
  | 'yagi-3el'
  | 'magloop'
  | 'end-fed'
  | 'dual-band-vertical'
  | 'vhf-yagi'
  | 'uhf-yagi';

/** How energy is distributed in azimuth. Heading is unused for omni. */
export type AntennaPattern = 'omni' | 'bidirectional' | 'directive';

/** Coarse elevation character. Skip rings use type plus height, not this alone. */
export type AntennaTakeoff = 'high' | 'medium' | 'low';

export interface AntennaType {
  id: AntennaTypeId;
  label: string;
  description: string;
  pattern: AntennaPattern;
  /**
   * Typical peak gain in dBi. Catalog estimate for a generic of this family,
   * not a manufacturer measurement or NEC run.
   */
  gainDbi: number;
  /** Azimuth beamwidth of the main lobe in degrees. Omni is 360. */
  beamwidthDeg: number;
  /** Typical front-to-back ratio in dB. Zero for omni and bidirectional. */
  frontToBackDb: number;
  takeoff: AntennaTakeoff;
  defaultBands: AntennaBandId[];
  defaultHeightAglM: number;
  /** True heading of maximum radiation when the type is not omni. */
  defaultHeadingDeg: number;
  /** Dipoles, inverted-Vs, and HF beams can use LC traps for extra bands. */
  supportsTraps: boolean;
  /** Tribanders start trapped; a single-band dipole does not. */
  defaultTrapped: boolean;
}

const HF_40_TO_10: AntennaBandId[] = ['40m', '30m', '20m', '17m', '15m', '12m', '10m'];
const VHF_UHF: AntennaBandId[] = ['2m', '70cm'];

/**
 * Built-in generic antenna families. Commercial SKUs can parameterize these later.
 */
export const ANTENNA_TYPES: readonly AntennaType[] = [
  {
    id: 'dipole',
    label: 'Dipole',
    description: 'Half-wave center-fed wire. Heading is the broadside direction of maximum radiation. Enable traps for a multi-band (for example 80/40) dipole.',
    pattern: 'bidirectional',
    gainDbi: 2.15,
    beamwidthDeg: 78,
    frontToBackDb: 0,
    takeoff: 'medium',
    defaultBands: ['40m'],
    defaultHeightAglM: 10,
    defaultHeadingDeg: 45,
    supportsTraps: true,
    defaultTrapped: false,
  },
  {
    id: 'inverted-v',
    label: 'Inverted-V',
    description: 'Center-supported dipole with sloping legs. Higher takeoff than a flat-top at the same apex. Enable traps for a multi-band wire.',
    pattern: 'bidirectional',
    gainDbi: 1.5,
    beamwidthDeg: 90,
    frontToBackDb: 0,
    takeoff: 'high',
    defaultBands: ['40m'],
    defaultHeightAglM: 8,
    defaultHeadingDeg: 45,
    supportsTraps: true,
    defaultTrapped: false,
  },
  {
    id: 'quarter-wave-vertical',
    label: 'Quarter-wave vertical',
    description: 'Ground-mounted or elevated vertical. Omnidirectional; heading is not used.',
    pattern: 'omni',
    gainDbi: 1.5,
    beamwidthDeg: 360,
    frontToBackDb: 0,
    takeoff: 'medium',
    defaultBands: ['40m'],
    defaultHeightAglM: 2,
    defaultHeadingDeg: 0,
    supportsTraps: false,
    defaultTrapped: false,
  },
  {
    id: 'yagi-3el',
    label: '3-element Yagi',
    description: 'Directive trap tribander (typically 20/15/10). Heading is the boom direction of maximum gain.',
    pattern: 'directive',
    gainDbi: 7,
    beamwidthDeg: 66,
    frontToBackDb: 20,
    takeoff: 'low',
    defaultBands: ['20m', '15m', '10m'],
    defaultHeightAglM: 15,
    defaultHeadingDeg: 45,
    supportsTraps: true,
    defaultTrapped: true,
  },
  {
    id: 'magloop',
    label: 'Magnetic loop',
    description: 'Small transmitting loop. Roughly omnidirectional; efficiency is lower than a full-size wire.',
    pattern: 'omni',
    gainDbi: 0,
    beamwidthDeg: 360,
    frontToBackDb: 0,
    takeoff: 'high',
    defaultBands: HF_40_TO_10,
    defaultHeightAglM: 2,
    defaultHeadingDeg: 0,
    supportsTraps: false,
    defaultTrapped: false,
  },
  {
    id: 'end-fed',
    label: 'End-fed',
    description: 'End-fed half-wave or random wire. Heading is the broadside of the wire.',
    pattern: 'bidirectional',
    gainDbi: 2,
    beamwidthDeg: 90,
    frontToBackDb: 0,
    takeoff: 'medium',
    defaultBands: HF_40_TO_10,
    defaultHeightAglM: 10,
    defaultHeadingDeg: 45,
    supportsTraps: false,
    defaultTrapped: false,
  },
  {
    id: 'dual-band-vertical',
    label: 'Dual-band vertical',
    description: '2 m / 70 cm omnidirectional (J-pole, collinear, or dual-band whip). Heading is not used.',
    pattern: 'omni',
    gainDbi: 4.5,
    beamwidthDeg: 360,
    frontToBackDb: 0,
    takeoff: 'low',
    defaultBands: VHF_UHF,
    defaultHeightAglM: 8,
    defaultHeadingDeg: 0,
    supportsTraps: false,
    defaultTrapped: false,
  },
  {
    id: 'vhf-yagi',
    label: '2 m Yagi',
    description: 'Directive 2 m beam. Heading is the boom direction of maximum gain.',
    pattern: 'directive',
    gainDbi: 10,
    beamwidthDeg: 42,
    frontToBackDb: 18,
    takeoff: 'low',
    defaultBands: ['2m'],
    defaultHeightAglM: 10,
    defaultHeadingDeg: 45,
    supportsTraps: false,
    defaultTrapped: false,
  },
  {
    id: 'uhf-yagi',
    label: '70 cm Yagi',
    description: 'Directive 70 cm beam. Heading is the boom direction of maximum gain.',
    pattern: 'directive',
    gainDbi: 12,
    beamwidthDeg: 36,
    frontToBackDb: 18,
    takeoff: 'low',
    defaultBands: ['70cm'],
    defaultHeightAglM: 10,
    defaultHeadingDeg: 45,
    supportsTraps: false,
    defaultTrapped: false,
  },
] as const;

/** Catalog loss for LC traps. Not a manufacturer efficiency spec. */
const TRAP_GAIN_LOSS_DBI = 0.5;

const ANTENNA_TYPE_IDS = new Set<string>(ANTENNA_TYPES.map((type) => type.id));

/**
 * Returns whether `value` is a built-in antenna type id.
 */
export function isAntennaTypeId(value: unknown): value is AntennaTypeId {
  return typeof value === 'string' && ANTENNA_TYPE_IDS.has(value);
}

/**
 * Looks up a built-in antenna type, or undefined when the id is unknown.
 */
export function antennaTypeById(id: AntennaTypeId | string | undefined): AntennaType | undefined {
  if (!id) {
    return undefined;
  }

  return ANTENNA_TYPES.find((type) => type.id === id);
}

/**
 * True when the operator should enter a heading (not omnidirectional).
 */
export function antennaTypeUsesHeading(type: AntennaType): boolean {
  return type.pattern !== 'omni';
}

/**
 * True for dipoles, inverted-Vs, and HF Yagis — not VHF/UHF beams or omni verticals.
 */
export function antennaTypeSupportsTraps(type: AntennaType): boolean {
  return type.supportsTraps;
}

/**
 * HF / 6 m tags that can sit at an LC trap. 2 m / 70 cm are not trap frequencies here.
 */
export function isHfAntennaBand(bandId: AntennaBandId): boolean {
  return bandId !== '2m' && bandId !== '70cm';
}

/**
 * Catalog order: longest wavelength first.
 */
export function sortAntennaBands(bands: readonly AntennaBandId[]): AntennaBandId[] {
  return ANTENNA_BANDS.map((band) => band.id).filter((id) => bands.includes(id));
}

/**
 * Trap resonant frequencies: every tagged HF band except the lowest (the full-size fundamental).
 *
 * An 80/40 dipole traps at 40 m. A 20/15/10 tribander traps at 15 m and 10 m.
 */
export function trapResonantBands(bands: readonly AntennaBandId[]): AntennaBandId[] {
  const hf = sortAntennaBands(bands).filter(isHfAntennaBand);

  return hf.slice(1);
}

/**
 * True when this installation uses traps on two or more HF bands.
 */
export function antennaIsTrapped(
  type: AntennaType,
  trapped: boolean | undefined,
  bands: readonly AntennaBandId[],
): boolean {
  return type.supportsTraps && trapped === true && trapResonantBands(bands).length > 0;
}

/**
 * When traps are turned on with only one HF band, add the next-lower ham band as the fundamental
 * (40 m → 80/40). If the tag is already 160 m, add 80 m as the trap frequency.
 */
export function bandsForEnabledTraps(bands: readonly AntennaBandId[]): AntennaBandId[] {
  if (trapResonantBands(bands).length > 0) {
    return sortAntennaBands(bands);
  }

  const hfOrder = ANTENNA_BANDS.map((band) => band.id).filter(isHfAntennaBand);
  const present = hfOrder.filter((id) => bands.includes(id));
  const current = present[0] ?? '40m';
  const index = hfOrder.indexOf(current);
  const added = index > 0 ? hfOrder[index - 1] : hfOrder[index + 1];

  if (!added) {
    return sortAntennaBands(bands.length > 0 ? bands : [current]);
  }

  return sortAntennaBands([...bands, current, added]);
}

/**
 * Peak gain with a small catalog derate when traps are in the elements.
 */
export function estimateGainDbi(type: AntennaType, trapped: boolean): number {
  if (!trapped) {
    return type.gainDbi;
  }

  return Math.round((type.gainDbi - TRAP_GAIN_LOSS_DBI) * 100) / 100;
}

/**
 * Compact trap caption, or undefined when traps do not apply.
 */
export function formatTrapSummary(bands: readonly AntennaBandId[]): string | undefined {
  const traps = trapResonantBands(bands);

  if (traps.length === 0) {
    return undefined;
  }

  const labels = traps.map((id) => ANTENNA_BANDS.find((band) => band.id === id)?.label ?? id);

  return `traps at ${labels.join(', ')}`;
}

/**
 * Returns whether `value` is a band an antenna can be tagged with.
 */
export function isAntennaBandId(value: unknown): value is AntennaBandId {
  return typeof value === 'string' && ANTENNA_BAND_IDS.has(value);
}

/**
 * True when every tagged band is VHF/UHF FM (2 m / 70 cm), not HF skywave.
 */
export function antennaBandsAreLineOfSight(bands: readonly AntennaBandId[]): boolean {
  return bands.length > 0 && bands.every((bandId) => bandId === '2m' || bandId === '70cm');
}

/**
 * Approximate free-space wavelength in meters.
 *
 * 70 cm is 0.7 m — do not parse the leading digits of `70cm` as meters.
 */
export function bandWavelengthM(bandId: AntennaBandId): number {
  return ANTENNA_BANDS.find((band) => band.id === bandId)?.wavelengthM ?? Number.parseInt(bandId, 10);
}

/**
 * Heuristic takeoff of the main lobe in degrees, from type and height in wavelengths.
 *
 * This is a catalog rule of thumb for skip rings, not an EZNEC elevation plot.
 */
export function estimateTakeoffDeg(
  type: AntennaType,
  heightAglM: number,
  bandId: AntennaBandId = type.defaultBands[0] ?? '40m',
): number {
  const wavelengths = Math.max(0.1, heightAglM / bandWavelengthM(bandId));

  if (type.takeoff === 'high') {
    return clamp(Math.round(52 - wavelengths * 10), 25, 70);
  }

  if (type.takeoff === 'low') {
    return clamp(Math.round(24 - wavelengths * 8), 6, 25);
  }

  return clamp(Math.round(36 - wavelengths * 12), 10, 45);
}

/**
 * Select items for type menus.
 */
export function antennaTypeSelectItems(): { label: string; value: AntennaTypeId }[] {
  return ANTENNA_TYPES.map((type) => ({
    label: type.label,
    value: type.id,
  }));
}

/**
 * Select items for band menus, including 2 m and 70 cm.
 */
export function antennaBandSelectItems(): { label: string; id: AntennaBandId }[] {
  return ANTENNA_BANDS.map((band) => ({
    label: band.label,
    id: band.id,
  }));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
