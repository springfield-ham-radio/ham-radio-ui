export const DRIVER_DRAFT_STORAGE_KEY = 'ham-radio-driver-draft';

export const DRIVER_PLACEHOLDERS = [
  { value: '$address', label: '$address', description: 'Chunk byte address' },
  { value: '$block', label: '$block', description: 'Chunk index' },
  { value: '$chunkSize', label: '$chunkSize', description: 'Chunk size as one byte' },
  { value: '$length', label: '$length', description: 'Payload length as one byte' },
  { value: '$data', label: '$data', description: 'Chunk payload' },
] as const;

export const DRIVER_PLACEHOLDER_VALUES = DRIVER_PLACEHOLDERS.map((item) => item.value);

export type DriverPlaceholder = (typeof DRIVER_PLACEHOLDERS)[number]['value'];

export type DriverTokenKind = 'hex' | 'ascii' | 'placeholder';

export interface DriverToken {
  id: string;
  kind: DriverTokenKind;
  value: string;
}

export type DriverExpectMode = 'none' | 'exact' | 'bytes' | 'until';

export interface DriverExpectDraft {
  mode: DriverExpectMode;
  tokens: DriverToken[];
  byteCount: string;
  until: DriverToken;
}

export type DriverStepKind = 'exchange' | 'read' | 'write' | 'catRead' | 'catWrite';

export const DRIVER_STEP_KIND_LABELS: Record<DriverStepKind, string> = {
  exchange: 'Exchange',
  read: 'Chunked read',
  write: 'Chunked write',
  catRead: 'CAT read',
  catWrite: 'CAT write',
};

export const DRIVER_READ_STEP_KINDS = ['exchange', 'read', 'catRead'] as const satisfies readonly DriverStepKind[];

export const DRIVER_WRITE_STEP_KINDS = ['exchange', 'write', 'catWrite'] as const satisfies readonly DriverStepKind[];

export interface DriverSkipRange {
  id: string;
  startAddress: string;
  endAddress: string;
}

export interface DriverStepDraft {
  id: string;
  kind: DriverStepKind;
  description: string;
  send: DriverToken[];
  expect: DriverExpectDraft;
  timeout: string;
  delay: string;
  setBaudRate: string;
  segments: string[];
  chunkSize: string;
  skip: DriverSkipRange[];
  includeAck: boolean;
  ackSend: DriverToken[];
  ackExpect: DriverExpectDraft;
  ackTimeout: string;
  includeReady: boolean;
  ready: DriverToken;
  catSegment: string;
  catCount: string;
  catRecordSize: string;
  catPack: 'kenwood-th-f6';
  catIndexWidth: string;
  catEmptyByte: string;
  catTimeout: string;
  catInterCommandDelay: string;
}

export interface DriverSegmentDraft {
  id: string;
  name: string;
  startAddress: string;
  endAddress: string;
}

export type DriverLineLevel = 'omit' | 'on' | 'off';

export interface DriverDraft {
  manufacturer: string;
  model: string;
  name: string;
  version: string;
  description: string;
  memoryRead: boolean;
  memoryWrite: boolean;
  channelProgramming: boolean;
  settingsProgramming: boolean;
  liveControl: boolean;
  settingsSchemaPath: string;
  channelSchemaPath: string;
  memoryMapPath: string;
  baudRate: string;
  dataBits: 5 | 6 | 7 | 8;
  stopBits: 1 | 1.5 | 2;
  parity: 'none' | 'even' | 'odd';
  baudRates: string;
  rtscts: boolean;
  rts: DriverLineLevel;
  dtr: DriverLineLevel;
  chunkSize: string;
  addressSize: string;
  addressEndianness: 'big' | 'little';
  segments: DriverSegmentDraft[];
  readSteps: DriverStepDraft[];
  writeSteps: DriverStepDraft[];
}

export const DRIVER_EDITOR_SECTIONS = ['setup', 'read', 'write'] as const;

/** Speeds offered for the programming port. A radio may accept more than one. */
export const DRIVER_BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200] as const;

