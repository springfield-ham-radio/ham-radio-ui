# 0019 Settings coordinate composite parts

**Status:** accepted  
**Date:** 2025-11-23  
**Related:** [radio-module-kenwood#58](https://github.com/springfield-ham-radio/radio-module-kenwood/pull/58)

## Context

Radio module memory maps can mark several sibling settings fields as one logical coordinate by giving each field the same `ui.composite.id` with `kind: "coordinate"`. HamBench folds those fields into one degrees-and-minutes row in **Settings** instead of showing separate inputs for each byte.

Drivers such as the Kenwood TH-D74 also map latitude and longitude hemisphere as enum fields that share the same composite id. Those parts must render inline (N/S or E/W) at the end of the row, not as a separate form field below it.

## Decision

`ui.composite` coordinate parts are:

- `degrees` — integer whole degrees
- `minutes` — integer whole minutes
- `fraction` — integer scaled fractional minutes (`fractionScale` on every part of the group)
- `hemisphere` — enum (`N` / `S` for latitude, `E` / `W` for longitude)

`fieldComposite()` in `settings-coordinate.ts` accepts all four parts. `layoutSettingsSection()` groups every recognized part into one `SettingsCoordinateCell`, marks each path consumed, and leaves non-composite fields unchanged when a group has no `hemisphere` part.

`SettingsFieldGrid` renders degrees, minutes, and the prime mark as before. When a `hemisphere` part is present, a compact select after the minutes input uses that field’s enum values and labels. Hemisphere edits use the same dirty tracking and write path as other settings fields. Write review appends the hemisphere letter to the formatted coordinate when the composite includes that part.

## Consequences

- New coordinate composites should declare `fractionScale` on the hemisphere field as well as on the numeric parts so `fieldComposite()` validation stays consistent.
- Composites that omit `hemisphere` behave exactly as they did before this record.
- Hemisphere-only changes appear in write review with an updated trailing letter.