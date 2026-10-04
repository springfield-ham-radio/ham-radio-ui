/**
 * Linked-system node numbers stored on a repeater row.
 *
 * RepeaterBook's export field list uses `AllStar Node`, `EchoLink Node`, `IRLP Node`,
 * and `Wires Node`. A website CSV export uses the shorter headers `AllStar`, `EchoLink`,
 * and `IRLP` (no WIRES column in that export). `0` and blank mean no node.
 */
export interface LinkedNodes {
  allstarNode?: string;
  echolinkNode?: string;
  irlpNode?: string;
  wiresNode?: string;
}

export const LINKED_NODE_BADGES = [
  { field: 'allstarNode', label: 'AllStar' },
  { field: 'echolinkNode', label: 'EchoLink' },
  { field: 'irlpNode', label: 'IRLP' },
  { field: 'wiresNode', label: 'WIRES' },
] as const satisfies ReadonlyArray<{ field: keyof LinkedNodes; label: string }>;

const REPEATERBOOK_NODE_HEADERS = [
  'allstar_node',
  'allstar',
  'echolink_node',
  'echolink',
  'irlp_node',
  'irlp',
  'wires_node',
] as const;

/**
 * A node cell is present only when it is non-blank and not zero.
 */
export function parseLinkedNode(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';

  if (!trimmed || /^0+(?:\.0+)?$/.test(trimmed)) {
    return undefined;
  }

  return trimmed;
}

/**
 * Whether a RepeaterBook header includes any known node column.
 */
export function repeaterBookNodeColumnsPresent(header: readonly string[]): boolean {
  return REPEATERBOOK_NODE_HEADERS.some((name) => header.includes(name));
}

/**
 * Node numbers apply only to repeater rows. Zero and blank are stored as none.
 */
export function linkedNodesForKind(kind: string, nodes: LinkedNodes | undefined): LinkedNodes {
  if (kind !== 'repeater' || !nodes) {
    return {};
  }

  return {
    allstarNode: parseLinkedNode(nodes.allstarNode),
    echolinkNode: parseLinkedNode(nodes.echolinkNode),
    irlpNode: parseLinkedNode(nodes.irlpNode),
    wiresNode: parseLinkedNode(nodes.wiresNode),
  };
}

export function channelHasLinkedNode(nodes: LinkedNodes | undefined): boolean {
  const stored = linkedNodesForKind('repeater', nodes);
  return Boolean(stored.allstarNode || stored.echolinkNode || stored.irlpNode || stored.wiresNode);
}

/**
 * Keep an existing node when the import did not include node columns.
 * When the source did include them, a blank or zero replaces the stored node.
 */
export function mergeLinkedNodes(incoming: LinkedNodes, existing: LinkedNodes, replace: boolean): LinkedNodes {
  if (replace) {
    return linkedNodesForKind('repeater', incoming);
  }

  return linkedNodesForKind('repeater', {
    allstarNode: incoming.allstarNode ?? existing.allstarNode,
    echolinkNode: incoming.echolinkNode ?? existing.echolinkNode,
    irlpNode: incoming.irlpNode ?? existing.irlpNode,
    wiresNode: incoming.wiresNode ?? existing.wiresNode,
  });
}

export function linkedNodesEqual(left: LinkedNodes, right: LinkedNodes): boolean {
  return (
    left.allstarNode === right.allstarNode &&
    left.echolinkNode === right.echolinkNode &&
    left.irlpNode === right.irlpNode &&
    left.wiresNode === right.wiresNode
  );
}

export function linkedNodeSearchText(nodes: LinkedNodes | undefined): string {
  const stored = linkedNodesForKind('repeater', nodes);
  return LINKED_NODE_BADGES.map((badge) => {
    const node = stored[badge.field];
    return node ? `${badge.label} ${node}` : '';
  })
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function linkedNodeBadges(nodes: LinkedNodes | undefined): Array<{ label: string; text: string }> {
  const stored = linkedNodesForKind('repeater', nodes);

  return LINKED_NODE_BADGES.flatMap((badge) => {
    const node = stored[badge.field];
    return node ? [{ label: badge.label, text: `${badge.label} ${node}` }] : [];
  });
}
