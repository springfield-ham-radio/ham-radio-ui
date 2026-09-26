import type {
  RadioByteToken,
  RadioExchange,
  RadioExpect,
  RadioMemoryConfig,
  RadioProtocolStep,
  RadioSerialConfig,
} from '@springfield/ham-radio-api';
import { formatByteToken, formatExpect, formatSerialSummary } from './protocol-display';
import {
  DRIVER_PLACEHOLDER_VALUES,
  DRIVER_READ_STEP_KINDS,
  DRIVER_WRITE_STEP_KINDS,
  formatDriverAddress,
  parseDriverAddress,
  parseDriverInteger,
  type DriverDraft,
  type DriverExpectDraft,
  type DriverPlaceholder,
  type DriverStepDraft,
  type DriverStepKind,
  type DriverToken,
} from './driver-draft';

export interface DriverIssue {
  level: 'error' | 'warning';
  path: string;
  message: string;
}

export interface CompiledDriverStep {
  id: string;
  step?: RadioProtocolStep;
  issues: DriverIssue[];
}

export interface DriverModuleDocument {
  id: {
    model: string;
    name: string;
    manufacturer: string;
  };
  version: string;
  description: string;
  capabilities: {
    memoryRead: boolean;
    memoryWrite: boolean;
    channelProgramming: boolean;
    settingsProgramming: boolean;
    liveControl: boolean;
  };
  serialConfig: RadioSerialConfig;
  memoryConfig: RadioMemoryConfig;
  readMemory: RadioProtocolStep[];
  writeMemory: RadioProtocolStep[];
  settingsSchema?: {
    model: string;
    settingsSchema: { $ref: string };
    channelSchema: { $ref: string };
  };
  memoryMap?: { $ref: string };
  codec?: { type: 'memoryMap' };
}

export interface CompiledDriver {
  document: DriverModuleDocument;
  json: string;
  issues: DriverIssue[];
  read: CompiledDriverStep[];
  write: CompiledDriverStep[];
  memoryConfig?: RadioMemoryConfig;
  serialSummary?: string;
  errorCount: number;
  warningCount: number;
}

