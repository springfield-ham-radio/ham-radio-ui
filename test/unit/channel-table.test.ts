import { describe, expect, it } from 'vitest';
import { extraChannelTableFields } from '../../app/utils/channel-table.ts';

describe('channel-table', () => {
  describe('extraChannelTableFields', () => {
    it('drops extras whose field id collides with a core table column', () => {
      const fields = extraChannelTableFields([
        { fieldId: 'band' },
        { fieldId: 'lockout' },
        { fieldId: 'name' },
        { fieldId: 'tuning_step' },
      ]);

      expect(fields.map((field) => field.fieldId)).toEqual(['lockout', 'tuning_step']);
    });
  });
});
