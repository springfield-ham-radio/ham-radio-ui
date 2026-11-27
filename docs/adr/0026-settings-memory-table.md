# Settings memory channel table

**Status:** accepted  
**Date:** 2026-11-26  
**Related:** [radio-module-kenwood#65](https://github.com/springfield-ham-radio/radio-module-kenwood/pull/65)

## Context

Kenwood clone maps expose some front-panel menus as two repeated ASCII structs (name and code) with `count` greater than one, for example TH-D74 menus 163 and 164 and TM-D710 menu 301. `collectMemoryMapUiFields` expands each struct into separate text fields labeled `Name 1` through `Name 10` interleaved with codes in the two-column settings grid. That layout is hard to scan and uses 1-based row labels while the radio numbers channels 0 through 9.

HamBench already folds other multi-field patterns in the settings layout layer (`ui.record` tabs, `ui.composite` coordinates, boolean switch groups by menu number) without extra driver metadata.

## Decision

When every field in a settings section that shares a menu number is a repeated `text` widget with the same channel indices, HamBench folds them into one full-width **memory table** cell:

- Heading: menu number and `ui.menu.code` (same rules as a switch group; the menu number stays visible even when global menu numbers are hidden).
- Rows: `Ch 0` … `Ch N` using each field’s `arrayIndex` (0-based radio channel).
- Columns: `Name` before `Code` when `fieldId` is `name` and `code`; other columns follow `ui.order`.
- Field paths, validation, dirty tracking, and help tooltips stay per path (`dtmfMemoryCodes.0.code`, and so on).

Detection is HamBench-only in `settings-memory-table.ts`, wired through `layoutPlainSettingsFields`. No memory-map schema change.

Write review labels use `Ch N · Column` instead of the flattened `Name N` suffix.

## Consequences

- TM-D710 menu 301 and TH-D74 menus 163–164 gain compact tables without driver edits beyond what the maps already declare.
- Repeated text lists on other menus fold automatically when they match the rule; integer pairs, single columns, and mixed widget types stay on the grid.
- Future maps that need a different column order or 1-based labels would need a new `ui` hint and a utils schema release; this ADR documents that we intentionally avoided that for Kenwood DTMF/EchoLink memories.