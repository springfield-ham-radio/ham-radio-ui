# Kenwood band-indexed CAT (TH-D74)

**Status:** proposed  
**Date:** 2026-11-24  
**Related:** [CAT user guide](../cat.md)

## Context

Kenwood live CAT in HamBench is driven entirely by each radio module’s `cat` block. TM-D710A uses a 13-field `FO` VFO channel (`vfoChannel`). TH-F6 uses a single VFO with optional wake CR and bare `FQ`/`FO`/`MD` reads. The TH-D74 adds a third dialect: dual-band, band-first arguments on `FQ`/`MD`/`PC`, a one-field `BC` reply, optional `VM` activity, and a 21-field `FO` that must not be parsed for live control (mode set via `FO` returns `N`).

Dual-band profiles that omitted both `vfoChannel` and an explicit band dialect made the session poll with `BC n` band select and bare frequency/mode commands. That path does not match the D74 and would change the radio’s control band during poll.

## Decision

- Add optional `bandIndexed`, `bandModes`, `vfoModeCommand`, and `vfoModes` on `RadioCatConfig`. Hydrated JSON may carry these keys before `@springfield/ham-radio-registry` publishes the same type; HamBench mirrors the shape in `cat-capability.ts`.
- `kenwoodCatProfileFromConfig` requires dual-band Kenwood modules to set either `vfoChannel` or `bandIndexed`. It rejects both flags together and validates `bandModes` names against `modes`.
- When `bandIndexed` is true, poll and set use `FQ b`, `MD b`, and `PC b` (frequency set `FQ b,<width>`). The session does not send `BC b` to select a band during poll. `BC` with no arguments returns the control band; one field is a complete reply (TM-D710’s `BC 0,0` still works).
- `VM` is read-only state. Code `0` is editable VFO; other codes set a display label from `vfoModes` and disable frequency/mode/power editors. The session does not write `VM`.
- `bandModes` filters selectable mode names per band. CAT mode codes remain the index in the full `modes` array.
- Connect sends `ID` then `poll`; `BC` runs at the start of each poll when `bandControl` is set, not only on connect.

## Consequences

- radio-module-kenwood must ship an updated `kenwood-th-d74.json` `cat` block with `bandIndexed`, corrected `modes`, `frequencyCommands: ["FQ"]`, and `frequencyWidth: 10`. HamBench fails closed at profile resolution until that module is installed.
- Hold to transmit and station-log fill remain available on read-only VFO cards; only editors are disabled.
- Future dual-band Kenwood handhelds can declare `bandIndexed` without Vue or session model checks.