const MODEL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const SEGMENT_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const JSON_PATH = /^[^\\:*?"<>|\s]+\.json$/;

function isPlaceholder(value: string): value is DriverPlaceholder {
  return (DRIVER_PLACEHOLDER_VALUES as readonly string[]).includes(value);
}

/** First error message for a form field path. */
export function driverFieldError(issues: DriverIssue[], path: string): string | undefined {
  return issues.find((issue) => issue.level === 'error' && issue.path === path)?.message;
}

/** Issues whose path is the prefix or a child of it. */
export function driverIssuesUnder(issues: DriverIssue[], prefix: string): DriverIssue[] {
  return issues.filter((issue) => issue.path === prefix || issue.path.startsWith(`${prefix}.`));
}

function compileToken(token: DriverToken, path: string, issues: DriverIssue[]): RadioByteToken | undefined {
  if (token.kind === 'placeholder') {
    if (!isPlaceholder(token.value)) {
      issues.push({ level: 'error', path, message: 'Choose a placeholder.' });
      return undefined;
    }

    return token.value;
  }

  if (token.kind === 'ascii') {
    if (token.value.length !== 1) {
      issues.push({ level: 'error', path, message: 'Enter one ASCII character.' });
      return undefined;
    }

    const code = token.value.charCodeAt(0);

    if (code < 0x20 || code > 0x7e) {
      issues.push({ level: 'error', path, message: 'Use a printable ASCII character.' });
      return undefined;
    }

    return token.value;
  }

  const hex = token.value.trim().replace(/^0x/i, '');

  if (!/^[0-9a-fA-F]{1,2}$/.test(hex)) {
    issues.push({ level: 'error', path, message: 'Enter a hex byte from 00 to FF.' });
    return undefined;
  }

  return `0x${hex.padStart(2, '0').toUpperCase()}`;
}

function compileTokenList(tokens: DriverToken[], path: string, issues: DriverIssue[]): RadioByteToken[] {
  return tokens.flatMap((token) => {
    const compiled = compileToken(token, `${path}.${token.id}`, issues);
    return compiled === undefined ? [] : [compiled];
  });
}

function compileExpect(
  expect: DriverExpectDraft,
  path: string,
  issues: DriverIssue[],
): RadioExpect | undefined {
  if (expect.mode === 'none') {
    return undefined;
  }

  if (expect.mode === 'bytes') {
    const count = parseDriverInteger(expect.byteCount);

    if (count === undefined || count < 1) {
      issues.push({ level: 'error', path, message: 'Enter how many bytes to wait for.' });
      return undefined;
    }

    return { bytes: count };
  }

  if (expect.mode === 'until') {
    const until = compileToken(expect.until, `${path}.until`, issues);

    if (until === undefined) {
      return undefined;
    }

    return { until };
  }

  const tokens = compileTokenList(expect.tokens, path, issues);

  if (expect.tokens.length === 0) {
    issues.push({ level: 'error', path, message: 'Add the bytes the radio must match.' });
    return undefined;
  }

  if (tokens.length === 1 && expect.tokens.length === 1) {
    return tokens[0];
  }

  return tokens;
}

function compileOptionalCount(raw: string, path: string, issues: DriverIssue[], label: string): number | undefined {
  if (!raw.trim()) {
    return undefined;
  }

  const value = parseDriverInteger(raw);

  if (value === undefined || value < 0) {
    issues.push({ level: 'error', path, message: `${label} must be a whole number.` });
    return undefined;
  }

  return value;
}

function compilePositive(raw: string, path: string, issues: DriverIssue[], label: string): number | undefined {
  if (!raw.trim()) {
    return undefined;
  }

  const value = parseDriverInteger(raw);

  if (value === undefined || value < 1) {
    issues.push({ level: 'error', path, message: `${label} must be 1 or more.` });
    return undefined;
  }

  return value;
}

function kindAllowed(kind: DriverStepKind, side: 'read' | 'write'): boolean {
  const allowed = side === 'read' ? DRIVER_READ_STEP_KINDS : DRIVER_WRITE_STEP_KINDS;
  return (allowed as readonly string[]).includes(kind);
}

function compileExchange(
  step: DriverStepDraft,
  path: string,
  issues: DriverIssue[],
  send: RadioByteToken[],
  expect: RadioExpect | undefined,
): RadioExchange | undefined {
  const exchange: RadioExchange = {};
  const description = step.description.trim();

  if (description) {
    exchange.description = description;
  }

  if (send.length > 0) {
    exchange.send = send;
  }

  if (expect !== undefined) {
    exchange.expect = expect;
  }

  const baud = compilePositive(step.setBaudRate, `${path}.setBaudRate`, issues, 'Baud rate');

  if (baud !== undefined) {
    exchange.setBaudRate = baud;
  }

  const delay = compileOptionalCount(step.delay, `${path}.delay`, issues, 'Delay');

  if (delay !== undefined) {
    exchange.delay = delay;
  }

  const timeout = compilePositive(step.timeout, `${path}.timeout`, issues, 'Timeout');

  if (timeout !== undefined) {
    exchange.timeout = timeout;
  }

  if (exchange.send === undefined && exchange.expect === undefined && exchange.setBaudRate === undefined) {
    issues.push({
      level: 'error',
      path,
      message: 'Add bytes to send, a reply to wait for, or a baud-rate change.',
    });
    return undefined;
  }

  return exchange;
}

function compileSegments(step: DriverStepDraft, path: string, known: Set<string>, issues: DriverIssue[]): string[] {
  if (step.segments.length === 0) {
    issues.push({ level: 'error', path: `${path}.segments`, message: 'Choose at least one memory segment.' });
    return [];
  }

  const missing = step.segments.filter((name) => !known.has(name));

  if (missing.length > 0) {
    issues.push({
      level: 'error',
      path: `${path}.segments`,
      message: `Unknown segment ${missing.join(', ')}. Add it on the Memory tab.`,
    });
  }

  return step.segments.filter((name) => known.has(name));
}

function compileStep(
  step: DriverStepDraft,
  side: 'read' | 'write',
  knownSegments: Set<string>,
  chunkSize: number | undefined,
): CompiledDriverStep {
  const path = `${side}.${step.id}`;
  const issues: DriverIssue[] = [];

  if (!kindAllowed(step.kind, side)) {
    issues.push({
      level: 'error',
      path,
      message:
        side === 'read'
          ? 'Move chunked writes and CAT writes to the Write protocol.'
          : 'Move chunked reads and CAT reads to the Read protocol.',
    });
    return { id: step.id, issues };
  }

  const send = compileTokenList(step.send, `${path}.send`, issues);
  const expect = compileExpect(step.expect, `${path}.expect`, issues);

  if (step.kind === 'exchange') {
    const exchange = compileExchange(step, path, issues, send, expect);
    return { id: step.id, step: hasStepErrors(issues) ? undefined : exchange, issues };
  }

  if (step.kind === 'catRead' || step.kind === 'catWrite') {
    const segment = step.catSegment.trim();

    if (!segment || !knownSegments.has(segment)) {
      issues.push({ level: 'error', path: `${path}.catSegment`, message: 'Choose a memory segment for the channel records.' });
    }

    const count = parseDriverInteger(step.catCount);
    const recordSize = parseDriverInteger(step.catRecordSize);

    if (count === undefined || count < 1) {
      issues.push({ level: 'error', path: `${path}.catCount`, message: 'Enter how many channels to transfer.' });
    }

    if (recordSize === undefined || recordSize < 1) {
      issues.push({ level: 'error', path: `${path}.catRecordSize`, message: 'Enter the bytes per channel.' });
    }

    if (issues.some((issue) => issue.level === 'error') || count === undefined || recordSize === undefined || !segment) {
      return { id: step.id, issues };
    }

    const cat = {
      segment,
      count,
      recordSize,
      pack: step.catPack,
    } as const;

    const indexWidth = compilePositive(step.catIndexWidth, `${path}.catIndexWidth`, issues, 'Index width');
    const emptyByte = compileOptionalCount(step.catEmptyByte, `${path}.catEmptyByte`, issues, 'Empty byte');
    const timeout = compilePositive(step.catTimeout, `${path}.catTimeout`, issues, 'Timeout');
    const delay = compileOptionalCount(step.catInterCommandDelay, `${path}.catInterCommandDelay`, issues, 'Command delay');

    if (emptyByte !== undefined && emptyByte > 255) {
      issues.push({ level: 'error', path: `${path}.catEmptyByte`, message: 'Empty byte must be 0–255.' });
    }

    if (hasStepErrors(issues)) {
      return { id: step.id, issues };
    }

    const config = {
      ...cat,
      ...(indexWidth !== undefined ? { indexWidth } : {}),
      ...(emptyByte !== undefined ? { emptyByte } : {}),
      ...(timeout !== undefined ? { timeout } : {}),
      ...(delay !== undefined ? { interCommandDelayMs: delay } : {}),
    };

    const description = step.description.trim();
    const compiled =
      step.kind === 'catRead'
        ? { ...(description ? { description } : {}), catRead: config }
        : { ...(description ? { description } : {}), catWrite: config };

    return { id: step.id, step: compiled, issues };
  }

  const segments = compileSegments(step, path, knownSegments, issues);

  if (step.send.length === 0) {
    issues.push({ level: 'error', path: `${path}.send`, message: 'Add the bytes sent for each chunk.' });
  }

  if (step.expect.mode === 'none') {
    issues.push({ level: 'error', path: `${path}.expect`, message: 'Say what the radio sends back for each chunk.' });
  }

  if (segments.length === 0 || send.length === 0 || expect === undefined) {
    return { id: step.id, issues };
  }

  const timeout = compilePositive(step.timeout, `${path}.timeout`, issues, 'Timeout');
  const delay = compileOptionalCount(step.delay, `${path}.delay`, issues, 'Delay');
  const description = step.description.trim();

  if (step.kind === 'read') {
    if (!tokensInclude(expect, '$data')) {
      issues.push({
        level: 'warning',
        path: `${path}.expect`,
        message: 'The reply does not contain $data, so this read will not fill the memory image.',
      });
    }

    const read: RadioProtocolStep = {
      ...(description ? { description } : {}),
      read: {
        segments,
        send,
        expect,
        ...(timeout !== undefined ? { timeout } : {}),
        ...(delay !== undefined ? { delay } : {}),
      },
    };

    if (step.includeAck) {
      const ack = compileExchange(
        {
          ...step,
          description: '',
          send: step.ackSend,
          expect: step.ackExpect,
          setBaudRate: '',
          delay: '',
          timeout: step.ackTimeout,
        },
        `${path}.ack`,
        issues,
        compileTokenList(step.ackSend, `${path}.ack.send`, issues),
        compileExpect(step.ackExpect, `${path}.ack.expect`, issues),
      );

      if (ack && 'read' in read) {
        read.read.ack = ack;
      }
    }

    if (step.includeReady && 'read' in read) {
      const ready = compileToken(step.ready, `${path}.ready`, issues);

      if (ready !== undefined) {
        read.read.ready = ready;
      }
    }

    return { id: step.id, step: hasStepErrors(issues) ? undefined : read, issues };
  }

  if (!tokensInclude(send, '$data')) {
    issues.push({
      level: 'warning',
      path: `${path}.send`,
      message: 'The upload does not contain $data, so the memory image will not be sent.',
    });
  }

  const writeChunk = compilePositive(step.chunkSize, `${path}.chunkSize`, issues, 'Chunk size');
  const skip = step.skip.flatMap((range) => {
    const start = parseDriverAddress(range.startAddress);
    const end = parseDriverAddress(range.endAddress);
    const rangePath = `${path}.skip.${range.id}`;

    if (start === undefined || end === undefined) {
      issues.push({ level: 'error', path: rangePath, message: 'Skip ranges need a start and end address.' });
      return [];
    }

    if (end < start) {
      issues.push({ level: 'error', path: rangePath, message: 'Skip end address is before the start.' });
      return [];
    }

    return [{ startAddress: start, endAddress: end }];
  });

  if (chunkSize === undefined && writeChunk === undefined) {
    issues.push({
      level: 'error',
      path: `${path}.chunkSize`,
      message: 'Set a chunk size here or on the Memory tab.',
    });
  }

  const write: RadioProtocolStep = {
    ...(description ? { description } : {}),
    write: {
      segments,
      send,
      expect,
      ...(timeout !== undefined ? { timeout } : {}),
      ...(delay !== undefined ? { delay } : {}),
      ...(writeChunk !== undefined ? { chunkSize: writeChunk } : {}),
      ...(skip.length > 0 ? { skip } : {}),
    },
  };

  return { id: step.id, step: hasStepErrors(issues) ? undefined : write, issues };
}

function tokensInclude(value: RadioByteToken | RadioByteToken[] | RadioExpect, needle: string): boolean {
  if (Array.isArray(value)) {
    return value.some((token) => token === needle);
  }

  return value === needle;
}

function hasStepErrors(issues: DriverIssue[]): boolean {
  return issues.some((issue) => issue.level === 'error');
}

function compileIdentity(draft: DriverDraft, issues: DriverIssue[]): DriverModuleDocument['id'] {
  const manufacturer = draft.manufacturer.trim();
  const model = draft.model.trim();
  const name = draft.name.trim();

  if (!manufacturer) {
    issues.push({ level: 'error', path: 'id.manufacturer', message: 'Enter the manufacturer.' });
  }

  if (!model) {
    issues.push({ level: 'error', path: 'id.model', message: 'Enter a model id.' });
  } else if (!MODEL_ID.test(model)) {
    issues.push({
      level: 'error',
      path: 'id.model',
      message: 'Use lowercase letters, numbers, and hyphens, like example-radio.',
    });
  }

  if (!name) {
    issues.push({ level: 'error', path: 'id.name', message: 'Enter the name shown in HamBench.' });
  }

  if (!draft.version.trim()) {
    issues.push({ level: 'error', path: 'version', message: 'Enter a version.' });
  } else if (!VERSION.test(draft.version.trim())) {
    issues.push({ level: 'error', path: 'version', message: 'Use a version like 1.0.0.' });
  }

  return {
    manufacturer,
    model,
    name,
  };
}

function compileJsonPath(raw: string, path: string, issues: DriverIssue[], label: string): string | undefined {
  const text = raw.trim();

  if (!text) {
    return undefined;
  }

  if (!JSON_PATH.test(text)) {
    issues.push({ level: 'error', path, message: `${label} must be a relative path ending in .json.` });
    return undefined;
  }

  return text;
}

function compileSerial(draft: DriverDraft, issues: DriverIssue[]): { config: RadioSerialConfig; summary?: string } {
  const baudRate = parseDriverInteger(draft.baudRate);

  if (baudRate === undefined || baudRate < 1) {
    issues.push({ level: 'error', path: 'serial.baudRate', message: 'Enter a baud rate.' });
  }

  const extra = draft.baudRates
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const baudRates: number[] = [];

  for (const part of extra) {
    const value = parseDriverInteger(part);

    if (value === undefined || value < 1) {
      issues.push({ level: 'error', path: 'serial.baudRates', message: 'List baud rates as numbers separated by commas.' });
      baudRates.length = 0;
      break;
    }

    baudRates.push(value);
  }

  if (baudRates.length > 0 && baudRate !== undefined && !baudRates.includes(baudRate)) {
    issues.push({
      level: 'error',
      path: 'serial.baudRates',
      message: 'Include the default baud rate in the list.',
    });
  }

  const config: RadioSerialConfig = {
    baudRate: baudRate && baudRate > 0 ? baudRate : 0,
    dataBits: draft.dataBits,
    stopBits: draft.stopBits,
    parity: draft.parity,
    ...(baudRates.length > 0 ? { baudRates } : {}),
    ...(draft.rtscts ? { rtscts: true } : {}),
    ...(draft.rts === 'omit' ? {} : { rts: draft.rts === 'on' }),
    ...(draft.dtr === 'omit' ? {} : { dtr: draft.dtr === 'on' }),
  };

  return {
    config,
    summary: baudRate && baudRate > 0 ? formatSerialSummary(config) : undefined,
  };
}

function compileMemory(draft: DriverDraft, issues: DriverIssue[]): RadioMemoryConfig | undefined {
  const chunkSize = parseDriverInteger(draft.chunkSize);
  const addressSize = parseDriverInteger(draft.addressSize);

  if (chunkSize === undefined || chunkSize < 1) {
    issues.push({ level: 'error', path: 'memory.chunkSize', message: 'Enter a chunk size of 1 or more.' });
  }

  if (addressSize === undefined || addressSize < 1 || addressSize > 4) {
    issues.push({ level: 'error', path: 'memory.addressSize', message: 'Address size must be 1, 2, 3, or 4 bytes.' });
  }

  const names = new Set<string>();
  const segments: RadioMemoryConfig['segments'] = {};

  if (draft.segments.length === 0) {
    issues.push({ level: 'error', path: 'memory.segments', message: 'Add at least one memory segment.' });
  }

  for (const segment of draft.segments) {
    const name = segment.name.trim();
    const path = `memory.segments.${segment.id}`;

    if (!SEGMENT_NAME.test(name)) {
      issues.push({
        level: 'error',
        path: `${path}.name`,
        message: 'Start the name with a letter. Then use letters, numbers, _ or -.',
      });
    } else if (names.has(name)) {
      issues.push({ level: 'error', path: `${path}.name`, message: 'Segment names must be unique.' });
    } else {
      names.add(name);
    }

    const start = parseDriverInteger(segment.startAddress);
    const end = parseDriverInteger(segment.endAddress);

    if (start === undefined) {
      issues.push({ level: 'error', path: `${path}.startAddress`, message: 'Enter a start address.' });
    }

    if (end === undefined) {
      issues.push({ level: 'error', path: `${path}.endAddress`, message: 'Enter an end address.' });
    }

    if (start !== undefined && end !== undefined && end < start) {
      issues.push({ level: 'error', path: `${path}.endAddress`, message: 'End address is inclusive and cannot be before the start.' });
    }

    if (name && start !== undefined && end !== undefined && end >= start && !segments[name]) {
      segments[name] = { startAddress: start, endAddress: end };
    }
  }

  if (chunkSize === undefined || chunkSize < 1 || addressSize === undefined || addressSize < 1 || addressSize > 4) {
    return Object.keys(segments).length > 0
      ? {
          chunkSize: chunkSize && chunkSize > 0 ? chunkSize : 0,
          addressSize: addressSize && addressSize > 0 ? addressSize : 0,
          addressEndianness: draft.addressEndianness,
          segments,
        }
      : undefined;
  }

  return {
    chunkSize,
    addressSize,
    addressEndianness: draft.addressEndianness,
    segments,
  };
}

function tokenLabels(tokens: RadioByteToken[]): string {
  return tokens.map((token) => formatByteToken(token).label).join(' ');
}

function expectSentence(expect: RadioExpect): string {
  const message = formatExpect(expect);
  const labels = message.tokens.map((token) => token.label).join(' ');
  return `Radio replies ${labels}.`;
}

/**
 * Plain-language description of one compiled protocol step, for the walk-through.
 */
export function explainProtocolStep(step: RadioProtocolStep, memory?: RadioMemoryConfig): string[] {
  if ('catRead' in step || 'catWrite' in step) {
    const config = 'catRead' in step ? step.catRead : step.catWrite;
    const direction = 'catRead' in step ? 'reads' : 'writes';
    return [
      `Live CAT ${direction} ${config.count} channels in ${config.segment}, ${config.recordSize} bytes each, using ${config.pack}.`,
    ];
  }

  if ('read' in step) {
    const lines = [
      `Repeats for every ${memory?.chunkSize ?? 'chunk'} byte block in ${step.read.segments.join(', ')}.`,
      `Computer sends ${tokenLabels(step.read.send)}.`,
      expectSentence(step.read.expect),
    ];

    if (step.read.ack?.send) {
      lines.push(`After each chunk, computer sends ${tokenLabels(step.read.ack.send)}.`);
    }

    if (step.read.ready !== undefined) {
      lines.push(
        `If that ack times out, the next reply is expected to start with ${formatByteToken(step.read.ready).label}.`,
      );
    }

    if (step.read.delay !== undefined) {
      lines.push(`Waits ${step.read.delay} ms after each accepted chunk.`);
    }

    return lines;
  }

  if ('write' in step) {
    const size = step.write.chunkSize ?? memory?.chunkSize;
    const lines = [
      `Repeats for every ${size ?? 'chunk'} byte block in ${step.write.segments.join(', ')}.`,
      `Computer sends ${tokenLabels(step.write.send)}.`,
      expectSentence(step.write.expect),
    ];

    if (step.write.skip && step.write.skip.length > 0) {
      const ranges = step.write.skip
        .map((range) => `${formatDriverAddress(range.startAddress)}–${formatDriverAddress(range.endAddress)}`)
        .join(', ');
      lines.push(`Skips addresses ${ranges}.`);
    }

    if (step.write.delay !== undefined) {
      lines.push(`Waits ${step.write.delay} ms after each accepted block.`);
    }

    return lines;
  }

  const lines: string[] = [];

  if (step.setBaudRate !== undefined) {
    lines.push(`Switches the port to ${step.setBaudRate} baud before the exchange.`);
  }

  if (step.send && step.send.length > 0) {
    lines.push(`Computer sends ${tokenLabels(step.send)}.`);
  }

  if (step.expect !== undefined) {
    lines.push(expectSentence(step.expect));
  }

  if (step.delay !== undefined) {
    lines.push(`Waits ${step.delay} ms after sending.`);
  }

  if (step.timeout !== undefined) {
    lines.push(`Gives up after ${step.timeout} ms.`);
  }

  return lines.length > 0 ? lines : ['This exchange does not send or wait for anything yet.'];
}

/**
 * Turn the form into protocol JSON and a list of syntax problems.
 * Invalid fields are left out of the JSON so the preview stays parseable.
 */
export function compileDriverDraft(draft: DriverDraft): CompiledDriver {
  const issues: DriverIssue[] = [];
  const id = compileIdentity(draft, issues);
  const serial = compileSerial(draft, issues);
  const memory = compileMemory(draft, issues);
  const known = new Set(memory ? Object.keys(memory.segments) : []);
  const read = draft.readSteps.map((step) => compileStep(step, 'read', known, memory?.chunkSize));
  const write = draft.writeSteps.map((step) => compileStep(step, 'write', known, memory?.chunkSize));

  if (read.length === 0) {
    issues.push({ level: 'error', path: 'read', message: 'Add at least one read step.' });
  } else if (!read.some((item) => item.step && ('read' in item.step || 'catRead' in item.step))) {
    issues.push({
      level: 'warning',
      path: 'read',
      message: 'The read protocol never downloads memory. Add a chunked read or a CAT read.',
    });
  }

  if (write.length === 0) {
    issues.push({ level: 'error', path: 'write', message: 'Add at least one write step.' });
  } else if (!write.some((item) => item.step && ('write' in item.step || 'catWrite' in item.step))) {
    issues.push({
      level: 'warning',
      path: 'write',
      message: 'The write protocol never uploads memory. Add a chunked write or a CAT write.',
    });
  }

  const settingsPath = compileJsonPath(draft.settingsSchemaPath, 'schemas.settings', issues, 'Settings schema');
  const channelPath = compileJsonPath(draft.channelSchemaPath, 'schemas.channel', issues, 'Channel schema');
  const memoryMapPath = compileJsonPath(draft.memoryMapPath, 'schemas.memoryMap', issues, 'Memory map');

  if (!settingsPath || !channelPath) {
    issues.push({
      level: 'warning',
      path: 'schemas',
      message: 'A published module also needs settings and channel schema paths. Protocol JSON can omit them while you are debugging.',
    });
  }

  if (!memoryMapPath) {
    issues.push({
      level: 'warning',
      path: 'schemas.memoryMap',
      message: 'A published module points memoryMap at a memory-map JSON file. This editor does not draw that map.',
    });
  }

  if (memory) {
    for (const name of Object.keys(memory.segments)) {
      const used = [...draft.readSteps, ...draft.writeSteps].some((step) => {
        return step.segments.includes(name) || step.catSegment === name;
      });

      if (!used) {
        issues.push({
          level: 'warning',
          path: 'memory.segments',
          message: `Segment ${name} is not used by a read or write step.`,
        });
      }
    }
  }

  const document: DriverModuleDocument = {
    id,
    version: draft.version.trim(),
    description: draft.description.trim(),
    capabilities: {
      memoryRead: draft.memoryRead,
      memoryWrite: draft.memoryWrite,
      channelProgramming: draft.channelProgramming,
      settingsProgramming: draft.settingsProgramming,
      liveControl: draft.liveControl,
    },
    serialConfig: serial.config,
    memoryConfig: memory ?? {
      chunkSize: 0,
      addressSize: 0,
      addressEndianness: draft.addressEndianness,
      segments: {},
    },
    readMemory: read.flatMap((item) => (item.step ? [item.step] : [])),
    writeMemory: write.flatMap((item) => (item.step ? [item.step] : [])),
  };

  if (settingsPath && channelPath) {
    document.settingsSchema = {
      model: id.model,
      settingsSchema: { $ref: settingsPath },
      channelSchema: { $ref: channelPath },
    };
  }

  if (memoryMapPath) {
    document.memoryMap = { $ref: memoryMapPath };
    document.codec = { type: 'memoryMap' };
  }

  const stepIssues = [...read, ...write].flatMap((item) => item.issues);
  const allIssues = [...issues, ...stepIssues];

  return {
    document,
    json: JSON.stringify(document, null, 2),
    issues: allIssues,
    read,
    write,
    memoryConfig: memory,
    serialSummary: serial.summary,
    errorCount: allIssues.filter((issue) => issue.level === 'error').length,
    warningCount: allIssues.filter((issue) => issue.level === 'warning').length,
  };
}
