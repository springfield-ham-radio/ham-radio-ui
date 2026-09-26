import { describe, expect, it } from 'vitest';
import { parseDeveloperMode } from '../../app/utils/developer-mode.ts';
import { compileDriverDraft } from '../../app/utils/driver-compile.ts';
import { importDriverModule } from '../../app/utils/driver-import.ts';
import {
  coerceDriverDraft,
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
});
