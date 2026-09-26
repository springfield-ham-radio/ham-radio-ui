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

/** Channel JSON Schema edited on the Channel tab. Frequencies are hertz. */
export interface DriverChannelSchemaDraft {
  includeName: boolean;
  nameMaxLength: string;
  receiveMinimum: string;
  receiveMaximum: string;
  transmitMinimum: string;
  transmitMaximum: string;
  includeReceiveTone: boolean;
  includeTransmitTone: boolean;
  ctcssMinimum: string;
  ctcssMaximum: string;
  dcsPattern: string;
}

export const DRIVER_MEMORY_FIELD_TYPES = ['u8', 'u16', 'u32', 'bits', 'char'] as const;

export const DRIVER_MEMORY_FIELD_KINDS = [
  'integer',
  'boolean',
  'enum',
  'ascii',
  'digits',
  'dtmf',
  'bbcd',
  'lbcd',
  'tone',
  'ctcss-index',
  'dcs-index',
] as const;

export const DRIVER_MEMORY_WIDGETS = ['integer', 'select', 'switch', 'text', 'number'] as const;

export type DriverMemoryFieldType = (typeof DRIVER_MEMORY_FIELD_TYPES)[number];

export type DriverMemoryFieldKind = (typeof DRIVER_MEMORY_FIELD_KINDS)[number];

export type DriverMemoryWidget = (typeof DRIVER_MEMORY_WIDGETS)[number];

/** One field in a memory-map struct. Kind-specific text is ignored when the kind does not use it. */
export interface DriverMemoryFieldDraft {
  id: string;
  fieldId: string;
  type: DriverMemoryFieldType;
  width: string;
  reserved: boolean;
  kind: DriverMemoryFieldKind;
  length: string;
  scale: string;
  minimum: string;
  maximum: string;
  values: string;
  pad: string;
  charset: string;
  ctcssMinimum: string;
  reverseOffset: string;
  /** When true, the Settings screen shows this field. */
  showUi: boolean;
  uiGroup: string;
  uiSubgroup: string;
  uiLabel: string;
  uiWidget: DriverMemoryWidget;
  uiDescription: string;
  uiMenuNumber: string;
  uiMenuCode: string;
  uiWritable: boolean;
  uiOrder: string;
}

/** A headed section inside a settings group. */
export interface DriverMemorySubgroupDraft {
  id: string;
  subgroupId: string;
  label: string;
  description: string;
}

/** A left-nav group on the Settings screen. */
export interface DriverMemoryGroupDraft {
  id: string;
  groupId: string;
  label: string;
  description: string;
  icon: string;
  warningTitle: string;
  warningDescription: string;
  subgroups: DriverMemorySubgroupDraft[];
}

/** A repeated or single struct in the channel half of a memory map. */
export interface DriverMemoryStructDraft {
  id: string;
  structId: string;
  seek: string;
  count: string;
  stride: string;
  groupSize: string;
  groupPad: string;
  emptyEquals: string;
  clearEmpty: boolean;
  fields: DriverMemoryFieldDraft[];
}

/**
 * Memory map edited on the Memory tab.
 * Bindings and structs place channel fields. Groups are the Settings screen.
 */
export interface DriverMemoryMapDraft {
  version: string;
  description: string;
  records: string;
  names: string;
  nameField: string;
  receiveFrequency: string;
  transmitFrequency: string;
  receiveTone: string;
  transmitTone: string;
  extras: string;
  groups: DriverMemoryGroupDraft[];
  structs: DriverMemoryStructDraft[];
}

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
  channelSchema: DriverChannelSchemaDraft;
  memoryMap: DriverMemoryMapDraft;
}

export const DRIVER_EDITOR_SECTIONS = ['setup', 'channel', 'memory', 'read', 'write'] as const;

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

