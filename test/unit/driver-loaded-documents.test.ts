import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileChannelSchema } from '../../app/utils/channel-schema.ts';
import { importDriverModule } from '../../app/utils/driver-import.ts';
import { compileMemoryMap } from '../../app/utils/memory-map.ts';

const uv5rChannelSchema = JSON.parse(
  readFileSync(new URL('../../../radio-module-baofeng/src/shared/schemas/channel-schema.json', import.meta.url), 'utf8'),
) as unknown;

const uv5rMemoryMap = JSON.parse(
  readFileSync(new URL('../../../radio-module-baofeng/src/shared/memory-maps/uv5r-settings.json', import.meta.url), 'utf8'),
) as unknown;

describe('installed driver documents', () => {
  it('fills the channel schema and memory map from an inlined module', () => {
    const imported = importDriverModule({
      id: { manufacturer: 'Baofeng', model: 'uv-5r', name: 'UV-5R' },
      settingsSchema: {
        settingsSchema: { type: 'object', additionalProperties: true },
        channelSchema: uv5rChannelSchema,
      },
      memoryMap: uv5rMemoryMap,
    });

    expect(imported.error).toBeUndefined();
    expect(imported.warnings).toEqual([]);
    expect(imported.draft?.channelSchema).toMatchObject({
      includeName: true,
      nameMaxLength: '7',
      receiveMinimum: '136000000',
      receiveMaximum: '174000000',
      includeReceiveTone: true,
      includeTransmitTone: true,
    });

    const channels = imported.draft?.memoryMap.structs.find((struct) => struct.structId === 'channels');
    const settings = imported.draft?.memoryMap.structs.find((struct) => struct.structId === 'settings');
    const squelch = settings?.fields.find((field) => field.fieldId === 'squelch');

    expect(channels?.fields.find((field) => field.fieldId === 'rxtone')).toMatchObject({ type: 'u16', kind: 'tone' });
    expect(channels?.fields.find((field) => field.fieldId === 'lowpower')).toMatchObject({ type: 'bits', width: '2' });

    expect(imported.draft?.memoryMap.groups.map((group) => group.groupId)).toEqual([
      'basic',
      'advanced',
      'workmode',
      'other',
      'dtmf',
      'service',
    ]);
    expect(squelch).toMatchObject({
      showUi: true,
      uiGroup: 'basic',
      uiSubgroup: 'receive',
      uiLabel: 'Carrier Squelch Level',
      uiWidget: 'integer',
      uiMenuNumber: '0',
      uiMenuCode: 'SQL',
    });
    expect((settings?.fields.length ?? 0) > 1).toBe(true);

    const channel = compileChannelSchema(imported.draft!.channelSchema);
    const map = compileMemoryMap(imported.draft!.memoryMap);

    expect(channel.errorCount).toBe(0);
    expect(map.errorCount).toBe(0);
    expect(map.warningCount).toBe(0);

    const source = uv5rMemoryMap as { structs: Array<{ id: string; fields: Array<{ id: string }> }> };
    const compiled = JSON.parse(map.json) as { structs: Array<{ id: string; fields: Array<{ id: string }> }> };

    expect(compiled.structs.map((struct) => [struct.id, struct.fields.map((field) => field.id)])).toEqual(
      source.structs.map((struct) => [struct.id, struct.fields.map((field) => field.id)]),
    );
  });

  it('keeps a path when the module still points at a file', () => {
    const imported = importDriverModule({
      memoryMap: { $ref: '../src/shared/memory-maps/uv5r-settings.json' },
      settingsSchema: {
        channelSchema: { $ref: '../src/shared/schemas/channel-schema.json' },
      },
    });

    expect(imported.draft?.memoryMapPath).toBe('../src/shared/memory-maps/uv5r-settings.json');
    expect(imported.draft?.channelSchemaPath).toBe('../src/shared/schemas/channel-schema.json');
    expect(imported.draft?.memoryMap.structs).toHaveLength(3);
  });
});
