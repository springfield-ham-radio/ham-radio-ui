import { describe, expect, it } from 'vitest';
import {
  anchorIdIfStillVisible,
  applyMacRowSelection,
  pruneRowSelection,
  type MacRowSelectionState,
} from '../../app/utils/mac-row-selection.ts';

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

  it('moves the anchor on a plain click and leaves the selection unchanged', () => {
    const next = applyMacRowSelection(orderedIds, selection(['2', '4'], '2'), '6', {
      shiftKey: false,
      metaKey: false,
    });

    expect(next).toEqual(selection(['2', '4'], '6'));
  });

  it('toggles a row on with Control-click and moves the anchor', () => {
    const next = applyMacRowSelection(orderedIds, selection(['2'], '2'), '4', {
      shiftKey: false,
      metaKey: false,
      ctrlKey: true,
    });

    expect(next).toEqual(selection(['2', '4'], '4'));
  });

  it('toggles a row off with Control-click', () => {
    const next = applyMacRowSelection(orderedIds, selection(['2', '4'], '4'), '2', {
      shiftKey: false,
      metaKey: false,
      ctrlKey: true,
    });

    expect(next).toEqual(selection(['4'], '2'));
  });

  it('adds a range on Shift-Control-click without clearing other rows', () => {
    const next = applyMacRowSelection(orderedIds, selection(['1', '2'], '2'), '5', {
      shiftKey: true,
      metaKey: false,
      ctrlKey: true,
    });

    expect(next).toEqual(selection(['1', '2', '3', '4', '5'], '2'));
  });

  it('selects the range in the given visible order', () => {
    const next = applyMacRowSelection(['10', '2', '3', '4'], selection(['10'], '10'), '3', {
      shiftKey: true,
      metaKey: false,
    });

    expect(next).toEqual(selection(['10', '2', '3'], '10'));
  });

  it('ignores an anchor that is no longer in the list', () => {
    const next = applyMacRowSelection(orderedIds, selection(['2'], '9'), '4', {
      shiftKey: true,
      metaKey: false,
    });

    expect(next).toEqual(selection(['4'], '4'));
  });
});

describe('anchorIdIfStillVisible', () => {
  it('keeps the anchor when a sort still shows that row', () => {
    expect(anchorIdIfStillVisible('2', ['5', '4', '2', '1'])).toBe('2');
  });

  it('clears the anchor when a filter drops that row', () => {
    expect(anchorIdIfStillVisible('2', ['1', '3'])).toBeUndefined();
  });

  it('stays empty when there was no anchor', () => {
    expect(anchorIdIfStillVisible(undefined, ['1', '2'])).toBeUndefined();
  });
});

describe('pruneRowSelection', () => {
  it('drops selection for rows that are no longer visible', () => {
    expect(pruneRowSelection({ '6': true, '10': true }, ['0', '10'])).toEqual({ '10': true });
  });

  it('returns an empty record when nothing is selected', () => {
    expect(pruneRowSelection({}, ['0', '1'])).toEqual({});
  });
});