/** Starting channel schema: a short name, a VHF frequency window, and CTCSS or DCS tones. */
export function createChannelSchemaDraft(): DriverChannelSchemaDraft {
  return {
    includeName: true,
    nameMaxLength: '7',
    receiveMinimum: '136000000',
    receiveMaximum: '174000000',
    transmitMinimum: '136000000',
    transmitMaximum: '174000000',
    includeReceiveTone: true,
    includeTransmitTone: true,
    ctcssMinimum: '67',
    ctcssMaximum: '254.1',
    dcsPattern: '^D[0-9]{3}[N|I]$',
  };
}

/** DCS codes for a UV-5R tone word, in radio order. */
export const DRIVER_UV5R_DCS_CODES = [
  23, 25, 26, 31, 32, 36, 43, 47, 51, 53, 54, 65, 71, 72, 73, 74, 114, 115, 116, 122, 125, 131, 132, 134, 143, 145, 152,
  155, 156, 162, 165, 172, 174, 205, 212, 223, 225, 226, 243, 244, 245, 246, 251, 252, 255, 261, 263, 265, 266, 271, 274,
  306, 311, 315, 325, 331, 332, 343, 346, 351, 356, 364, 365, 371, 411, 412, 413, 423, 431, 432, 445, 446, 452, 454, 455,
  462, 464, 465, 466, 503, 506, 516, 523, 526, 532, 546, 565, 606, 612, 624, 627, 631, 632, 645, 654, 662, 664, 703, 712,
  723, 731, 732, 734, 743, 754,
].join(', ');

/** True when the field is edited under a declared Settings group. */
export function memoryFieldInSettingsGroup(field: DriverMemoryFieldDraft, groupIds: ReadonlySet<string>): boolean {
  const groupId = field.uiGroup.trim();
  return field.showUi && groupId.length > 0 && groupIds.has(groupId);
}

export function createMemoryField(partial: Partial<Omit<DriverMemoryFieldDraft, 'id'>> = {}): DriverMemoryFieldDraft {
  return {
    id: createDriverId(),
    fieldId: '',
    type: 'u8',
    width: '',
    reserved: false,
    kind: 'integer',
    length: '',
    scale: '',
    minimum: '',
    maximum: '',
    values: '',
    pad: '',
    charset: '',
    ctcssMinimum: '',
    reverseOffset: '',
    showUi: false,
    uiGroup: '',
    uiSubgroup: '',
    uiLabel: '',
    uiWidget: 'integer',
    uiDescription: '',
    uiMenuNumber: '',
    uiMenuCode: '',
    uiWritable: true,
    uiOrder: '',
    ...partial,
  };
}

export function createMemorySubgroup(partial: Partial<Omit<DriverMemorySubgroupDraft, 'id'>> = {}): DriverMemorySubgroupDraft {
  return {
    id: createDriverId(),
    subgroupId: '',
    label: '',
    description: '',
    ...partial,
  };
}

export function createMemoryGroup(
  partial: Partial<Omit<DriverMemoryGroupDraft, 'id' | 'subgroups'>> & { subgroups?: DriverMemorySubgroupDraft[] } = {},
): DriverMemoryGroupDraft {
  const { subgroups, ...rest } = partial;

  return {
    id: createDriverId(),
    groupId: '',
    label: '',
    description: '',
    icon: '',
    warningTitle: '',
    warningDescription: '',
    ...rest,
    subgroups: subgroups ?? [],
  };
}

export function createMemoryStruct(partial: Partial<Omit<DriverMemoryStructDraft, 'id' | 'fields'>> & { fields?: DriverMemoryFieldDraft[] } = {}): DriverMemoryStructDraft {
  const { fields, ...rest } = partial;

  return {
    id: createDriverId(),
    structId: '',
    seek: '',
    count: '',
    stride: '',
    groupSize: '',
    groupPad: '',
    emptyEquals: '',
    clearEmpty: false,
    ...rest,
    fields: fields ?? [createMemoryField()],
  };
}

