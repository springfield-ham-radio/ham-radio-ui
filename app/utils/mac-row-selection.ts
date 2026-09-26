export interface MacSelectionModifiers {
  shiftKey: boolean;
  metaKey: boolean;
}

export interface MacRowSelectionState {
  selected: Record<string, boolean>;
  /** Row that a later Shift-click ranges from. Unchanged by Shift-click. */
  anchorId?: string;
}

/**
 * macOS list selection for one click.
 *
 * Command-click toggles the clicked row and moves the anchor.
 * Shift-click selects every row from the anchor through the clicked row.
 * Shift-Command-click adds that range and leaves other selected rows selected.
 * With no anchor, Shift-click selects only the clicked row and anchors there.
 */
export function applyMacRowSelection(
  orderedIds: readonly string[],
  state: MacRowSelectionState,
  clickedId: string,
  modifiers: MacSelectionModifiers,
): MacRowSelectionState {
  const selected = new Set(selectedIds(state.selected));

  if (modifiers.metaKey && !modifiers.shiftKey) {
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

    if (modifiers.metaKey) {
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

  return state;
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
