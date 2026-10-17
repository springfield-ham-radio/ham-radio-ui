# Channel pack format (.hpack)

**Status:** accepted  
**Date:** 2026-10-17  
**Related:** [#66](https://github.com/springfield-ham-radio/ham-radio-ui/issues/66), [0002-repeater-record-reimport.md](./0002-repeater-record-reimport.md)

## Context

Clubs and nets want a versioned, model-independent file for one channel library group. HamBench library CSV has no pack metadata and re-import preserves operator-edited names and notes. Operators sharing a list need metadata (`name`, `version`, `updated`, optional `source` URL) and predictable group updates, including rows removed from the club list.

RepeaterBook data is for personal use; redistribution requires written permission from RepeaterBook.

## Decision

**Format.** JSON document, file extension `.hpack`, `schemaVersion: 1` (integer, required). Normative schema: `app/utils/channel-pack.schema.json`. Parser and serializer live in `app/utils/channel-pack.ts`. Unknown JSON properties are ignored on read.

**Portable fields.** One group per file: pack metadata plus an array of channels with stable pack channel `id` slugs, frequencies as integer hertz, CTCSS as `{ type: "ctcss", hz }`, DCS as `{ type: "dcs", code }`, and the repeater record and linked-node fields already stored on `saved_channels` (see ADR 0002). Coordinates follow ADR 0001; the pair `(0, 0)` is rejected.

**Export scope.** A pack always serializes every channel in the group, not a selection or filtered table view.

**RepeaterBook.** Rows with `sourceFormat === 'repeaterbook'` are omitted from export unless the operator explicitly opts in at export time. There is no stored permission flag in the file. Included rows carry `provenance: "repeaterbook"` so importers and later exports treat them as RepeaterBook-sourced again. Hand-entered and CHIRP-sourced rows are unaffected.

**Import merge (pack only).** Match library rows by pack channel id, then by `source_key`. Do not use the legacy `kind | callsign-or-name | tx | rx` key. Applying a pack overwrites **name** and **notes** and all portable fields from the file. Rows present in the group but absent from the pack are removed from that group. A library row is deleted only when it belongs to no other group after removal. HamBench CSV import keeps the policy in ADR 0002 (preserve name and notes; no deletion on absence).

**Pack and group identity.** Pack `id` is a UUID stored on the group. Pack channel ids are slugs stored per channel. Re-export keeps both.

**Version metadata.** `version` is free text (not enforced semver). `updated` is an ISO timestamp set at export.

**Repository boundary.** The schema stays in ham-radio-ui until another runtime consumer needs a shared package.

## Consequences

- PR 2 adds UI, registry entries, SQLite columns for pack metadata, and apply logic using `planChannelPackImport` in `app/utils/channel-pack-import.ts`.
- Club repos can commit `.hpack` files and diff them in git.
- Operators must not share RepeaterBook-derived packs without permission; the export gate is the primary control.
- A future breaking format bumps `schemaVersion`; readers reject unknown versions.
