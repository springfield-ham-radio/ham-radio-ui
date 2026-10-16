import { RadioChannelId } from '@springfield/ham-radio-api';
import type { SavedChannel } from '~/utils/saved-channels-db';

const now = 1_700_000_100_000;

/** Dev-only channels that show one validation error and one warning on a Baofeng UV-5R. */
export function addToRadioDevFixture(): SavedChannel[] {
  return [
    {
      id: RadioChannelId('fixture-add-125m'),
      kind: 'channel',
      name: '1.25 m',
      transmitFrequency: 223_500_000,
      receiveFrequency: 223_500_000,
      latitude: 0,
      longitude: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: RadioChannelId('fixture-add-long-name'),
      kind: 'channel',
      name: 'ABCDEFGH',
      transmitFrequency: 146_520_000,
      receiveFrequency: 146_520_000,
      latitude: 0,
      longitude: 0,
      createdAt: now,
      updatedAt: now,
    },
  ];
}
