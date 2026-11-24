# Guided menu capture session per radio card

**Status:** proposed  
**Date:** 2026-11-24  
**Related:** [0020](./0020-short-option-toggle-group.md), [0005](./0005-radio-memory-undo.md), [0009](./0009-per-radio-modules.md)

## Context

Driver authors need byte-level evidence when a front-panel menu changes clone memory. The developer Driver Debug tab already reads two clones and lists raw byte differences, but it is not tied to a saved radio, does not isolate one menu change per step, does not restore the radio, and does not export a file operators can email. Automatic read backups under app data `backups/` are pruned and must not hold a capture baseline.

Operators need a guided, non-AI flow: baseline read, change one menu at a time, diff each read against the previous image, restore the original baseline to the radio, verify, and save a `.hmenucap` zip for the driver maintainer.

## Decision

- Add a **Menu capture** tab on each `RadioCard` (`RadioWorkspace`) with a `UStepper` wizard. Capture reads and the final restore use dedicated `useRadio` helpers that do **not** replace the open editor `memory` until restore verification succeeds.
- Persist each session under app data `menu-captures/<savedRadioId>/` (`session.json`, immutable `baseline.img`, `step-NNN.img`). This directory is not subject to backup retention.
- Diff engine lives in `app/utils/menu-capture.ts`. Each captured step compares the new read to the **previous** image (baseline for step 1). Empty diff and wide diff (`> 8` bytes or `> 1` run) are warnings; the operator can redo a step.
- **Ignore list:** only `capture.ignore` declared in the radio module JSON. No hardcoded offsets in HamBench. When catalog hydration drops unknown keys, read `capture` from the raw module file beside the install path.
- Annotate differing bytes with memory-map field hits (`collectCodecByteHits`). Bitfields are listed only when their bits change.
- **Port blocking:** for the life of an active session, hold the programming port for that card only (`beginRadioTransfer`, memory port holder). Other cards on other ports continue. Normal Read/Write/CAT/APRS on that card are disabled until the session ends or is discarded.
- **Restore:** confirm dialog, write `baseline.img` back to the radio. Before that write, save a **prewrite** backup under app data `backups/` with the same naming and retention as a normal Write. When the session has at least one **kept** step, that backup is a **copy of the latest `step-NNN.img`** (the radio as it was after the last kept menu change) — no extra backup read. When there is no kept step, or the step image cannot be loaded, fall back to the normal fresh pre-write backup read. The card **Write** button keeps its existing pre-write backup behavior unchanged. After the restore write, perform the verification read (compared to baseline ignoring `capture.ignore`). When verification matches, **refresh** the card `radioBaseline` and `session.memory` from that verified image so the programming session matches the radio again.
- **Export:** operator saves a `.hmenucap` zip (`schemaVersion` 1, `capture.json`, `images/`) locally. No upload.
- Developer Driver Debug clone reads refuse when the same port is held by an active capture session.

## Consequences

- Kenwood TH-D74 (and others) should publish `capture.ignore` in the module repo; until then volatile bytes may flag wide diffs or fail verification.
- Large clone images ship inside the zip; `capture.json` carries annotated diffs so maintainers can map fields without opening every image.
- PR 1 lands the pure engine, tests, and this ADR. PR 2 lands Tauri session I/O, the wizard UI, restore, and export.