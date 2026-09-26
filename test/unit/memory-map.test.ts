import { describe, expect, it } from 'vitest';
import { coerceDriverDraft, createMemoryMapDraft } from '../../app/utils/driver-draft.ts';
import { compileMemoryMap } from '../../app/utils/memory-map.ts';

describe('memory map', () => {
  it('writes channel records, a name table, and bindings', () => {
    const compiled = compileMemoryMap(createMemoryMapDraft());
    const document = JSON.parse(compiled.json) as {
      version: string;
      structs: Array<{
        id: string;
        seek: string;
        count: number;
        stride: number;
        emptyWhen?: { equals: number };
        clearEmpty?: boolean;
        fields: Array<{ id: string; type: string; reserved?: boolean; value: { kind: string; length?: number; scale?: number; ctcssMin?: number; reverseOffset?: number; values?: number[] } }>;
      }>;
      channelBindings: { records: string; names: string; nameField: string; receiveFrequency: string };
    };

    expect(compiled.errorCount).toBe(0);
    expect(compiled.warningCount).toBe(0);
    expect(document.version).toBe('1.0.0');
    expect(document.structs[0]).toMatchObject({
      id: 'channels',
      seek: '0x0000',
      count: 128,
      stride: 16,
      emptyWhen: { equals: 255 },
      clearEmpty: true,
    });
    expect(document.structs[0]?.fields[0]?.value).toMatchObject({ kind: 'lbcd', length: 4, scale: 10 });
    expect(document.structs[0]?.fields[2]?.value).toMatchObject({ kind: 'tone', ctcssMin: 600, reverseOffset: 105 });
    expect(document.structs[0]?.fields[2]?.value.values).toContain(754);
    expect(document.structs[1]).toMatchObject({ id: 'names', seek: '0x1000' });
    expect(document.structs[1]?.fields[0]?.value).toMatchObject({ kind: 'ascii', length: 7 });
    expect(document.structs[1]?.fields[1]?.reserved).toBe(true);
    expect(document.channelBindings).toMatchObject({
      records: 'channels',
      names: 'names',
      nameField: 'name',
      receiveFrequency: 'rxfreq',
    });
  });

  it('leaves a struct with a bad start address out of the map', () => {
    const map = createMemoryMapDraft();
    map.structs[0]!.seek = 'low';
    const compiled = compileMemoryMap(map);
    const document = JSON.parse(compiled.json) as { structs: Array<{ id: string }> };

    expect(compiled.errorCount).toBeGreaterThan(0);
    expect(document.structs.map((struct) => struct.id)).toEqual(['names']);
  });

  it('restores a stored map and fills one that is missing', () => {
    const stored = coerceDriverDraft({
      version: 1,
      draft: {
        memoryMap: {
          records: 'memories',
          structs: [{ structId: 'memories', seek: '0x1700', fields: [{ fieldId: 'rx', kind: 'lbcd', length: '4' }] }],
        },
      },
    });

    expect(stored.memoryMap.records).toBe('memories');
    expect(stored.memoryMap.structs[0]?.structId).toBe('memories');
    expect(stored.memoryMap.structs[0]?.seek).toBe('0x1700');
    expect(stored.memoryMap.receiveFrequency).toBe('rxfreq');
    expect(coerceDriverDraft({ version: 1, draft: { model: 'kept' } }).memoryMap.structs[0]?.structId).toBe('channels');
  });
});
