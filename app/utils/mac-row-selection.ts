export interface MacSelectionModifiers {
  shiftKey: boolean;
  metaKey: boolean;
  /** Windows and Linux use Control the same way macOS uses Command. */
  ctrlKey?: boolean;
}

export interface MacRowSelectionState {
  selected: Record<string, boolean>;
  /** Row that a later Shift-click ranges from. Unchanged by Shift-click. */
  anchorId?: string;
}

/**
 * List selection for one click. `orderedIds` is the current visible order
 * (sort and filter already applied).
 *
 * A plain click leaves the selection alone and moves the anchor.
 * Command-click or Control-click toggles the clicked row and moves the anchor.
 * Shift-click selects every row from the anchor through the clicked row.
 * Shift plus Command or Control adds that range and leaves other selected rows selected.
 * With no anchor, Shift-click selects only the clicked row and anchors there.
 */
export function applyMacRowSelection(
  orderedIds: readonly string[],
  state: MacRowSelectionState,
  clickedId: string,
  modifiers: MacSelectionModifiers,
): MacRowSelectionState {
  const selected = new Set(selectedIds(state.selected));
  const togglesOneRow = modifiers.metaKey || modifiers.ctrlKey === true;

  if (togglesOneRow && !modifiers.shiftKey) {
    if (selected.has(clickedId)) {
      selected.delete(clickedId);
    } else {
      selected.add(clickedId);
    }

    return {
      selected: selectionRecord(selected),
      anchorId: clickedId,
    };
  }

  if (modifiers.shiftKey) {
    const anchorId = state.anchorId !== undefined && orderedIds.includes(state.anchorId) ? state.anchorId : clickedId;
    const range = idsInRange(orderedIds, anchorId, clickedId);

    if (togglesOneRow) {
      for (const id of range) {
        selected.add(id);
      }

      return {
        selected: selectionRecord(selected),
        anchorId,
      };
    }

    return {
      selected: selectionRecord(range),
      anchorId,
    };
  }

  return {
    selected: selectionRecord(selected),
    anchorId: clickedId,
  };
}

function selectedIds(selected: Record<string, boolean>): string[] {
  return Object.entries(selected)
    .filter(([, isSelected]) => isSelected)
    .map(([id]) => id);
}

function selectionRecord(ids: Iterable<string>): Record<string, boolean> {
  const selected: Record<string, boolean> = {};

  for (const id of ids) {
    selected[id] = true;
  }

  return selected;
}

function idsInRange(orderedIds: readonly string[], anchorId: string, clickedId: string): string[] {
  const anchorIndex = orderedIds.indexOf(anchorId);
  const clickedIndex = orderedIds.indexOf(clickedId);

  if (anchorIndex === -1 || clickedIndex === -1) {
    return [clickedId];
  }

  const start = Math.min(anchorIndex, clickedIndex);
  const end = Math.max(anchorIndex, clickedIndex);
  return orderedIds.slice(start, end + 1);
}

/**
 * Anchor after the visible rows change.
 * Kept when that row is still shown, including after a sort, so the next
 * Shift-click uses the new order. Cleared when a filter removes the row.
 */
export function anchorIdIfStillVisible(
  anchorId: string | undefined,
  visibleIds: readonly string[],
): string | undefined {
  if (anchorId !== undefined && visibleIds.includes(anchorId)) {
    return anchorId;
  }

  return undefined;
}

/**
 * Drop selection keys that are not in the current table row id list.
 */
export function pruneRowSelection(
  selected: Record<string, boolean>,
  visibleIds: readonly string[],
): Record<string, boolean> {
  const visible = new Set(visibleIds);
  const pruned: Record<string, boolean> = {};

  for (const [id, isSelected] of Object.entries(selected)) {
    if (isSelected && visible.has(id)) {
      pruned[id] = true;
    }
  }

  return pruned;
}
