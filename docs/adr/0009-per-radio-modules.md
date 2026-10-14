# Per-radio module installs (schema version 3)

**Status:** accepted  
**Date:** 2026-10-13  
**Related:** [ham-radio-docs ADR 0009](https://github.com/springfield-ham-radio/ham-radio-docs/blob/main/docs/developer/adr/0009-per-radio-modules.md), [#116](https://github.com/springfield-ham-radio/ham-radio-ui/issues/116)

## Context

Official radio modules were shipped as one zip per manufacturer. Removing one Kenwood radio from Preferences deleted every radio that shared the same install directory ([#116](https://github.com/springfield-ham-radio/ham-radio-ui/issues/116)).

## Decision

HamBench follows [ham-radio-docs ADR 0009](https://github.com/springfield-ham-radio/ham-radio-docs/blob/main/docs/developer/adr/0009-per-radio-modules.md):

- Depend on `@springfield/ham-radio-registry` 2.x and catalog schema version 3 (one catalog row per radio; `id` is `id.model`).
- Install to `radio-modules/<entry.id>/<entry.version>/`. Refuse zips that do not contain exactly one `configs/*.json`.
- Install, update, and uninstall operate on a single radio. Manufacturer names are grouping headings only.
- On first launch after upgrade, delete legacy `radio-modules/kenwood/` and `radio-modules/baofeng/` trees and matching `radio_models` rows. Do not auto-reinstall; saved radios, channels, logs, stations, antennas, backups, and user JSON stay.

## Consequences

- Breaking change: requires the schema version 3 catalog and per-radio release zips (shipped with the radio-module-catalog v3 release).
- Operators reinstall drivers from Preferences after upgrading.
- Saved radios whose driver was removed show the existing missing-driver messaging until reinstalled.
