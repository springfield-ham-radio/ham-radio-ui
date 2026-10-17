export type RadioMemoryShortcutAction = 'undo' | 'redo';

export type EditUndoRedoRoute = 'text' | 'memory';

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

/** Whether Edit → Undo/Redo should affect the focused field or radio memory. */
export function editUndoRedoRoute(focusTarget: EventTarget | null): EditUndoRedoRoute {
  return isTextEditingTarget(focusTarget) ? 'text' : 'memory';
}

export interface EditUndoRedoHandlers {
  textUndoRedo: (action: RadioMemoryShortcutAction) => boolean;
  memoryUndoRedo: (action: RadioMemoryShortcutAction) => void;
  canMemoryUndo?: () => boolean;
  canMemoryRedo?: () => boolean;
}

/**
 * Route a standard undo/redo chord once. Returns true when an action ran.
 */
export function dispatchEditUndoRedo(
  action: RadioMemoryShortcutAction,
  focusTarget: EventTarget | null,
  handlers: EditUndoRedoHandlers,
): boolean {
  if (editUndoRedoRoute(focusTarget) === 'text') {
    return handlers.textUndoRedo(action);
  }

  if (action === 'undo' && handlers.canMemoryUndo && !handlers.canMemoryUndo()) {
    return false;
  }

  if (action === 'redo' && handlers.canMemoryRedo && !handlers.canMemoryRedo()) {
    return false;
  }

  handlers.memoryUndoRedo(action);
  return true;
}

/**
 * Memory undo/redo chord for browser builds (no Tauri Edit menu).
 * Returns undefined when the shortcut should fall through.
 */
export function radioMemoryShortcutAction(event: KeyboardEvent): RadioMemoryShortcutAction | undefined {
  if (!event.metaKey && !event.ctrlKey) {
    return undefined;
  }

  if (event.altKey) {
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
