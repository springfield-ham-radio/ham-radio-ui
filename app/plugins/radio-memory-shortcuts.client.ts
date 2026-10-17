import { radioMemoryShortcutAction } from '~/utils/radio-memory-shortcuts';

export default defineNuxtPlugin(() => {
  if (!import.meta.client) {
    return;
  }

  const { focusedCardId } = useRadioBoard();
  const { undoMemoryEdit, redoMemoryEdit, canUndoMemory, canRedoMemory, memoryUndoLabel, memoryRedoLabel } = useRadio();

  function runMemoryShortcut(action: 'undo' | 'redo'): void {
    const id = focusedCardId.value;

    if (!id) {
      return;
    }

    if (action === 'undo') {
      if (!canUndoMemory.value) {
        return;
      }

      undoMemoryEdit(id);
      return;
    }

    if (!canRedoMemory.value) {
      return;
    }

    redoMemoryEdit(id);
  }

  window.addEventListener('keydown', (event) => {
    const action = radioMemoryShortcutAction(event);

    if (!action) {
      return;
    }

    const id = focusedCardId.value;

    if (!id) {
      return;
    }

    if (action === 'undo' && !canUndoMemory.value) {
      return;
    }

    if (action === 'redo' && !canRedoMemory.value) {
      return;
    }

    event.preventDefault();
    runMemoryShortcut(action);
  });

  void (async () => {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      const { invoke } = await import('@tauri-apps/api/core');

      await listen('undo-memory', () => {
        runMemoryShortcut('undo');
      });

      await listen('redo-memory', () => {
        runMemoryShortcut('redo');
      });

      watchEffect(() => {
        void invoke('set_radio_memory_menu_state', {
          undoEnabled: canUndoMemory.value,
          redoEnabled: canRedoMemory.value,
          undoTitle: memoryUndoLabel.value ? `Undo ${memoryUndoLabel.value}` : 'Undo Memory',
          redoTitle: memoryRedoLabel.value ? `Redo ${memoryRedoLabel.value}` : 'Redo Memory',
        }).catch(() => {
          // Older desktop builds do not expose memory menu commands yet.
        });
      });
    } catch {
      // Browser build without the Tauri runtime.
    }
  })();
});
