import { describe, expect, it } from 'vitest';
import { channelTableTbodyFromRoot } from '../../app/utils/channel-table-sortable.ts';

function fakeRadioCardRoot(tbodyId: string): ParentNode {
  const tbody = { id: tbodyId } as HTMLElement;

  return {
    querySelector(selector: string) {
      if (selector === '.channel-table-tbody') {
        return tbody;
      }

      return null;
    },
  } as ParentNode;
}

describe('channelTableTbodyFromRoot', () => {
  it('returns the tbody inside each radio card root', () => {
    const first = fakeRadioCardRoot('first-tbody');
    const second = fakeRadioCardRoot('second-tbody');

    expect((channelTableTbodyFromRoot(first) as HTMLElement | null)?.id).toBe('first-tbody');
    expect((channelTableTbodyFromRoot(second) as HTMLElement | null)?.id).toBe('second-tbody');
  });

  it('returns null when the root has no channel table tbody', () => {
    const root = {
      querySelector: () => null,
    } as ParentNode;

    expect(channelTableTbodyFromRoot(root)).toBeNull();
  });
});
