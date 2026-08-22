import { RadioModelId, type RadioId } from '@springfield/ham-radio-api';

export const RADIO_MEMORY_FILE_KIND = 'springfield-ham-radio-memory';
export const RADIO_MEMORY_FILE_VERSION = 1;

export interface ParsedRadioMemoryFile {
  radioId: RadioId;
  contents: Uint8Array;
}

/**
 * Serialize a radio memory image to a JSON document.
 *
 * Contents are stored as uppercase hex so the file stays text-only and easy to inspect.
 */
export function serializeRadioMemoryFile(radioId: RadioId, contents: Uint8Array): string {
  if (contents.length === 0) {
    throw new Error('Memory is empty');
  }

  const document = {
    kind: RADIO_MEMORY_FILE_KIND,
    version: RADIO_MEMORY_FILE_VERSION,
    radioId: {
      model: String(radioId.model),
      name: radioId.name,
      manufacturer: radioId.manufacturer,
    },
    contents: bytesToHex(contents),
  };

  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * Parse a radio memory JSON document produced by {@link serializeRadioMemoryFile}.
 */
export function parseRadioMemoryFile(text: string): ParsedRadioMemoryFile {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Memory file is not valid JSON');
  }

  if (!isRecord(parsed) || parsed.kind !== RADIO_MEMORY_FILE_KIND) {
    throw new Error('File is not a radio memory file');
  }

  if (parsed.version !== RADIO_MEMORY_FILE_VERSION) {
    throw new Error(`Unsupported radio memory file version: ${String(parsed.version)}`);
  }

  return {
    radioId: parseRadioId(parsed.radioId),
    contents: hexToBytes(parsed.contents),
  };
}

/**
 * Suggested file name when saving a memory image for a radio.
 */
export function defaultMemoryFileName(radioId: RadioId): string {
  return `${String(radioId.model)}.json`;
}

function parseRadioId(value: unknown): RadioId {
  if (!isRecord(value) || typeof value.model !== 'string' || typeof value.name !== 'string' || typeof value.manufacturer !== 'string') {
    throw new Error('Memory file is missing radio identity');
  }

  if (value.model.length === 0 || value.name.length === 0 || value.manufacturer.length === 0) {
    throw new Error('Memory file is missing radio identity');
  }

  return {
    model: RadioModelId(value.model),
    name: value.name,
    manufacturer: value.manufacturer,
  };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function hexToBytes(value: unknown): Uint8Array {
  if (typeof value !== 'string') {
    throw new Error('Memory file contents must be a hex string');
  }

  const normalized = value.replace(/\s+/g, '');

  if (normalized.length === 0) {
    throw new Error('Memory is empty');
  }

  if (normalized.length % 2 !== 0) {
    throw new Error('Memory file contents must contain an even number of hex digits');
  }

  if (!/^[0-9A-Fa-f]+$/.test(normalized)) {
    throw new Error('Memory file contents must be hex');
  }

  const bytes = new Uint8Array(normalized.length / 2);

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }

  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
