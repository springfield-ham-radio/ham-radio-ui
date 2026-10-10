/**
 * Linked systems stored on a repeater row.
 *
 * A system is present when a node number is known or when RepeaterBook `Modes`
 * (or `Digital Access`, when that cell names a system) lists it. RepeaterBook's
 * export field list uses `AllStar Node`, `EchoLink Node`, `IRLP Node`, and
 * `Wires Node`. A website CSV export uses the shorter headers `AllStar`,
 * `EchoLink`, and `IRLP`. `0` and blank mean no node number, which is not the
 * same as the system being absent.
 */
export interface LinkedNodes {
  allstarNode?: string;
  echolinkNode?: string;
  irlpNode?: string;
  wiresNode?: string;
  /** True when the repeater is on AllStar, even if the node number is unknown. */
  allstar?: boolean;
  /** True when the repeater is on EchoLink, even if the node number is unknown. */
  echolink?: boolean;
  /** True when the repeater is on IRLP, even if the node number is unknown. */
  irlp?: boolean;
  /** True when the repeater is on WIRES, even if the node number is unknown. */
  wires?: boolean;
}

export const LINKED_NODE_BADGES = [
  { field: 'allstarNode', present: 'allstar', label: 'AllStar' },
  { field: 'echolinkNode', present: 'echolink', label: 'EchoLink' },
  { field: 'irlpNode', present: 'irlp', label: 'IRLP' },
  { field: 'wiresNode', present: 'wires', label: 'WIRES' },
] as const satisfies ReadonlyArray<{
  field: 'allstarNode' | 'echolinkNode' | 'irlpNode' | 'wiresNode';
  present: 'allstar' | 'echolink' | 'irlp' | 'wires';
  label: string;
}>;

const REPEATERBOOK_NODE_HEADERS = [
  'allstar_node',
  'allstar',
  'echolink_node',
  'echolink',
  'irlp_node',
  'irlp',
  'wires_node',
] as const;

const REPEATERBOOK_LINKED_TEXT_HEADERS = ['modes', 'mode', 'digital_access'] as const;

const LINKED_SYSTEM_WORDS = [
  { present: 'allstar', pattern: /\ballstar\b/i },
  { present: 'echolink', pattern: /\becholink\b/i },
  { present: 'irlp', pattern: /\birlp\b/i },
  { present: 'wires', pattern: /\bwires(?:-x)?\b/i },
] as const satisfies ReadonlyArray<{
  present: 'allstar' | 'echolink' | 'irlp' | 'wires';
  pattern: RegExp;
}>;

export interface MergeLinkedNodesOptions {
  /** When true, a blank or zero node column replaces the stored number. */
  replaceNumbers: boolean;
  /** When true, presence flags on the incoming row replace stored presence. */
  replacePresence: boolean;
}

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
 * Word match for AllStar, EchoLink, IRLP, and WIRES (including WIRES-X / Wires).
 * Numeric access codes do not match.
 */
export function linkedSystemsInText(
  value: string | null | undefined,
): Pick<LinkedNodes, 'allstar' | 'echolink' | 'irlp' | 'wires'> {
  const text = value ?? '';

  return {
    allstar: LINKED_SYSTEM_WORDS[0].pattern.test(text),
    echolink: LINKED_SYSTEM_WORDS[1].pattern.test(text),
    irlp: LINKED_SYSTEM_WORDS[2].pattern.test(text),
    wires: LINKED_SYSTEM_WORDS[3].pattern.test(text),
  };
}

/**
 * Whether a RepeaterBook header includes any known node column.
 */
export function repeaterBookNodeColumnsPresent(header: readonly string[]): boolean {
  return REPEATERBOOK_NODE_HEADERS.some((name) => header.includes(name));
}

/**
 * Whether a RepeaterBook header includes text that can name a linked system.
 */
export function repeaterBookLinkedTextColumnsPresent(header: readonly string[]): boolean {
  return REPEATERBOOK_LINKED_TEXT_HEADERS.some((name) => header.includes(name));
}

/**
 * A node number implies the system is present. Flags apply only to repeater rows.
 */
export function linkedNodesForKind(kind: string, nodes: LinkedNodes | undefined): LinkedNodes {
  if (kind !== 'repeater' || !nodes) {
    return emptyLinkedNodes();
  }

  return normalizeLinkedNodes(nodes);
}

