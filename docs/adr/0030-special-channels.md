# Memory-map special channels in HamBench

**Status:** proposed  
**Date:** 2026-11-27  
**Related:** [ham-radio-docs ADR 0013](https://github.com/springfield-ham-radio/ham-radio-docs/pull/39) (`docs/developer/adr/0013-memory-map-special-channels.md`), [ham-radio-api#42](https://github.com/springfield-ham-radio/ham-radio-api/pull/42), [ham-radio-utils#51](https://github.com/springfield-ham-radio/ham-radio-utils/pull/51)

## Context

Some radios place extra channel records after the main 0-based block in the same struct array (Kenwood TH-D74: regular 0–999, then scan-edge pairs L0/U0 … L49/U49 at 1000–1099 and Pri at 1100). The memory map can declare these with optional `channelBindings.specials { start, labels[] }`. Regular HamBench channel operations must never treat specials as tail slots for insert, shift, or drag. Specials need their own list section, fixed labels, and editors without band or offset pairing rules.

## Decision

- Use `@springfield/ham-radio-utils` helpers (`memoryMapRegularChannelCapacity`, `memoryMapSpecialChannelLabel`, `isSpecialChannelIndex`, `memoryMapChannelRecordCount`) for all capacity and labeling.
- Cap add, move, reorder, library fill, and typed slot edits at **regular** capacity; refuse shifts that would cross into specials the same way full memory is refused today.
- Render programmed regular channels as today; add a **Special channels** block below with one row per declared label. Show label in the slot column (not 1000+), lock slot edits and drag, support program/clear via the same channel editor.
- Skip band and L&lt;U validation for special indices.
- On encode, preserve bytes only for special indices that were empty in the loaded image and remain unprogrammed, so `clearEmpty` does not wipe factory-empty special slots.

Radios without `specials` metadata keep current behavior.

## Consequences

- HamBench temporarily pins `ham-radio-api` and `ham-radio-utils` to feature branches until releases include `specials` types and helpers.
- Channel table UI splits into regular (sortable) and special (static) regions when metadata is present.
- Encode preservation lives in HamBench until utils gains first-class special-slot handling in `encodeMemoryMap`.