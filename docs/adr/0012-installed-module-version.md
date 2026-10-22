# Installed module version

**Status:** accepted  
**Date:** 2026-10-22  
**Related:** [0009-per-radio-modules.md](./0009-per-radio-modules.md), [#167](https://github.com/springfield-ham-radio/ham-radio-ui/issues/167), [#168](https://github.com/springfield-ham-radio/ham-radio-ui/pull/168)

## Context

An installed driver has two version strings that used to drift. `radio_models.version` was copied from the driver config JSON. Update checks preferred the version parsed from `source_path` (`radio-modules/<id>/<version>/`). `upsertRadioCatalogRecord` also skipped the write when the config content hash matched an existing `installed` row, even if that row still pointed at an older directory.

A manual test renamed `kenwood-th-f6` to `1.11.0` in the database and on disk, then clicked Update. The app downloaded `1.12.0`, deleted `1.11.0`, and reported success while the catalog row stayed on `1.11.0` because the hash still matched. The banner kept offering the same update.

## Decision

The installed module version is `radio_models.version`. Install, update, and startup repair set it from the module directory version (`radio-modules/<model id>/<version>/`), which is the catalog zip version. The driver config version stays on `config_json.version` and is only for display.

- A matching content hash does not skip an `installed` upsert when the module version or `source_path` differs.
- After install or update, HamBench reads the catalog row back and throws if model id, source, module version, or install path disagree with the directory just written. The new directory is rolled back when that check fails, and the previous directory is removed only after the check passes.
- On catalog refresh, a module row whose folder is missing is repaired when exactly one version directory remains for that id. A folder that exists but disagrees with `radio_models.version` is repaired to the folder version by re-reading that directory. Anything else is flagged.
- Preferences → Drivers and the update banner share `useRadioModuleCatalog`, which reloads installed rows after catalog refresh.

## Consequences

- Breaking: for module installs, `RadioCatalogRecord.version` is the module directory version, not the driver config version. Read the config version from `record.config.version`.
- Breaking: `installedModuleVersion()` returns `record.version` only. It no longer overrides that with the `source_path` segment.
- A catalog write that does not stick is an error toast instead of a successful update.
- No SQLite migration. Existing rows are aligned on the next catalog refresh.
