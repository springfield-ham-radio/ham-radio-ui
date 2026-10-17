# Radio memory undo and redo

**Status:** accepted  
**Date:** 2026-10-17  
**Related:** [#64](https://github.com/springfield-ham-radio/ham-radio-ui/issues/64)

This is a ham-radio-ui record. It does not share a number with [ham-radio-docs ADR 0010](https://github.com/springfield-ham-radio/ham-radio-docs/blob/main/docs/developer/adr/0010-local-beta-driver-zips.md). The docs catalog lists repository ADRs by example, so this record stays here.

## Context

Edits to an open radio’s clone memory (channels, settings, reorder, library replace) go through `persistProgram` in `useRadio.ts`. There is no way to step backward without re-reading the radio or re-opening a file without a dedicated history stack.

## Decision

- Keep a **per radio card** history of `RadioProgram` snapshots (channels and settings), capped at 100 steps. Do not store encoded images or inverse patches.
- Record a snapshot **before** each `persistProgram` edit. Undo and redo call `persistProgram` with history recording disabled so the existing encode queue updates `memory`.
- Clear history when a card loads a new image (read, open memory, restore backup) or when the card session is cleared. Save and write do not clear the stack.
- **Clean** index: set when memory is loaded and when a memory file save succeeds. The card shows “Unsaved” when the current index differs from the clean index. Undo back to the clean index clears unsaved.
- **UI (PR 1):** Undo and Redo buttons on the radio workspace Channels toolbar with tooltips from the history labels.
- **Shortcuts (PR 2):** Edit → **Undo** / **Redo** are custom menu items (Cmd/Ctrl+Z; Shift+Cmd/Ctrl+Z on macOS, Ctrl+Y redo on Windows) that emit to the webview. The handler runs `document.execCommand` when focus is in a text field; otherwise it undoes/redoes the **focused radio card**. The Tauri shell owns those accelerators so macOS delivers them to the app. Browser builds use the same routing on `keydown`. Radio menu **Undo Memory** / **Redo Memory** use Cmd/Ctrl+Alt+Z and Cmd/Ctrl+Alt+Shift+Z for memory-only shortcuts.
- **Live CAT** is out of scope; CAT commands are not stored in the clone image.
- **ADR status** moves to `accepted` when PR 2 lands.

## Consequences

- Edit → Undo/Redo are context-aware: text fields use `execCommand`; the channel table and other non-field focus use the memory stack. Radio → Undo Memory always targets memory.
- History is in-memory only; it is not persisted in memory JSON files.
- Re-encoding on undo matches any other edit and may be slightly slower on very large images, which remain small for supported clone radios.
