# Architecture decision records

Numbered Markdown files record code and architecture decisions so future work stays aligned with what we already chose.

## Naming

`NNNN-short-title.md` — for example `0001-location-model.md`. Use the next free number when adding a record.

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
