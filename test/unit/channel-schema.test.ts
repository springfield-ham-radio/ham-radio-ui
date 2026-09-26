import { describe, expect, it } from 'vitest';
import { compileChannelSchema } from '../../app/utils/channel-schema.ts';
import { coerceDriverDraft, createChannelSchemaDraft } from '../../app/utils/driver-draft.ts';

describe('channel schema', () => {
  it('writes a name, two frequencies, and CTCSS or DCS tones', () => {
    const compiled = compileChannelSchema(createChannelSchemaDraft());
    const document = JSON.parse(compiled.json) as {
      required: string[];
      properties: Record<string, { maxLength?: number; minimum?: number; maximum?: number; properties?: { type?: { enum?: string[] }; tone?: { oneOf?: Array<{ pattern?: string }> } } }>;
    };

    expect(compiled.errorCount).toBe(0);
    expect(document.required).toEqual(['receiveFrequency', 'transmitFrequency']);
    expect(document.properties.name?.maxLength).toBe(7);
    expect(document.properties.receiveFrequency).toMatchObject({ minimum: 136000000, maximum: 174000000 });
    expect(document.properties.transmitFrequency).toMatchObject({ minimum: 136000000, maximum: 174000000 });
    expect(document.properties.receiveTone?.properties?.type?.enum).toEqual(['CTCSS', 'DCS', 'NONE']);
    expect(document.properties.receiveTone?.properties?.tone?.oneOf?.[1]?.pattern).toBe('^D[0-9]{3}[N|I]$');
    expect(document.properties.transmitTone).toEqual(document.properties.receiveTone);
  });

  it('leaves a frequency bound that does not parse out of the schema', () => {
    const schema = createChannelSchemaDraft();
    schema.receiveMaximum = 'low';
    const compiled = compileChannelSchema(schema);
    const document = JSON.parse(compiled.json) as { properties: { receiveFrequency: { minimum?: number; maximum?: number } } };

    expect(compiled.errorCount).toBe(1);
    expect(document.properties.receiveFrequency.minimum).toBe(136000000);
    expect(document.properties.receiveFrequency.maximum).toBeUndefined();
  });

  it('restores a stored channel schema and fills one that is missing', () => {
    const stored = coerceDriverDraft({
      version: 1,
      draft: {
        channelSchema: { nameMaxLength: '16', includeName: false },
      },
    });

    expect(stored.channelSchema.includeName).toBe(false);
    expect(stored.channelSchema.nameMaxLength).toBe('16');
    expect(stored.channelSchema.receiveMinimum).toBe('136000000');
    expect(coerceDriverDraft({ version: 1, draft: { model: 'kept' } }).channelSchema.includeReceiveTone).toBe(true);
  });
});
