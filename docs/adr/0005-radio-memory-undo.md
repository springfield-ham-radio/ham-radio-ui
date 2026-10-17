# Radio memory undo and redo

**Status:** accepted  
**Date:** 2026-10-17  
**Related:** [#64](https://github.com/springfield-ham-radio/ham-radio-ui/issues/64)

This is a ham-radio-ui record. It does not share a number with [ham-radio-docs ADR 0010](https://github.com/springfield-ham-radio/ham-radio-docs/blob/main/docs/developer/adr/0010-local-beta-driver-zips.md). The docs catalog lists repository ADRs by example, so this record stays here.

## Context

Edits to an open radio’s clone memory (channels, settings, reorder, library replace) go through `persistProgram` in `useRadio.ts`. There is no way to step backward without re-reading the radio or re-opening a file. The native Edit → Undo menu item only affects text fields in the webview.

## Decision

- Keep a **per radio card** history of `RadioProgram` snapshots (channels and settings), capped at 100 steps. Do not store encoded images or inverse patches.
- Record a snapshot **before** each `persistProgram` edit. Undo and redo call `persistProgram` with history recording disabled so the existing encode queue updates `memory`.
- Clear history when a card loads a new image (read, open memory, restore backup) or when the card session is cleared. Save and write do not clear the stack.
- **Clean** index: set when memory is loaded and when a memory file save succeeds. The card shows “Unsaved” when the current index differs from the clean index. Undo back to the clean index clears unsaved.
- **UI (PR 1):** Undo and Redo buttons on the radio workspace Channels toolbar with tooltips from the history labels.
- **Shortcuts (PR 2):** Webview Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z (plus Ctrl+Y redo on Windows) when focus is not in a text field. Radio menu **Undo Memory** / **Redo Memory** use Cmd/Ctrl+Alt+Z and Cmd/Ctrl+Alt+Shift+Z so Edit → Undo keeps Cmd/Ctrl+Z for text.
- **Live CAT** is out of scope; CAT commands are not stored in the clone image.
- **ADR status** moves to `accepted` when PR 2 lands.

## Consequences

- Memory undo is separate from text undo. Operators use workspace buttons (and later shortcuts) for channel edits.
- History is in-memory only; it is not persisted in memory JSON files.
- Re-encoding on undo matches any other edit and may be slightly slower on very large images, which remain small for supported clone radios.
