# 0019 Settings coordinate composite parts

**Status:** accepted  
**Date:** 2025-11-23  
**Related:** [radio-module-kenwood#58](https://github.com/springfield-ham-radio/radio-module-kenwood/pull/58)

## Context

Radio module memory maps can mark several sibling settings fields as one logical coordinate by giving each field the same `ui.composite.id` with `kind: "coordinate"`. HamBench folds those fields into one degrees-and-minutes row in **Settings** instead of showing separate inputs for each byte.

Drivers such as the Kenwood TH-D74 also map latitude and longitude hemisphere as enum fields that share the same composite id. Those parts must render inline on the coordinate row (N/S or E/W), matching the radio faceplate order (`N(S): Latitude`).

On wide layouts the settings form uses two columns. Adjacent latitude and longitude coordinate cells would otherwise land in different columns and read as unrelated fields.

## Decision

`ui.composite` coordinate parts are:

- `degrees` — integer whole degrees
- `minutes` — integer whole minutes
- `fraction` — integer scaled fractional minutes (`fractionScale` on every part of the group)
- `hemisphere` — enum (`N` / `S` for latitude, `E` / `W` for longitude)

`fieldComposite()` in `settings-coordinate.ts` accepts all four parts. `layoutSettingsSection()` groups every recognized part into one `SettingsCoordinateCell`, marks each path consumed, and leaves non-composite fields unchanged when a group has no `hemisphere` part.

When layout emits a latitude coordinate cell immediately followed by a longitude coordinate cell, `foldAdjacentCoordinatePairs()` replaces them with one `coordinatePair` cell so **Settings** can span the full grid width and stack latitude above longitude. No extra driver metadata is required beyond existing composite ids and field order.

`SettingsFieldGrid` renders each coordinate row in radio order: optional hemisphere select, degrees, minutes, and the prime mark. When a `hemisphere` part is present, a compact select before the degrees input uses that field’s enum values and labels. Hemisphere edits use the same dirty tracking and write path as other settings fields. Write review prefixes the hemisphere letter on the formatted value (for example `N 30° 12.34′`).

## Consequences

- New coordinate composites should declare `fractionScale` on the hemisphere field as well as on the numeric parts so `fieldComposite()` validation stays consistent.
- Composites that omit `hemisphere` behave exactly as they did before this record.
- Hemisphere-only changes appear in write review with an updated leading letter.
- Latitude and longitude stay paired only when they are adjacent after layout folding; a field between them keeps separate cells.