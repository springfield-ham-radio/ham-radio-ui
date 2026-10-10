import { describe, expect, it } from 'vitest';
import {
  channelHasLinkedNode,
  linkedNodeBadges,
  linkedSystemsInText,
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
      allstar: false,
      echolink: false,
      irlp: true,
      wires: false,
    });
    expect(mergeLinkedNodes(incoming, existing, false)).toEqual({
      allstarNode: '111',
      echolinkNode: '222',
      irlpNode: '7777',
      wiresNode: undefined,
      allstar: true,
      echolink: true,
      irlp: true,
      wires: false,
    });
  });

  it('keeps a stored node when Modes sets presence and the file has no node columns', () => {
    const merged = mergeLinkedNodes(
      { allstar: true, echolink: true, irlp: false, wires: false },
      { allstarNode: '111', echolink: true },
      { replaceNumbers: false, replacePresence: true },
    );

    expect(merged.allstarNode).toBe('111');
    expect(merged.allstar).toBe(true);
    expect(merged.echolink).toBe(true);
    expect(merged.echolinkNode).toBeUndefined();
    expect(merged.wires).toBe(false);
  });

  it('matches linked-system words and ignores numeric access codes', () => {
    expect(linkedSystemsInText('FM AllStar EchoLink P-25')).toEqual({
      allstar: true,
      echolink: true,
      irlp: false,
      wires: false,
    });
    expect(linkedSystemsInText('Fusion WIRES-X')).toMatchObject({ wires: true, allstar: false });
    expect(linkedSystemsInText('Wires')).toMatchObject({ wires: true });
    expect(linkedSystemsInText('1293')).toEqual({
      allstar: false,
      echolink: false,
      irlp: false,
      wires: false,
    });
    expect(linkedSystemsInText('293')).toMatchObject({ allstar: false, wires: false });
  });

  it('lists a badge for a linked system with or without a node number', () => {
    const nodes = { allstarNode: '5517', wires: true };

    expect(channelHasLinkedNode(nodes)).toBe(true);
    expect(channelHasLinkedNode({ allstar: true })).toBe(true);
    expect(channelHasLinkedNode({})).toBe(false);
    expect(linkedNodeBadges(nodes)).toEqual([
      { label: 'AllStar 5517', text: 'AllStar 5517', color: 'info' },
      { label: 'WIRES', text: 'WIRES', color: 'warning' },
    ]);
  });
});
