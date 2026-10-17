import { describe, expect, it, vi } from 'vitest';
import {
  dispatchEditUndoRedo,
  editUndoRedoRoute,
  isTextEditingTarget,
  radioMemoryShortcutAction,
} from '../../app/utils/radio-memory-shortcuts.ts';

function mockElement(
  tagName: string,
  options: { contentEditable?: boolean; closest?: Element | null } = {},
): HTMLElement {
  return {
    tagName,
    isContentEditable: options.contentEditable ?? false,
    closest: () => options.closest ?? null,
  } as HTMLElement;
}

function keyboardEvent(
  init: Partial<KeyboardEvent> & { key: string; target?: EventTarget | null },
): KeyboardEvent {
  return {
    key: init.key,
    metaKey: init.metaKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    shiftKey: init.shiftKey ?? false,
    altKey: init.altKey ?? false,
    target: init.target ?? mockElement('BODY'),
    preventDefault() {},
  } as KeyboardEvent;
}

describe('radio memory shortcuts', () => {
  it('treats inputs and contenteditable as text editing targets', () => {
    const input = mockElement('INPUT');
    const textarea = mockElement('TEXTAREA');
    const editable = mockElement('DIV', { contentEditable: true });
    const nestedInput = mockElement('INPUT');
    const wrapper = {
      tagName: 'DIV',
      isContentEditable: false,
      closest: () => nestedInput,
    } as HTMLElement;

    expect(isTextEditingTarget(input)).toBe(true);
    expect(isTextEditingTarget(textarea)).toBe(true);
    expect(isTextEditingTarget(editable)).toBe(true);
    expect(isTextEditingTarget(nestedInput)).toBe(true);
    expect(isTextEditingTarget(wrapper)).toBe(true);
    expect(isTextEditingTarget(mockElement('DIV'))).toBe(false);
  });

  it('routes edit undo to text or memory from focus', () => {
    const input = mockElement('INPUT');

    expect(editUndoRedoRoute(input)).toBe('text');
    expect(editUndoRedoRoute(mockElement('BODY'))).toBe('memory');
  });

  it('dispatches to exactly one of text or memory handlers', () => {
    const input = mockElement('INPUT');
    const textUndo = vi.fn(() => true);
    const memoryUndo = vi.fn();

    expect(
      dispatchEditUndoRedo('undo', input, {
        textUndoRedo: textUndo,
        memoryUndoRedo: memoryUndo,
      }),
    ).toBe(true);
    expect(textUndo).toHaveBeenCalledOnce();
    expect(memoryUndo).not.toHaveBeenCalled();

    textUndo.mockClear();
    memoryUndo.mockClear();

    expect(
      dispatchEditUndoRedo('undo', mockElement('BODY'), {
        textUndoRedo: textUndo,
        memoryUndoRedo: memoryUndo,
        canMemoryUndo: () => true,
      }),
    ).toBe(true);
    expect(textUndo).not.toHaveBeenCalled();
    expect(memoryUndo).toHaveBeenCalledOnce();
  });

  it('skips memory undo when the stack is empty', () => {
    const memoryUndo = vi.fn();

    expect(
      dispatchEditUndoRedo('undo', mockElement('BODY'), {
        textUndoRedo: () => true,
        memoryUndoRedo: memoryUndo,
        canMemoryUndo: () => false,
      }),
    ).toBe(false);
    expect(memoryUndo).not.toHaveBeenCalled();
  });

  it('maps standard undo and redo chords for browser keydown fallback', () => {
    expect(radioMemoryShortcutAction(keyboardEvent({ key: 'z', metaKey: true }))).toBe('undo');
    expect(radioMemoryShortcutAction(keyboardEvent({ key: 'z', ctrlKey: true }))).toBe('undo');
    expect(radioMemoryShortcutAction(keyboardEvent({ key: 'Z', metaKey: true, shiftKey: true }))).toBe('redo');
    expect(radioMemoryShortcutAction(keyboardEvent({ key: 'y', ctrlKey: true }))).toBe('redo');
    expect(radioMemoryShortcutAction(keyboardEvent({ key: 'z', metaKey: true, altKey: true }))).toBeUndefined();
  });
});