/** Starting map: UV-5R channel records at 0x0000, names at 0x1000, and a squelch setting. */
export function createMemoryMapDraft(): DriverMemoryMapDraft {
  return {
    version: '1.0.0',
    description: 'Channel records, names, and settings',
    records: 'channels',
    names: 'names',
    nameField: 'name',
    receiveFrequency: 'rxfreq',
    transmitFrequency: 'txfreq',
    receiveTone: 'rxtone',
    transmitTone: 'txtone',
    extras: '',
    groups: [
      createMemoryGroup({
        groupId: 'basic',
        label: 'Basic',
        icon: 'i-lucide-sliders-horizontal',
        subgroups: [createMemorySubgroup({ subgroupId: 'receive', label: 'Receive' })],
      }),
    ],
    structs: [
      createMemoryStruct({
        structId: 'channels',
        seek: '0x0000',
        count: '128',
        stride: '16',
        emptyEquals: '0xFF',
        clearEmpty: true,
        fields: [
          createMemoryField({ fieldId: 'rxfreq', kind: 'lbcd', length: '4', scale: '10' }),
          createMemoryField({ fieldId: 'txfreq', kind: 'lbcd', length: '4', scale: '10' }),
          createMemoryField({
            fieldId: 'rxtone',
            type: 'u16',
            kind: 'tone',
            values: DRIVER_UV5R_DCS_CODES,
            ctcssMinimum: '600',
            reverseOffset: '105',
          }),
          createMemoryField({
            fieldId: 'txtone',
            type: 'u16',
            kind: 'tone',
            values: DRIVER_UV5R_DCS_CODES,
            ctcssMinimum: '600',
            reverseOffset: '105',
          }),
        ],
      }),
      createMemoryStruct({
        structId: 'names',
        seek: '0x1000',
        count: '128',
        stride: '16',
        emptyEquals: '0xFF',
        clearEmpty: true,
        fields: [
          createMemoryField({ fieldId: 'name', kind: 'ascii', length: '7' }),
          createMemoryField({ fieldId: '_pad', kind: 'ascii', length: '9', reserved: true }),
        ],
      }),
      createMemoryStruct({
        structId: 'settings',
        seek: '0x0E20',
        fields: [
          createMemoryField({
            fieldId: 'squelch',
            kind: 'integer',
            minimum: '0',
            maximum: '9',
            showUi: true,
            uiGroup: 'basic',
            uiSubgroup: 'receive',
            uiLabel: 'Carrier Squelch Level',
            uiWidget: 'integer',
            uiDescription: 'How strong a received signal must be before the speaker opens.',
            uiMenuNumber: '0',
            uiMenuCode: 'SQL',
          }),
        ],
      }),
    ],
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
    channelSchema: createChannelSchemaDraft(),
    memoryMap: createMemoryMapDraft(),
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

function asMemoryFieldType(value: unknown): DriverMemoryFieldType {
  if (typeof value === 'string' && (DRIVER_MEMORY_FIELD_TYPES as readonly string[]).includes(value)) {
    return value as DriverMemoryFieldType;
  }

  return 'u8';
}

function asMemoryFieldKind(value: unknown): DriverMemoryFieldKind {
  if (typeof value === 'string' && (DRIVER_MEMORY_FIELD_KINDS as readonly string[]).includes(value)) {
    return value as DriverMemoryFieldKind;
  }

  return 'integer';
}

function asMemoryWidget(value: unknown): DriverMemoryWidget {
  if (typeof value === 'string' && (DRIVER_MEMORY_WIDGETS as readonly string[]).includes(value)) {
    return value as DriverMemoryWidget;
  }

  return 'integer';
}

function coerceMemoryFields(value: unknown): DriverMemoryFieldDraft[] {
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
        fieldId: asString(record.fieldId),
        type: asMemoryFieldType(record.type),
        width: asString(record.width),
        reserved: asBoolean(record.reserved, false),
        kind: asMemoryFieldKind(record.kind),
        length: asString(record.length),
        scale: asString(record.scale),
        minimum: asString(record.minimum),
        maximum: asString(record.maximum),
        values: asString(record.values),
        pad: asString(record.pad),
        charset: asString(record.charset),
        ctcssMinimum: asString(record.ctcssMinimum),
        reverseOffset: asString(record.reverseOffset),
        showUi: asBoolean(record.showUi, false),
        uiGroup: asString(record.uiGroup),
        uiSubgroup: asString(record.uiSubgroup),
        uiLabel: asString(record.uiLabel),
        uiWidget: asMemoryWidget(record.uiWidget),
        uiDescription: asString(record.uiDescription),
        uiMenuNumber: asString(record.uiMenuNumber),
        uiMenuCode: asString(record.uiMenuCode),
        uiWritable: asBoolean(record.uiWritable, true),
        uiOrder: asString(record.uiOrder),
      },
    ];
  });
}

