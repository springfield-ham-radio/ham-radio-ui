import { RadioChannelId } from '@springfield/ham-radio-api';
import { describe, expect, it } from 'vitest';
import { channelsInGroup, normalizeChannelGroupName, validateChannelGroupName, ALL_CHANNELS_TAB_ID } from '../../app/utils/channel-groups.ts';

describe('channel-groups', () => {
  describe('validateChannelGroupName', () => {
    it('rejects a blank name, the reserved All tab, and duplicates', () => {
      expect(validateChannelGroupName('   ', [])).toBe('Enter a group name');
      expect(validateChannelGroupName('All', [])).toBe('All is reserved for every channel');
      expect(validateChannelGroupName('weather', [])).toBe('Weather is reserved for a built-in group');
      expect(validateChannelGroupName('FRS', [])).toBe('FRS is reserved for a built-in group');
      expect(validateChannelGroupName('gmrs', [])).toBe('GMRS is reserved for a built-in group');
      expect(validateChannelGroupName('travel', ['Travel'])).toBe('A group with that name already exists');
      expect(validateChannelGroupName('Local', ['Travel'])).toBeUndefined();
    });

    it('rejects names longer than the tab limit', () => {
      expect(validateChannelGroupName('x'.repeat(41), [])).toMatch(/40 characters/);
    });
  });

  describe('normalizeChannelGroupName', () => {
    it('trims and collapses whitespace', () => {
      expect(normalizeChannelGroupName('  Club   net  ')).toBe('Club net');
    });
  });

  describe('channelsInGroup', () => {
    const channels = [{ id: RadioChannelId('a') }, { id: RadioChannelId('b') }];

    it('returns every channel for the All tab', () => {
      expect(channelsInGroup(channels, [], ALL_CHANNELS_TAB_ID).map((channel) => channel.id)).toEqual(['a', 'b']);
    });

    it('returns only members of the selected group', () => {
      const visible = channelsInGroup(channels, [{ groupId: 'g1', channelId: RadioChannelId('b') }], 'g1');

      expect(visible.map((channel) => channel.id)).toEqual(['b']);
    });
  });
});
