export const KENWOOD_CAT_CR = 0x0d;

export type KenwoodCatDialect = 'fm-mobile' | 'th-f6';

export type KenwoodCatPower = 'high' | 'medium' | 'low';

export interface KenwoodCatReply {
  ok: boolean;
  command: string;
  fields: string[];
  raw: string;
}

const TH_F6_MODES = ['FM', 'WFM', 'AM', 'LSB', 'USB', 'CW'] as const;
const FM_MOBILE_MODES = ['FM'] as const;
const POWER_CODES: KenwoodCatPower[] = ['high', 'medium', 'low'];

/**
 * Pick the Kenwood CAT dialect from a radio model id.
 *
 * TH-F6 is all-mode. TM-V71 / TM-D710 family radios are FM mobiles.
 */
export function kenwoodCatDialectForModel(model: string): KenwoodCatDialect {
  const normalized = model.toLowerCase();

  if (normalized.includes('th-f6') || normalized.includes('thf6')) {
    return 'th-f6';
  }

  return 'fm-mobile';
}

export interface KenwoodCatRadioHint {
  model?: string;
  cat?: {
    protocol?: string;
    dialect?: string;
  };
}

/**
 * Prefer the driver `cat.dialect` when it is a known Kenwood dialect.
 */
export function kenwoodCatDialectForRadio(radio: KenwoodCatRadioHint): KenwoodCatDialect {
  const dialect = radio.cat?.dialect?.trim().toLowerCase();

  if (dialect === 'th-f6' || dialect === 'fm-mobile') {
    return dialect;
  }

  return kenwoodCatDialectForModel(radio.model ?? '');
}

/**
 * Encode a Kenwood CAT line. Fields are comma-separated after a single space.
 */
export function encodeKenwoodCatCommand(command: string, fields: Array<string | number> = []): Uint8Array {
  const name = command.trim().toUpperCase();
  const body = fields.length === 0 ? name : `${name} ${fields.map((field) => String(field)).join(',')}`;

  return Uint8Array.from(Buffer.from(`${body}\r`, 'ascii'));
}

/**
 * Parse a Kenwood CAT reply (CR already stripped). `?` and `N` are errors.
 */
export function parseKenwoodCatReply(line: string): KenwoodCatReply {
  const raw = line.replace(/\r/g, '').replace(/\n/g, '').trim();

  if (raw.length === 0 || raw === '?' || raw === 'N' || raw === 'N?') {
    return {
      ok: false,
      command: '',
      fields: [],
      raw,
    };
  }

  const space = raw.indexOf(' ');
  const command = (space < 0 ? raw : raw.slice(0, space)).toUpperCase();
  const rest = space < 0 ? '' : raw.slice(space + 1).trim();
  const fields = rest.length === 0 ? [] : rest.split(',').map((field) => field.trim());

  return {
    ok: true,
    command,
    fields,
    raw,
  };
}

/**
 * Format Hertz as the 11-digit Kenwood CAT frequency field.
 */
export function formatKenwoodFrequencyHz(frequencyHz: number): string {
  return Math.round(frequencyHz).toString().padStart(11, '0');
}

/**
 * Parse an 11-digit (or similarly padded) Kenwood frequency field as Hertz.
 */
export function parseKenwoodFrequencyHz(field: string): number | undefined {
  const trimmed = field.trim();

  if (!/^\d{9,11}$/.test(trimmed)) {
    return undefined;
  }

  const hertz = Number.parseInt(trimmed, 10);

  if (!Number.isFinite(hertz) || hertz <= 0) {
    return undefined;
  }

  return hertz;
}

export function kenwoodModesForDialect(dialect: KenwoodCatDialect): readonly string[] {
  return dialect === 'th-f6' ? TH_F6_MODES : FM_MOBILE_MODES;
}

export function decodeKenwoodMode(code: number, dialect: KenwoodCatDialect): string {
  const modes = kenwoodModesForDialect(dialect);
  return modes[code] ?? 'FM';
}

export function encodeKenwoodMode(mode: string, dialect: KenwoodCatDialect): number | undefined {
  const normalized = mode.trim().toUpperCase();
  const modes = kenwoodModesForDialect(dialect);
  const index = modes.indexOf(normalized as (typeof modes)[number]);

  return index >= 0 ? index : undefined;
}

export function decodeKenwoodPower(code: number): KenwoodCatPower | undefined {
  return POWER_CODES[code];
}

export function encodeKenwoodPower(power: KenwoodCatPower): number {
  return POWER_CODES.indexOf(power);
}