function coerceMemorySubgroups(value: unknown): DriverMemorySubgroupDraft[] {
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
        subgroupId: asString(record.subgroupId),
        label: asString(record.label),
        description: asString(record.description),
      },
    ];
  });
}

function coerceMemoryGroups(value: unknown): DriverMemoryGroupDraft[] {
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
        groupId: asString(record.groupId),
        label: asString(record.label),
        description: asString(record.description),
        icon: asString(record.icon),
        warningTitle: asString(record.warningTitle),
        warningDescription: asString(record.warningDescription),
        subgroups: coerceMemorySubgroups(record.subgroups),
      },
    ];
  });
}

function coerceMemoryStructs(value: unknown): DriverMemoryStructDraft[] {
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
        structId: asString(record.structId),
        seek: asString(record.seek),
        count: asString(record.count),
        stride: asString(record.stride),
        groupSize: asString(record.groupSize),
        groupPad: asString(record.groupPad),
        emptyEquals: asString(record.emptyEquals),
        clearEmpty: asBoolean(record.clearEmpty, false),
        fields: coerceMemoryFields(record.fields),
      },
    ];
  });
}

function coerceMemoryMap(value: unknown): DriverMemoryMapDraft {
  const fallback = createMemoryMapDraft();
  const record = asRecord(value);

  if (!record) {
    return fallback;
  }

  return {
    version: asString(record.version, fallback.version),
    description: asString(record.description, fallback.description),
    records: asString(record.records, fallback.records),
    names: asString(record.names, fallback.names),
    nameField: asString(record.nameField, fallback.nameField),
    receiveFrequency: asString(record.receiveFrequency, fallback.receiveFrequency),
    transmitFrequency: asString(record.transmitFrequency, fallback.transmitFrequency),
    receiveTone: asString(record.receiveTone, fallback.receiveTone),
    transmitTone: asString(record.transmitTone, fallback.transmitTone),
    extras: asString(record.extras),
    groups: record.groups === undefined ? [] : coerceMemoryGroups(record.groups),
    structs: record.structs === undefined ? fallback.structs : coerceMemoryStructs(record.structs),
  };
}

function coerceChannelSchema(value: unknown): DriverChannelSchemaDraft {
  const fallback = createChannelSchemaDraft();
  const record = asRecord(value);

  if (!record) {
    return fallback;
  }

  return {
    includeName: asBoolean(record.includeName, fallback.includeName),
    nameMaxLength: asString(record.nameMaxLength, fallback.nameMaxLength),
    receiveMinimum: asString(record.receiveMinimum, fallback.receiveMinimum),
    receiveMaximum: asString(record.receiveMaximum, fallback.receiveMaximum),
    transmitMinimum: asString(record.transmitMinimum, fallback.transmitMinimum),
    transmitMaximum: asString(record.transmitMaximum, fallback.transmitMaximum),
    includeReceiveTone: asBoolean(record.includeReceiveTone, fallback.includeReceiveTone),
    includeTransmitTone: asBoolean(record.includeTransmitTone, fallback.includeTransmitTone),
    ctcssMinimum: asString(record.ctcssMinimum, fallback.ctcssMinimum),
    ctcssMaximum: asString(record.ctcssMaximum, fallback.ctcssMaximum),
    dcsPattern: asString(record.dcsPattern, fallback.dcsPattern),
  };
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
    channelSchema: coerceChannelSchema(record.channelSchema),
    memoryMap: coerceMemoryMap(record.memoryMap),
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
