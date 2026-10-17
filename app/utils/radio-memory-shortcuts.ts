export type RadioMemoryShortcutAction = 'undo' | 'redo';

type EditableElement = {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => Element | null;
};

/** True when the event target is a field that should keep native text undo/redo. */
export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') {
    return false;
  }

  const element = target as EditableElement;

  if (element.isContentEditable) {
    return true;
  }

  const tag = element.tagName?.toUpperCase();

  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }

  if (typeof element.closest !== 'function') {
    return false;
  }

  return Boolean(
    element.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'),
  );
}

/**
 * Memory undo/redo chord for the focused radio card.
 * Returns undefined when the shortcut should fall through (text fields, unrelated keys).
 */
export function radioMemoryShortcutAction(event: KeyboardEvent): RadioMemoryShortcutAction | undefined {
  if (!event.metaKey && !event.ctrlKey) {
    return undefined;
  }

  if (event.altKey) {
    return undefined;
  }

  if (isTextEditingTarget(event.target)) {
    return undefined;
  }

  const key = event.key.toLowerCase();

  if (key === 'z' && !event.shiftKey) {
    return 'undo';
  }

  if (key === 'z' && event.shiftKey) {
    return 'redo';
  }

  if (key === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey) {
    return 'redo';
  }

  return undefined;
}
