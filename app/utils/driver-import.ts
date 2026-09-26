import type { RadioByteToken, RadioExpect } from '@springfield/ham-radio-api';
import { draftChannelSchema, draftMemoryMap } from './driver-loaded-documents';
import { listedProgrammingBaudRates } from './radio-baud-rate';
import {
  DRIVER_PLACEHOLDER_VALUES,
  createDriverDraft,
  createDriverExpect,
  createDriverId,
  createDriverSegment,
  createDriverStep,
  createDriverToken,
  formatDriverAddress,
  formatDriverBaudRates,
  type DriverDraft,
  type DriverExpectDraft,
  type DriverStepDraft,
  type DriverToken,
} from './driver-draft';

export interface DriverImportResult {
  draft?: DriverDraft;
  warnings: string[];
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function refOf(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.$ref !== 'string') {
    return undefined;
  }

  return value.$ref;
}

function isPlaceholder(value: string): boolean {
  return (DRIVER_PLACEHOLDER_VALUES as readonly string[]).includes(value);
}

function draftTokens(token: RadioByteToken, warnings: string[]): DriverToken[] {
  if (typeof token === 'number' && Number.isInteger(token) && token >= 0 && token <= 255) {
    return [createDriverToken('hex', token.toString(16).toUpperCase().padStart(2, '0'))];
  }

  if (typeof token !== 'string') {
    warnings.push('Skipped a byte token that was not a number or string.');
    return [];
  }

  if (/^0x[0-9a-fA-F]{1,2}$/i.test(token)) {
    return [createDriverToken('hex', token.slice(2).toUpperCase().padStart(2, '0'))];
  }

  if (isPlaceholder(token)) {
    return [createDriverToken('placeholder', token)];
  }

  if (token.length === 1) {
    return [createDriverToken('ascii', token)];
  }

  if (!token.startsWith('$') && !token.startsWith('0x')) {
    warnings.push(`Split "${token}" into single ASCII characters.`);
    return [...token].map((character) => createDriverToken('ascii', character));
  }

  warnings.push(`Kept unrecognized token ${token} so you can correct it.`);
  return [{ id: createDriverId(), kind: 'hex', value: token }];
}

function draftExpect(expect: RadioExpect | undefined, warnings: string[]): DriverExpectDraft {
  const base = createDriverExpect();

  if (expect === undefined) {
    return base;
  }

  if (isRecord(expect) && typeof expect.bytes === 'number') {
    return { ...base, mode: 'bytes', byteCount: String(expect.bytes) };
  }

  if (isRecord(expect) && 'until' in expect) {
    const until = draftTokens(expect.until as RadioByteToken, warnings)[0] ?? base.until;
    return { ...base, mode: 'until', until };
  }

  const list = Array.isArray(expect) ? expect : [expect as RadioByteToken];

  return {
    ...base,
    mode: 'exact',
    tokens: list.flatMap((token) => draftTokens(token, warnings)),
  };
}

