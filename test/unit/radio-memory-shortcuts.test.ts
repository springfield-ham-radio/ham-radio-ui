import { describe, expect, it } from 'vitest';
import { isTextEditingTarget, radioMemoryShortcutAction } from '../../app/utils/radio-memory-shortcuts.ts';

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

  it('maps undo and redo chords outside text fields', () => {
    expect(radioMemoryShortcutAction(keyboardEvent({ key: 'z', metaKey: true }))).toBe('undo');
    expect(radioMemoryShortcutAction(keyboardEvent({ key: 'z', ctrlKey: true }))).toBe('undo');
    expect(radioMemoryShortcutAction(keyboardEvent({ key: 'Z', metaKey: true, shiftKey: true }))).toBe('redo');
    expect(radioMemoryShortcutAction(keyboardEvent({ key: 'y', ctrlKey: true }))).toBe('redo');
  });

  it('does not take memory shortcuts inside text fields or with alt modifiers', () => {
    const input = mockElement('INPUT');

    expect(radioMemoryShortcutAction(keyboardEvent({ key: 'z', metaKey: true, target: input }))).toBeUndefined();
    expect(radioMemoryShortcutAction(keyboardEvent({ key: 'z', metaKey: true, altKey: true }))).toBeUndefined();
    expect(radioMemoryShortcutAction(keyboardEvent({ key: 'a', metaKey: true }))).toBeUndefined();
  });
});
