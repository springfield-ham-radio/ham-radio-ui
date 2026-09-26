import { describe, expect, it } from 'vitest';
import { coerceDriverDraft, createMemoryField, createMemoryMapDraft } from '../../app/utils/driver-draft.ts';
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
        fields: Array<{
          id: string;
          type: string;
          reserved?: boolean;
          value: { kind: string; length?: number; scale?: number; min?: number; max?: number; ctcssMin?: number; reverseOffset?: number; values?: number[] };
          ui?: { group: string; subgroup?: string; label: string; widget: string; menu?: { number: number; code?: string } };
        }>;
      }>;
      groups: Array<{ id: string; label: string; icon?: string; groups?: Array<{ id: string; label: string }> }>;
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
    expect(document.groups).toEqual([
      {
        id: 'basic',
        label: 'Basic',
        icon: 'i-lucide-sliders-horizontal',
        groups: [{ id: 'receive', label: 'Receive' }],
      },
    ]);
    expect(document.structs[2]).toMatchObject({ id: 'settings', seek: '0x0E20' });
    expect(document.structs[2]?.fields[0]).toMatchObject({
      id: 'squelch',
      value: { kind: 'integer', min: 0, max: 9 },
      ui: {
        group: 'basic',
        subgroup: 'receive',
        label: 'Carrier Squelch Level',
        widget: 'integer',
        menu: { number: 0, code: 'SQL' },
      },
    });
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
    expect(document.structs.map((struct) => struct.id)).toEqual(['names', 'settings']);
  });

  it('accepts channel as the group for a per-channel extra', () => {
    const map = createMemoryMapDraft();
    map.structs[0]?.fields.push(
      createMemoryField({
        fieldId: 'lowpower',
        kind: 'integer',
        minimum: '0',
        maximum: '3',
        showUi: true,
        uiGroup: 'channel',
        uiLabel: 'Power',
        uiWidget: 'select',
      }),
    );
    const compiled = compileMemoryMap(map);
    const document = JSON.parse(compiled.json) as { structs: Array<{ fields: Array<{ id: string; ui?: { group: string } }> }> };

    expect(compiled.warningCount).toBe(0);
    expect(document.structs[0]?.fields.find((field) => field.id === 'lowpower')?.ui).toMatchObject({ group: 'channel', label: 'Power' });
  });

  it('warns when a settings field names a group that was not declared', () => {
    const map = createMemoryMapDraft();
    const squelch = map.structs[2]?.fields[0];

    if (squelch) {
      squelch.uiGroup = 'missing';
    }

    const compiled = compileMemoryMap(map);

    expect(compiled.issues.filter((issue) => issue.message === 'No settings group is named missing.')).toHaveLength(1);
  });

  it('leaves a settings group with no label out of the map', () => {
    const map = createMemoryMapDraft();
    map.groups[0]!.label = '';
    const compiled = compileMemoryMap(map);
    const document = JSON.parse(compiled.json) as { groups?: unknown[] };

    expect(compiled.errorCount).toBeGreaterThan(0);
    expect(document.groups).toBeUndefined();
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
    expect(stored.memoryMap.groups).toEqual([]);
    expect(stored.memoryMap.structs[0]?.fields[0]?.showUi).toBe(false);
    expect(coerceDriverDraft({ version: 1, draft: { model: 'kept' } }).memoryMap.groups[0]?.groupId).toBe('basic');
  });
});
