# Architecture decision records

Numbered Markdown files record code and architecture decisions so future work stays aligned with what we already chose.

## Naming

`NNNN-short-title.md` — for example `0001-location-model.md`. Use the next free number when adding a record.

## Records

| Record | Status | Topic |
| --- | --- | --- |
| [0001](./0001-location-model.md) | accepted | Location and Maidenhead display |
| [0002](./0002-repeater-record-reimport.md) | accepted | Repeater record re-import |
| [0003](./0003-map-basemap.md) | accepted | Map basemap |
| [0004](./0004-channel-radio-validation.md) | accepted | Channel validation before add/write |
| [0005](./0005-radio-memory-undo.md) | accepted | Radio memory undo and redo |
| [0006](./0006-channel-card-print.md) | accepted | Channel card print / PDF |
| [0009](./0009-per-radio-modules.md) | accepted | Per-radio module installs |
| [0010](./0010-channel-pack.md) | accepted | Channel pack (.hpack) format |
| [0011](./0011-channel-pack-url.md) | accepted | Channel pack URL import and manual updates |

Numbers 0006–0008 are unused in this repository. Ecosystem ADRs live in [ham-radio-docs](https://github.com/springfield-ham-radio/ham-radio-docs/tree/main/docs/developer/adr).

## Status

Each ADR has a **Status**: `proposed`, `accepted`, or `superseded`. When a later ADR replaces an older one, mark the old record `superseded` and link to the new file.

## Sections

Keep records short (about one page).

- **Context** — the problem or forces that led to a decision.
- **Decision** — what we chose.
- **Consequences** — trade-offs, follow-on work, and what callers should expect.

Add **Date** and **Related** (issues or external ADRs) when they help.

## Who updates these

Agents and contributors add or update an ADR when they implement a design that was agreed in an issue or review, not for every small refactor.
