import { describe, expect, it } from 'vitest';
import { parseDeveloperMode } from '../../app/utils/developer-mode.ts';
import { compileDriverDraft } from '../../app/utils/driver-compile.ts';
import { importDriverModule } from '../../app/utils/driver-import.ts';
import {
  canonicalizeSkipAddress,
  coerceDriverDraft,
  formatDriverBaudRates,
  parseDriverBaudRates,
  createDriverDraft,
  createDriverStep,
  createDriverToken,
  exampleDriverDraft,
} from '../../app/utils/driver-draft.ts';

describe('developer mode', () => {
  it('treats only the stored flag 1 as on', () => {
    expect(parseDeveloperMode('1')).toBe(true);
    expect(parseDeveloperMode('0')).toBe(false);
    expect(parseDeveloperMode(null)).toBe(false);
    expect(parseDeveloperMode('true')).toBe(false);
  });
});

describe('driver draft', () => {
  it('compiles the example without syntax errors', () => {
    const compiled = compileDriverDraft(exampleDriverDraft());

    expect(compiled.errorCount).toBe(0);
    expect(compiled.document.readMemory).toHaveLength(4);
    expect(compiled.document.writeMemory).toHaveLength(2);
    expect(compiled.document.readMemory[0]).toMatchObject({
      description: 'Send magic number',
      expect: '0x06',
    });
    expect(compiled.json).not.toContain('undefined');
    expect(compiled.document.serialConfig.baudRates).toEqual([9600]);
  });

  it('writes an open settings schema when the channel path is set', () => {
    const draft = exampleDriverDraft();
    draft.channelSchemaPath = '../src/shared/schemas/channel-schema.json';
    const compiled = compileDriverDraft(draft);

    expect(compiled.document.settingsSchema).toEqual({
      model: draft.model,
      settingsSchema: { type: 'object', additionalProperties: true },
      channelSchema: { $ref: '../src/shared/schemas/channel-schema.json' },
    });
  });

  it('checks the default speed when the module has no baud list', () => {
    const imported = importDriverModule({
      serialConfig: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
    });

    expect(imported.draft?.baudRate).toBe('9600');
    expect(imported.draft?.baudRates).toBe('9600');
  });

  it('requires at least one supported baud rate', () => {
    const draft = exampleDriverDraft();
    draft.baudRates = '';
    const compiled = compileDriverDraft(draft);

    expect(compiled.issues.some((issue) => issue.path === 'serial.baudRates')).toBe(true);
  });

  it('round-trips the example protocol through JSON', () => {
    const compiled = compileDriverDraft(exampleDriverDraft());
    const imported = importDriverModule(compiled.document);

    expect(imported.error).toBeUndefined();
    expect(imported.draft).toBeDefined();

    const again = compileDriverDraft(imported.draft ?? createDriverDraft());

    expect(again.document.id).toEqual(compiled.document.id);
    expect(again.document.serialConfig).toEqual(compiled.document.serialConfig);
    expect(again.document.memoryConfig).toEqual(compiled.document.memoryConfig);
    expect(imported.draft?.segments.map((segment) => [segment.startAddress, segment.endAddress])).toEqual([
      ['0x0000', '0x03FF'],
      ['0x0400', '0x04FF'],
    ]);
    expect(again.document.readMemory).toEqual(compiled.document.readMemory);
    expect(again.document.writeMemory).toEqual(compiled.document.writeMemory);
    expect(again.errorCount).toBe(0);
  });

  it('leaves a bad hex byte out of the JSON', () => {
    const draft = exampleDriverDraft();
    const step = draft.readSteps[0];

    if (!step) {
      throw new Error('example draft is missing its first step');
    }

    step.send = [createDriverToken('hex', 'GG')];
    const compiled = compileDriverDraft(draft);
    const messages = compiled.issues.filter((issue) => issue.level === 'error').map((issue) => issue.message);

    expect(messages).toContain('Enter a hex byte from 00 to FF.');
    expect(compiled.json).not.toContain('GG');
    expect(compiled.document.readMemory.some((item) => item.description === 'Send magic number')).toBe(false);
  });

  it('requires an exchange to send, expect, or change baud', () => {
    const draft = createDriverDraft();
    draft.manufacturer = 'Example';
    draft.model = 'example-radio';
    draft.name = 'Example Radio';
    draft.version = '1.0.0';
    draft.segments = exampleDriverDraft().segments;
    draft.readSteps = [createDriverStep('exchange')];
    draft.writeSteps = [createDriverStep('write')];

    const compiled = compileDriverDraft(draft);
    const messages = compiled.issues.map((issue) => issue.message);

    expect(messages).toContain('Add bytes to send, a reply to wait for, or a baud-rate change.');
  });

  it('rejects an inclusive range that ends before it starts', () => {
    const draft = exampleDriverDraft();
    const segment = draft.segments[0];

    if (!segment) {
      throw new Error('example draft is missing a segment');
    }

    segment.endAddress = '0';
    segment.startAddress = '10';
    const compiled = compileDriverDraft(draft);

    expect(compiled.issues.some((issue) => issue.message.includes('cannot be before the start'))).toBe(true);
  });

  it('keeps skip addresses as numbers and shows them as hex', () => {
    const draft = exampleDriverDraft();
    const step = draft.writeSteps.find((item) => item.kind === 'write');

    if (!step) {
      throw new Error('example draft is missing a write step');
    }

    step.skip = [
      { id: 'range-1', startAddress: '3312', endAddress: '3327' },
      { id: 'range-2', startAddress: '0xDF0', endAddress: '0xDFF' },
    ];

    const compiled = compileDriverDraft(draft);
    const write = compiled.document.writeMemory.find((item) => 'write' in item && item.write.skip);

    expect(write && 'write' in write ? write.write.skip : undefined).toEqual([
      { startAddress: 3312, endAddress: 3327 },
      { startAddress: 3568, endAddress: 3583 },
    ]);
    expect(compiled.issues.filter((issue) => issue.level === 'error')).toEqual([]);

    const imported = importDriverModule(compiled.document);
    const importedWrite = imported.draft?.writeSteps.find((item) => item.kind === 'write');

    expect(importedWrite?.skip.map((range) => [range.startAddress, range.endAddress])).toEqual([
      ['0x0CF0', '0x0CFF'],
      ['0x0DF0', '0x0DFF'],
    ]);
    expect(canonicalizeSkipAddress('3312')).toBe('0x0CF0');
    expect(canonicalizeSkipAddress('cf0')).toBe('0x0CF0');
    expect(canonicalizeSkipAddress('0x10')).toBe('0x0010');
    expect(canonicalizeSkipAddress('0x10000')).toBe('0x10000');
  });

  it('restores a stored draft and ignores corrupt JSON shapes', () => {
    const stored = coerceDriverDraft({
      version: 1,
      draft: {
        ...exampleDriverDraft(),
        model: 'kept-model',
        readSteps: [{ kind: 'nope' }, exampleDriverDraft().readSteps[0]],
      },
    });

    expect(stored.model).toBe('kept-model');
    expect(stored.readSteps).toHaveLength(1);
    expect(coerceDriverDraft(null).model).toBe('');
    expect(coerceDriverDraft('{').model).toBe('');
  });

  it('keeps extra baud rates as a sorted set', () => {
    expect(parseDriverBaudRates('57600, 9600, 9600')).toEqual([9600, 57600]);
    expect(parseDriverBaudRates('9600, fast')).toEqual([9600]);
    expect(formatDriverBaudRates([57600, 9600, 9600])).toBe('9600, 57600');
  });
});
