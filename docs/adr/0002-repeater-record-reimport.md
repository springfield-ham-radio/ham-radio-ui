# Repeater record fields and re-import matching

**Status:** accepted  
**Date:** 2026-10-10

## Context

RepeaterBook and CHIRP CSV imports already parsed city, county, state, modes, coordinates, and a stable identity, but the channel library stored most of that only inside `notes`. Re-import matched on transmit and receive frequency, so a tone or offset change could leave stale data or create duplicate rows. Operators need structured fields for search, a Location column, and distance sorting, plus predictable updates when they refresh an export.

Coordinates on `saved_channels` are defined in [0001-location-model.md](./0001-location-model.md) (GeoPoint as nullable `latitude` / `longitude` REAL columns, with the same unlocated rules at import and display boundaries). This ADR covers the repeater record columns and import merge policy only.

## Decision

**Structured record.** Repeater rows store `source_key`, `source_format`, `city`, `county`, `state`, `country`, `landmark`, `modes`, and `last_update` on `saved_channels` (migration 14). City, state, landmark, and modes are not folded into `notes` on new imports. RepeaterBook **Notes** and **Digital Access** (an access code, not a node) may still appear in `notes`. Existing notes that mixed location and modes are not parsed back: city text and modes are not reliable to split mechanically.

**Source key.** Match re-imports on `source_key` when present. RepeaterBook API-style exports use `rb:<state_id>:<rptr_id>`. Website exports without ids use `rb:<callsign>:<output_hz>:<location>`. CHIRP uses `chirp:<location-or-rx>:<rx>`. When a stored row has no key yet, the first import that supplies one stamps it; later imports follow the key. If there is still no key, fall back to `kind | callsign-or-name | transmit | receive`.

**What a match may overwrite.** Tones, offset (frequencies), use/on-air when the file supplies them, modes and location fields when the file’s header includes that column, linked-system flags and nodes per the existing linked-node merge rules, and coordinates only when the incoming row has a located pair (see 0001). **Name** and **notes** are always left as the operator stored them. A missing CSV column must not clear a value written by an earlier import (`recordColumns` flags).

**Duplicate keys in one file.** Rows that share a `source_key` in a single import collapse onto one library row (last row wins for mergeable fields; notes stay from the first matched row in that collapse chain).

**Last update.** When the export includes **Last Update**, store that string on the row. If only the date changes and it is newer than the stored value, treat the row as updated. Identical re-imports (including the same last-update string) report zero updated. When the file has no last-update column, set `last_update` to the import timestamp only when another stored field actually changes—not on intermediate duplicate-row merges inside one file.

**CHIRP.** CHIRP CSV has no city, state, or coordinates; those rows stay unlocated and document that limitation in the channel library docs.

## Consequences

- UI search, the Location column, and the repeater editor read structured fields instead of parsing `notes`.
- HamBench library CSV carries the new columns; older portable CSVs without them remain valid and must not wipe record fields on re-import.
- Future import work should extend `planLibraryImport` and `recordColumns` rather than ad-hoc updates in composables.
- Coordinate display and persistence must continue to use the helpers described in 0001, not duplicate Null Island handling here.

## Related

- ham-radio-ui [#57](https://github.com/springfield-ham-radio/ham-radio-ui/issues/57)
- [0001-location-model.md](./0001-location-model.md) (PR #84)