/** Parse the comma-separated baud list stored on a draft. */
export function parseDriverBaudRates(raw: string): number[] {
  const rates = raw.split(',').flatMap((part) => {
    const text = part.trim();

    if (!/^\d+$/.test(text)) {
      return [];
    }

    const value = Number.parseInt(text, 10);
    return Number.isSafeInteger(value) && value > 0 ? [value] : [];
  });

  return [...new Set(rates)].sort((left, right) => left - right);
}

/** Store selected baud rates as a comma-separated list. */
export function formatDriverBaudRates(rates: readonly number[]): string {
  return [...new Set(rates)].sort((left, right) => left - right).join(', ');
}

export type DriverEditorSection = (typeof DRIVER_EDITOR_SECTIONS)[number];

const STEP_KINDS = new Set<DriverStepKind>(['exchange', 'read', 'write', 'catRead', 'catWrite']);

/** New id for a form row. */
export function createDriverId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Parse a decimal or 0x-hex integer from a form field.
 * Returns undefined when the text is empty or not an integer.
 */
export function parseDriverInteger(raw: string): number | undefined {
  const text = raw.trim();

  if (/^0x[0-9a-fA-F]+$/i.test(text)) {
    const value = Number.parseInt(text, 16);
    return Number.isSafeInteger(value) ? value : undefined;
  }

  if (/^\d+$/.test(text)) {
    const value = Number.parseInt(text, 10);
    return Number.isSafeInteger(value) ? value : undefined;
  }

  return undefined;
}

/**
 * Parse a radio address from a skip-range field.
 * A 0x prefix or A–F digits are hex. Digits alone are a decimal address from an older draft.
 */
export function parseDriverAddress(raw: string): number | undefined {
  const text = raw.trim();

  if (/^0x[0-9a-fA-F]+$/i.test(text)) {
    const value = Number.parseInt(text.slice(2), 16);
    return Number.isSafeInteger(value) ? value : undefined;
  }

  if (/^[0-9a-fA-F]+$/i.test(text) && /[a-fA-F]/.test(text)) {
    const value = Number.parseInt(text, 16);
    return Number.isSafeInteger(value) ? value : undefined;
  }

  if (/^\d+$/.test(text)) {
    const value = Number.parseInt(text, 10);
    return Number.isSafeInteger(value) ? value : undefined;
  }

  return undefined;
}