export function normalizeLinkedNodes(nodes: LinkedNodes | undefined): LinkedNodes {
  const allstarNode = parseLinkedNode(nodes?.allstarNode);
  const echolinkNode = parseLinkedNode(nodes?.echolinkNode);
  const irlpNode = parseLinkedNode(nodes?.irlpNode);
  const wiresNode = parseLinkedNode(nodes?.wiresNode);

  return {
    allstarNode,
    echolinkNode,
    irlpNode,
    wiresNode,
    allstar: Boolean(nodes?.allstar) || Boolean(allstarNode),
    echolink: Boolean(nodes?.echolink) || Boolean(echolinkNode),
    irlp: Boolean(nodes?.irlp) || Boolean(irlpNode),
    wires: Boolean(nodes?.wires) || Boolean(wiresNode),
  };
}

function emptyLinkedNodes(): LinkedNodes {
  return {
    allstarNode: undefined,
    echolinkNode: undefined,
    irlpNode: undefined,
    wiresNode: undefined,
    allstar: false,
    echolink: false,
    irlp: false,
    wires: false,
  };
}

export function channelHasLinkedNode(nodes: LinkedNodes | undefined): boolean {
  const stored = linkedNodesForKind('repeater', nodes);
  return Boolean(stored.allstar || stored.echolink || stored.irlp || stored.wires);
}

/**
 * Keep an existing node when the import did not include node columns.
 * Presence is replaced only when the source named linked systems or node columns.
 * A kept or incoming node number still counts as present.
 */
export function mergeLinkedNodes(
  incoming: LinkedNodes,
  existing: LinkedNodes,
  replace: boolean | MergeLinkedNodesOptions,
): LinkedNodes {
  const options: MergeLinkedNodesOptions =
    typeof replace === 'boolean' ? { replaceNumbers: replace, replacePresence: replace } : replace;
  const numbers = {
    allstarNode: options.replaceNumbers
      ? parseLinkedNode(incoming.allstarNode)
      : parseLinkedNode(incoming.allstarNode) ?? parseLinkedNode(existing.allstarNode),
    echolinkNode: options.replaceNumbers
      ? parseLinkedNode(incoming.echolinkNode)
      : parseLinkedNode(incoming.echolinkNode) ?? parseLinkedNode(existing.echolinkNode),
    irlpNode: options.replaceNumbers
      ? parseLinkedNode(incoming.irlpNode)
      : parseLinkedNode(incoming.irlpNode) ?? parseLinkedNode(existing.irlpNode),
    wiresNode: options.replaceNumbers
      ? parseLinkedNode(incoming.wiresNode)
      : parseLinkedNode(incoming.wiresNode) ?? parseLinkedNode(existing.wiresNode),
  };

  const present = (
    flag: 'allstar' | 'echolink' | 'irlp' | 'wires',
    node: string | undefined,
  ): boolean => {
    if (options.replacePresence) {
      return Boolean(incoming[flag]) || Boolean(node);
    }

    return Boolean(incoming[flag]) || Boolean(existing[flag]) || Boolean(node);
  };

  return {
    ...numbers,
    allstar: present('allstar', numbers.allstarNode),
    echolink: present('echolink', numbers.echolinkNode),
    irlp: present('irlp', numbers.irlpNode),
    wires: present('wires', numbers.wiresNode),
  };
}

export function linkedNodesEqual(left: LinkedNodes, right: LinkedNodes): boolean {
  const a = normalizeLinkedNodes(left);
  const b = normalizeLinkedNodes(right);

  return (
    a.allstarNode === b.allstarNode &&
    a.echolinkNode === b.echolinkNode &&
    a.irlpNode === b.irlpNode &&
    a.wiresNode === b.wiresNode &&
    a.allstar === b.allstar &&
    a.echolink === b.echolink &&
    a.irlp === b.irlp &&
    a.wires === b.wires
  );
}

export function linkedNodeSearchText(nodes: LinkedNodes | undefined): string {
  const stored = linkedNodesForKind('repeater', nodes);

  return LINKED_NODE_BADGES.map((badge) => {
    if (!stored[badge.present]) {
      return '';
    }

    const node = stored[badge.field];
    return node ? `${badge.label} ${node}` : badge.label;
  })
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function linkedNodeBadges(nodes: LinkedNodes | undefined): Array<{ label: string; text: string }> {
  const stored = linkedNodesForKind('repeater', nodes);

  return LINKED_NODE_BADGES.flatMap((badge) => {
    if (!stored[badge.present]) {
      return [];
    }

    const node = stored[badge.field];
    const text = node ? `${badge.label} ${node}` : badge.label;
    return [{ label: text, text }];
  });
}

export function formatLinkedPresence(present: boolean | undefined): string {
  return present ? '1' : '0';
}

export function parseLinkedPresence(value: string | null | undefined): boolean {
  return /^(1|yes|true|y)$/i.test(value?.trim() ?? '');
}
