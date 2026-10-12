export const CHANNEL_TABLE_TBODY_CLASS = 'channel-table-tbody';

/**
 * The channel table tbody inside one radio card root (not document-wide querySelector).
 */
export function channelTableTbodyFromRoot(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>(`.${CHANNEL_TABLE_TBODY_CLASS}`);
}
