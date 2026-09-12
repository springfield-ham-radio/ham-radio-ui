export const KENWOOD_CAT_CR = 0x0d;
export const KENWOOD_VFO_CHANNEL_FIELDS = 13;

export interface KenwoodCatReply {
  ok: boolean;
  command: string;
  fields: string[];
  raw: string;
}

export interface KenwoodFoChannel {
  fields: string[];
  band: 0 | 1;
  frequencyHz: number;
  mode: string;
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
 * Format Hertz as a Kenwood CAT frequency field.
 */
export function formatKenwoodFrequencyHz(frequencyHz: number, width = 11): string {
  return Math.round(frequencyHz).toString().padStart(width, '0');
}

/**
 * Parse a padded Kenwood frequency field as Hertz.
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

function asBand(value: number): 0 | 1 {
  return value === 1 ? 1 : 0;
}

/**
 * Parse a Kenwood `FO n` VFO-channel reply.
 */
export function parseKenwoodFoReply(reply: KenwoodCatReply, modes: readonly string[]): KenwoodFoChannel {
  if (reply.fields.length < KENWOOD_VFO_CHANNEL_FIELDS) {
    throw new Error('Radio did not return a VFO channel');
  }

  const frequencyHz = parseKenwoodFrequencyHz(reply.fields[1] ?? '');

  if (frequencyHz === undefined) {
    throw new Error('Radio did not return a frequency');
  }

  const band = asBand(Number.parseInt(reply.fields[0] ?? '0', 10));
  const modeCode = Number.parseInt(reply.fields[12] ?? '0', 10);
  const mode = modes[Number.isFinite(modeCode) ? modeCode : 0] ?? modes[0] ?? 'FM';

  return {
    fields: reply.fields.slice(0, KENWOOD_VFO_CHANNEL_FIELDS),
    band,
    frequencyHz,
    mode,
  };
}

export function kenwoodFoWithFrequency(channel: KenwoodFoChannel, frequencyHz: number, width: number): string[] {
  const digits = Math.max(channel.fields[1]?.length ?? 0, width);
  const fields = [...channel.fields];
  fields[1] = formatKenwoodFrequencyHz(frequencyHz, digits);
  return fields;
}

export function kenwoodFoWithMode(channel: KenwoodFoChannel, modeCode: number): string[] {
  const fields = [...channel.fields];
  fields[12] = String(modeCode);
  return fields;
}