function numberText(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function addressText(value: unknown): string {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? formatDriverAddress(value) : '';
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function draftStep(value: unknown, warnings: string[]): DriverStepDraft | undefined {
  if (!isRecord(value)) {
    warnings.push('Skipped a protocol step that was not an object.');
    return undefined;
  }

  const description = typeof value.description === 'string' ? value.description : '';

  if (isRecord(value.catRead) || isRecord(value.catWrite)) {
    const cat = (isRecord(value.catRead) ? value.catRead : value.catWrite) as Record<string, unknown>;
    const step = createDriverStep(isRecord(value.catRead) ? 'catRead' : 'catWrite');
    step.description = description;
    step.catSegment = typeof cat.segment === 'string' ? cat.segment : '';
    step.catCount = numberText(cat.count);
    step.catRecordSize = numberText(cat.recordSize);
    step.catIndexWidth = numberText(cat.indexWidth);
    step.catEmptyByte = numberText(cat.emptyByte);
    step.catTimeout = numberText(cat.timeout);
    step.catInterCommandDelay = numberText(cat.interCommandDelayMs);
    return step;
  }

  if (isRecord(value.read) || isRecord(value.write)) {
    const body = (isRecord(value.read) ? value.read : value.write) as Record<string, unknown>;
    const step = createDriverStep(isRecord(value.read) ? 'read' : 'write');
    step.description = description;
    step.segments = stringList(body.segments);
    step.send = Array.isArray(body.send) ? body.send.flatMap((token) => draftTokens(token as RadioByteToken, warnings)) : [];
    step.expect = draftExpect(body.expect as RadioExpect | undefined, warnings);
    step.timeout = numberText(body.timeout);
    step.delay = numberText(body.delay);
    step.chunkSize = numberText(body.chunkSize);

    if (Array.isArray(body.skip)) {
      step.skip = body.skip.flatMap((range) => {
        if (!isRecord(range)) {
          return [];
        }

        return [
          {
            id: createDriverId(),
            startAddress: addressText(range.startAddress),
            endAddress: addressText(range.endAddress),
          },
        ];
      });
    }

    if (isRecord(body.ack)) {
      step.includeAck = true;
      step.ackSend = Array.isArray(body.ack.send)
        ? body.ack.send.flatMap((token) => draftTokens(token as RadioByteToken, warnings))
        : [];
      step.ackExpect = draftExpect(body.ack.expect as RadioExpect | undefined, warnings);
      step.ackTimeout = numberText(body.ack.timeout);
    }

    if (body.ready !== undefined) {
      step.includeReady = true;
      step.ready = draftTokens(body.ready as RadioByteToken, warnings)[0] ?? step.ready;
    }

    return step;
  }

  if (value.send === undefined && value.expect === undefined && value.setBaudRate === undefined && !description) {
    warnings.push('Skipped a protocol step with nothing to send, expect, or change.');
    return undefined;
  }

  const step = createDriverStep('exchange');
  step.description = description;
  step.send = Array.isArray(value.send) ? value.send.flatMap((token) => draftTokens(token as RadioByteToken, warnings)) : [];
  step.expect = draftExpect(value.expect as RadioExpect | undefined, warnings);
  step.timeout = numberText(value.timeout);
  step.delay = numberText(value.delay);
  step.setBaudRate = numberText(value.setBaudRate);
  return step;
}

function draftSteps(value: unknown, warnings: string[]): DriverStepDraft[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    warnings.push('Protocol steps were not a list, so they were left empty.');
    return [];
  }

  return value.flatMap((step) => {
    const drafted = draftStep(step, warnings);
    return drafted ? [drafted] : [];
  });
}

/**
 * Load a radio-module JSON object into the form.
 * A path is stored as written. An inlined channel schema or memory map fills that tab.
 * The settings schema stays a path: the Settings screen is the memory map.
 */
export function importDriverModule(value: unknown): DriverImportResult {
  if (!isRecord(value)) {
    return { warnings: [], error: 'Driver file must be a JSON object.' };
  }

  const draft = createDriverDraft();
  const warnings: string[] = [];
  const id = isRecord(value.id) ? value.id : undefined;

  if (id) {
    draft.manufacturer = typeof id.manufacturer === 'string' ? id.manufacturer : '';
    draft.model = typeof id.model === 'string' ? id.model : '';
    draft.name = typeof id.name === 'string' ? id.name : '';
  }

  if (typeof value.version === 'string') {
    draft.version = value.version;
  }

  if (typeof value.description === 'string') {
    draft.description = value.description;
  }

  if (isRecord(value.capabilities)) {
    const capabilities = value.capabilities;
    draft.memoryRead = capabilities.memoryRead !== false;
    draft.memoryWrite = capabilities.memoryWrite !== false;
    draft.channelProgramming = capabilities.channelProgramming === true;
    draft.settingsProgramming = capabilities.settingsProgramming === true;
    draft.liveControl = capabilities.liveControl === true;
  }

  if (isRecord(value.serialConfig)) {
    const serial = value.serialConfig;
    draft.baudRate = numberText(serial.baudRate) || draft.baudRate;

    if (serial.dataBits === 5 || serial.dataBits === 6 || serial.dataBits === 7 || serial.dataBits === 8) {
      draft.dataBits = serial.dataBits;
    }

    if (serial.stopBits === 1 || serial.stopBits === 1.5 || serial.stopBits === 2) {
      draft.stopBits = serial.stopBits;
    }

    if (serial.parity === 'none' || serial.parity === 'even' || serial.parity === 'odd') {
      draft.parity = serial.parity;
    }

    const listed = listedProgrammingBaudRates({
      baudRate: typeof serial.baudRate === 'number' ? serial.baudRate : 0,
      baudRates: serial.baudRates,
    });

    if (listed.length > 0) {
      draft.baudRates = formatDriverBaudRates(listed);
    }

    draft.rtscts = serial.rtscts === true;
    draft.rts = typeof serial.rts === 'boolean' ? (serial.rts ? 'on' : 'off') : 'omit';
    draft.dtr = typeof serial.dtr === 'boolean' ? (serial.dtr ? 'on' : 'off') : 'omit';
  }

  if (isRecord(value.memoryConfig)) {
    const memory = value.memoryConfig;
    draft.chunkSize = numberText(memory.chunkSize) || draft.chunkSize;
    draft.addressSize = numberText(memory.addressSize) || draft.addressSize;
    draft.addressEndianness = memory.addressEndianness === 'little' ? 'little' : 'big';

    if (isRecord(memory.segments)) {
      draft.segments = Object.entries(memory.segments).flatMap(([name, segment]) => {
        if (!isRecord(segment)) {
          warnings.push(`Skipped segment ${name} because it had no address range.`);
          return [];
        }

        return [createDriverSegment(name, addressText(segment.startAddress), addressText(segment.endAddress))];
      });
    }
  }

  const settings = isRecord(value.settingsSchema) ? value.settingsSchema : undefined;
  const settingsRef = settings ? refOf(settings.settingsSchema) : undefined;
  const channelRef = settings ? refOf(settings.channelSchema) : undefined;

  if (settings && settings.settingsSchema !== undefined && !settingsRef) {
    const schema = settings.settingsSchema;
    const properties = isRecord(schema) && isRecord(schema.properties) ? schema.properties : undefined;

    if (properties && Object.keys(properties).length > 0) {
      warnings.push('The settings schema lists fields. This editor does not edit that file. The Settings screen comes from the memory map.');
    }
  }

  if (settings && settings.channelSchema !== undefined && !channelRef) {
    const channelSchema = draftChannelSchema(settings.channelSchema, warnings);

    if (channelSchema) {
      draft.channelSchema = channelSchema;
    }
  }

  draft.settingsSchemaPath = settingsRef ?? '';
  draft.channelSchemaPath = channelRef ?? '';

  const memoryMapRef = refOf(value.memoryMap);

  if (value.memoryMap !== undefined && !memoryMapRef) {
    const memoryMap = draftMemoryMap(value.memoryMap, warnings);

    if (memoryMap) {
      draft.memoryMap = memoryMap;
    }
  }

  draft.memoryMapPath = memoryMapRef ?? '';
  draft.readSteps = draftSteps(value.readMemory, warnings);
  draft.writeSteps = draftSteps(value.writeMemory, warnings);

  return { draft, warnings };
}
