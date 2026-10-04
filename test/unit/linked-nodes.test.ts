import { describe, expect, it } from 'vitest';
import {
  channelHasLinkedNode,
  linkedNodeBadges,
  mergeLinkedNodes,
  parseLinkedNode,
} from '../../app/utils/linked-nodes.ts';

describe('linked-nodes', () => {
  it('treats blank and zero as no node', () => {
    expect(parseLinkedNode('')).toBeUndefined();
    expect(parseLinkedNode('  ')).toBeUndefined();
    expect(parseLinkedNode('0')).toBeUndefined();
    expect(parseLinkedNode('0.0')).toBeUndefined();
    expect(parseLinkedNode('5517')).toBe('5517');
    expect(parseLinkedNode(' 353167 ')).toBe('353167');
  });

  it('replaces stored nodes when the source included node columns', () => {
    const existing = { allstarNode: '111', echolinkNode: '222' };
    const incoming = { allstarNode: undefined, irlpNode: '7777' };

    expect(mergeLinkedNodes(incoming, existing, true)).toEqual({
      allstarNode: undefined,
      echolinkNode: undefined,
      irlpNode: '7777',
      wiresNode: undefined,
    });
    expect(mergeLinkedNodes(incoming, existing, false)).toEqual({
      allstarNode: '111',
      echolinkNode: '222',
      irlpNode: '7777',
      wiresNode: undefined,
    });
  });

  it('lists badges only for nodes that are set', () => {
    const nodes = { allstarNode: '5517', wiresNode: '1234' };

    expect(channelHasLinkedNode(nodes)).toBe(true);
    expect(channelHasLinkedNode({})).toBe(false);
    expect(linkedNodeBadges(nodes)).toEqual([
      { label: 'AllStar', text: 'AllStar 5517' },
      { label: 'WIRES', text: 'WIRES 1234' },
    ]);
  });
});
