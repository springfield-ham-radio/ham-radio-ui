import { describe, expect, it } from 'vitest';
import { applyMacRowSelection, type MacRowSelectionState } from '../../app/utils/mac-row-selection.ts';

const orderedIds = ['1', '2', '3', '4', '5', '6'];

function selection(ids: string[], anchorId?: string): MacRowSelectionState {
  return {
    selected: Object.fromEntries(ids.map((id) => [id, true])),
    anchorId,
  };
}

describe('applyMacRowSelection', () => {
  it('toggles a row on with Command-click and moves the anchor', () => {
    const next = applyMacRowSelection(orderedIds, selection(['2'], '2'), '4', {
      shiftKey: false,
      metaKey: true,
    });

    expect(next).toEqual(selection(['2', '4'], '4'));
  });

  it('toggles a row off with Command-click and leaves the rest selected', () => {
    const next = applyMacRowSelection(orderedIds, selection(['2', '4'], '4'), '2', {
      shiftKey: false,
      metaKey: true,
    });

    expect(next).toEqual(selection(['4'], '2'));
  });

  it('selects the inclusive range on Shift-click and keeps the anchor', () => {
    const next = applyMacRowSelection(orderedIds, selection(['2'], '2'), '5', {
      shiftKey: true,
      metaKey: false,
    });

    expect(next).toEqual(selection(['2', '3', '4', '5'], '2'));
  });

  it('shrinks the range when a later Shift-click is closer to the anchor', () => {
    const ranged = applyMacRowSelection(orderedIds, selection(['2'], '2'), '5', {
      shiftKey: true,
      metaKey: false,
    });
    const next = applyMacRowSelection(orderedIds, ranged, '3', {
      shiftKey: true,
      metaKey: false,
    });

    expect(next).toEqual(selection(['2', '3'], '2'));
  });

  it('selects upward from the anchor', () => {
    const next = applyMacRowSelection(orderedIds, selection(['5'], '5'), '2', {
      shiftKey: true,
      metaKey: false,
    });

    expect(next).toEqual(selection(['2', '3', '4', '5'], '5'));
  });

  it('selects only the clicked row when Shift-click has no anchor', () => {
    const next = applyMacRowSelection(orderedIds, selection([]), '3', {
      shiftKey: true,
      metaKey: false,
    });

    expect(next).toEqual(selection(['3'], '3'));
  });

  it('starts a new range from the row Command-clicked last', () => {
    const toggled = applyMacRowSelection(orderedIds, selection(['1', '2', '3'], '1'), '5', {
      shiftKey: false,
      metaKey: true,
    });
    const next = applyMacRowSelection(orderedIds, toggled, '6', {
      shiftKey: true,
      metaKey: false,
    });

    expect(next).toEqual(selection(['5', '6'], '5'));
  });

  it('adds a range on Shift-Command-click without clearing other rows', () => {
    const next = applyMacRowSelection(orderedIds, selection(['1', '2'], '2'), '5', {
      shiftKey: true,
      metaKey: true,
    });

    expect(next).toEqual(selection(['1', '2', '3', '4', '5'], '2'));
  });

  it('ignores an anchor that is no longer in the list', () => {
    const next = applyMacRowSelection(orderedIds, selection(['2'], '9'), '4', {
      shiftKey: true,
      metaKey: false,
    });

    expect(next).toEqual(selection(['4'], '4'));
  });
});
