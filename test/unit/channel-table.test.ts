import { describe, it } from 'node:test';
import { expect } from 'chai';
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

      expect(fields.map((field) => field.fieldId)).to.deep.equal(['lockout', 'tuning_step']);
    });
  });
});