/** Format a radio address as 0x plus at least four uppercase hex digits. */
export function formatDriverAddress(value: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(4, '0')}`;
}

/** Store an address as 0x0000. Incomplete text is left as typed. */
export function canonicalizeSkipAddress(raw: string): string {
  const text = raw.trim();

  if (!text) {
    return '';
  }

  const value = parseDriverAddress(text);
  return value === undefined ? text : formatDriverAddress(value);
}

/**
 * Format an address once it looks finished, so a single typed digit does not snap to 0x0000.
 * A 0x prefix, three or more hex digits, or four or more decimal digits counts as finished.
 */
export function formatFinishedDriverAddress(raw: string): string {
  const text = raw.trim();
  const digits = text.replace(/^0x/i, '');
  const finished =
    /^0x[0-9a-fA-F]+$/i.test(text) || (/[a-fA-F]/.test(digits) && digits.length >= 3) || /^\d{4,}$/.test(text);

  return finished ? canonicalizeSkipAddress(text) : raw;
}

export function createDriverToken(kind: DriverTokenKind, value = ''): DriverToken {
  const initial = kind === 'placeholder' ? value || '$address' : value;

  return {
    id: createDriverId(),
    kind,
    value: initial,
  };
}

export function createDriverExpect(): DriverExpectDraft {
  return {
    mode: 'none',
    tokens: [],
    byteCount: '1',
    until: createDriverToken('hex', '0D'),
  };
}

export function createDriverStep(kind: DriverStepKind): DriverStepDraft {
  return {
    id: createDriverId(),
    kind,
    description: '',
    send: [],
    expect: createDriverExpect(),
    timeout: '',
    delay: '',
    setBaudRate: '',
    segments: [],
    chunkSize: '',
    skip: [],
    includeAck: false,
    ackSend: [],
    ackExpect: createDriverExpect(),
    ackTimeout: '',
    includeReady: false,
    ready: createDriverToken('hex', '06'),
    catSegment: '',
    catCount: '1',
    catRecordSize: '16',
    catPack: 'kenwood-th-f6',
    catIndexWidth: '',
    catEmptyByte: '',
    catTimeout: '',
    catInterCommandDelay: '',
  };
}

export function createDriverSegment(name = '', startAddress = '', endAddress = ''): DriverSegmentDraft {
  return {
    id: createDriverId(),
    name,
    startAddress,
    endAddress,
  };
}

/** Blank driver. Identity is empty so validation asks for a name before export looks finished. */
export function createDriverDraft(): DriverDraft {
  return {
    manufacturer: '',
    model: '',
    name: '',
    version: '0.1.0',
    description: '',
    memoryRead: true,
    memoryWrite: true,
    channelProgramming: false,
    settingsProgramming: false,
    liveControl: false,
    settingsSchemaPath: '',
    channelSchemaPath: '',
    memoryMapPath: '',
    baudRate: '9600',
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    baudRates: '',
    rtscts: false,
    rts: 'omit',
    dtr: 'omit',
    chunkSize: '64',
    addressSize: '2',
    addressEndianness: 'big',
    segments: [],
    readSteps: [],
    writeSteps: [],
  };
}

function hexToken(value: string): DriverToken {
  return createDriverToken('hex', value);
}

function asciiToken(value: string): DriverToken {
  return createDriverToken('ascii', value);
}

function placeholderToken(value: DriverPlaceholder): DriverToken {
  return createDriverToken('placeholder', value);
}

function exactExpect(tokens: DriverToken[]): DriverExpectDraft {
  return {
    ...createDriverExpect(),
    mode: 'exact',
    tokens,
  };
}

/**
 * A short clone-style driver that already validates.
 * The bytes are a teaching sample, not a finished radio module.
 */
export function exampleDriverDraft(): DriverDraft {
  const draft = createDriverDraft();
  draft.manufacturer = 'Example';
  draft.model = 'example-radio';
  draft.name = 'Example Radio';
  draft.version = '0.1.0';
  draft.description = 'Sample clone driver. Replace the handshake bytes with the radio you are bringing up.';
  draft.baudRates = '9600';
  draft.channelProgramming = true;
  draft.settingsProgramming = true;
  draft.segments = [
    createDriverSegment('channels', '0x0000', '0x03FF'),
    createDriverSegment('settings', '0x0400', '0x04FF'),
  ];

  const magic = createDriverStep('exchange');
  magic.description = 'Send magic number';
  magic.send = ['50', 'BB', 'FF', '20', '12', '07', '25'].map(hexToken);
  magic.expect = exactExpect([hexToken('06')]);

  const identify = createDriverStep('exchange');
  identify.description = 'Get radio identifier';
  identify.send = [hexToken('02')];
  identify.expect = { ...createDriverExpect(), mode: 'bytes', byteCount: '8' };

  const begin = createDriverStep('exchange');
  begin.description = 'Begin clone operation';
  begin.send = [hexToken('06')];
  begin.expect = exactExpect([hexToken('06')]);

  const read = createDriverStep('read');
  read.description = 'Read memory';
  read.segments = ['channels', 'settings'];
  read.send = [asciiToken('S'), placeholderToken('$address'), placeholderToken('$chunkSize')];
  read.expect = exactExpect([
    asciiToken('X'),
    placeholderToken('$address'),
    placeholderToken('$length'),
    placeholderToken('$data'),
  ]);

  const writeMagic = createDriverStep('exchange');
  writeMagic.description = 'Send magic number';
  writeMagic.send = magic.send.map((token) => ({ ...token, id: createDriverId() }));
  writeMagic.expect = exactExpect([hexToken('06')]);

  const write = createDriverStep('write');
  write.description = 'Write memory';
  write.segments = ['channels', 'settings'];
  write.chunkSize = '16';
  write.delay = '50';
  write.send = [
    asciiToken('X'),
    placeholderToken('$address'),
    placeholderToken('$length'),
    placeholderToken('$data'),
  ];
  write.expect = exactExpect([hexToken('06')]);

  draft.readSteps = [magic, identify, begin, read];
  draft.writeSteps = [writeMagic, write];
  return draft;
}

/** Copy a step with fresh ids so a duplicate does not share form keys with the original. */
export function cloneDriverStep(step: DriverStepDraft): DriverStepDraft {
  const copy = structuredClone(step);
  const retoken = (token: DriverToken): DriverToken => ({ ...token, id: createDriverId() });
  copy.id = createDriverId();
  copy.send = copy.send.map(retoken);
  copy.expect.tokens = copy.expect.tokens.map(retoken);
  copy.expect.until = retoken(copy.expect.until);
  copy.ackSend = copy.ackSend.map(retoken);
  copy.ackExpect.tokens = copy.ackExpect.tokens.map(retoken);
  copy.ackExpect.until = retoken(copy.ackExpect.until);
  copy.ready = retoken(copy.ready);
  copy.skip = copy.skip.map((range) => ({ ...range, id: createDriverId() }));
  return copy;
}

/** List label for a protocol step. */
export function driverStepTitle(step: DriverStepDraft, index: number): string {
  const description = step.description.trim();
  const label = description || DRIVER_STEP_KIND_LABELS[step.kind];
  return `${index + 1}. ${label}`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asDataBits(value: unknown): DriverDraft['dataBits'] {
  if (value === 5 || value === 6 || value === 7 || value === 8) {
    return value;
  }

  return 8;
}

function asStopBits(value: unknown): DriverDraft['stopBits'] {
  if (value === 1 || value === 1.5 || value === 2) {
    return value;
  }

  return 1;
}

function asParity(value: unknown): DriverDraft['parity'] {
  if (value === 'none' || value === 'even' || value === 'odd') {
    return value;
  }

  return 'none';
}

function asLineLevel(value: unknown): DriverLineLevel {
  if (value === 'omit' || value === 'on' || value === 'off') {
    return value;
  }

  return 'omit';
}

function asEndianness(value: unknown): DriverDraft['addressEndianness'] {
  return value === 'little' ? 'little' : 'big';
}

function asTokenKind(value: unknown): DriverTokenKind {
  if (value === 'hex' || value === 'ascii' || value === 'placeholder') {
    return value;
  }

  return 'hex';
}

function coerceToken(value: unknown): DriverToken | undefined {
  const record = asRecord(value);

  if (!record) {
    return undefined;
  }

  return {
    id: asString(record.id) || createDriverId(),
    kind: asTokenKind(record.kind),
    value: asString(record.value),
  };
}

function coerceTokens(value: unknown): DriverToken[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const token = coerceToken(item);
    return token ? [token] : [];
  });
}

function coerceExpect(value: unknown): DriverExpectDraft {
  const fallback = createDriverExpect();
  const record = asRecord(value);

  if (!record) {
    return fallback;
  }

  const mode = record.mode;
  const until = coerceToken(record.until) ?? fallback.until;

  return {
    mode: mode === 'exact' || mode === 'bytes' || mode === 'until' || mode === 'none' ? mode : 'none',
    tokens: coerceTokens(record.tokens),
    byteCount: asString(record.byteCount, '1'),
    until,
  };
}

function coerceSkip(value: unknown): DriverSkipRange[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = asRecord(item);

    if (!record) {
      return [];
    }

    return [
      {
        id: asString(record.id) || createDriverId(),
        startAddress: asString(record.startAddress),
        endAddress: asString(record.endAddress),
      },
    ];
  });
}

function coerceStep(value: unknown): DriverStepDraft | undefined {
  const record = asRecord(value);

  if (!record || typeof record.kind !== 'string' || !STEP_KINDS.has(record.kind as DriverStepKind)) {
    return undefined;
  }

  const fallback = createDriverStep(record.kind as DriverStepKind);
  const ready = coerceToken(record.ready) ?? fallback.ready;

  return {
    ...fallback,
    id: asString(record.id) || createDriverId(),
    description: asString(record.description),
    send: coerceTokens(record.send),
    expect: coerceExpect(record.expect),
    timeout: asString(record.timeout),
    delay: asString(record.delay),
    setBaudRate: asString(record.setBaudRate),
    segments: Array.isArray(record.segments) ? record.segments.filter((item) => typeof item === 'string') : [],
    chunkSize: asString(record.chunkSize),
    skip: coerceSkip(record.skip),
    includeAck: asBoolean(record.includeAck, false),
    ackSend: coerceTokens(record.ackSend),
    ackExpect: coerceExpect(record.ackExpect),
    ackTimeout: asString(record.ackTimeout),
    includeReady: asBoolean(record.includeReady, false),
    ready,
    catSegment: asString(record.catSegment),
    catCount: asString(record.catCount, fallback.catCount),
    catRecordSize: asString(record.catRecordSize, fallback.catRecordSize),
    catPack: 'kenwood-th-f6',
    catIndexWidth: asString(record.catIndexWidth),
    catEmptyByte: asString(record.catEmptyByte),
    catTimeout: asString(record.catTimeout),
    catInterCommandDelay: asString(record.catInterCommandDelay),
  };
}

function coerceSteps(value: unknown): DriverStepDraft[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const step = coerceStep(item);
    return step ? [step] : [];
  });
}

function coerceSegments(value: unknown): DriverSegmentDraft[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = asRecord(item);

    if (!record) {
      return [];
    }

    return [
      {
        id: asString(record.id) || createDriverId(),
        name: asString(record.name),
        startAddress: asString(record.startAddress),
        endAddress: asString(record.endAddress),
      },
    ];
  });
}

function coerceDraftRecord(record: Record<string, unknown>): DriverDraft {
  const fallback = createDriverDraft();

  return {
    ...fallback,
    manufacturer: asString(record.manufacturer),
    model: asString(record.model),
    name: asString(record.name),
    version: asString(record.version, fallback.version),
    description: asString(record.description),
    memoryRead: asBoolean(record.memoryRead, true),
    memoryWrite: asBoolean(record.memoryWrite, true),
    channelProgramming: asBoolean(record.channelProgramming, false),
    settingsProgramming: asBoolean(record.settingsProgramming, false),
    liveControl: asBoolean(record.liveControl, false),
    settingsSchemaPath: asString(record.settingsSchemaPath),
    channelSchemaPath: asString(record.channelSchemaPath),
    memoryMapPath: asString(record.memoryMapPath),
    baudRate: asString(record.baudRate, fallback.baudRate),
    dataBits: asDataBits(record.dataBits),
    stopBits: asStopBits(record.stopBits),
    parity: asParity(record.parity),
    baudRates: asString(record.baudRates),
    rtscts: asBoolean(record.rtscts, false),
    rts: asLineLevel(record.rts),
    dtr: asLineLevel(record.dtr),
    chunkSize: asString(record.chunkSize, fallback.chunkSize),
    addressSize: asString(record.addressSize, fallback.addressSize),
    addressEndianness: asEndianness(record.addressEndianness),
    segments: coerceSegments(record.segments),
    readSteps: coerceSteps(record.readSteps),
    writeSteps: coerceSteps(record.writeSteps),
  };
}

/**
 * Restore a driver draft from stored JSON.
 * A missing or corrupt value becomes a blank draft so the editor can still open.
 */
export function coerceDriverDraft(value: unknown): DriverDraft {
  const record = asRecord(value);

  if (!record) {
    return createDriverDraft();
  }

  const nested = record.version === 1 ? asRecord(record.draft) : record;
  return coerceDraftRecord(nested ?? {});
}

/** Read the in-progress driver from localStorage. */
export function readStoredDriverDraft(): DriverDraft {
  if (typeof localStorage === 'undefined') {
    return createDriverDraft();
  }

  const raw = localStorage.getItem(DRIVER_DRAFT_STORAGE_KEY);

  if (!raw) {
    return createDriverDraft();
  }

  try {
    return coerceDriverDraft(JSON.parse(raw) as unknown);
  } catch {
    return createDriverDraft();
  }
}

/** Persist the in-progress driver. */
export function writeStoredDriverDraft(draft: DriverDraft): void {
  localStorage.setItem(
    DRIVER_DRAFT_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      draft,
    }),
  );
}
