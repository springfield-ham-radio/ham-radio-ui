# Saved radio station link

**Status:** accepted  
**Date:** 2026-11-27  
**Related:** [0013](./0013-first-run-onboarding-stepper.md), [0027](./0027-aprs-position-beacon.md)

## Context

HamBench keeps operating **sites** (`RadioStation` in `ham-radio-station-antennas`) and **saved radios** (`ham-radio-saved-radios`) in separate stores. Antennas carry either `stationId` or `radioId`, never both. Station location feeds the map and propagation, but choosing a radio in the station log does not pick a site. Operators want to record which shack or portable site a TM-D710 or handheld usually uses.

A follow-up will let a station antenna stay at a site while listing which radios use it (`usedByRadioIds`). This record covers only the radio→station link.

## Decision

**Field.** `SavedRadio.stationId?: string` references `RadioStation.id` (for example `station-home` for Home).

**Defaults and migration.**

- Existing radios in localStorage stay **unlinked** (`stationId` absent). No backfill to Home.
- **New** radios from `createSavedRadio` default to `HOME_STATION_ID` when the draft omits `stationId`. Draft `''` means no link (create or edit).
- `parseSavedRadio` / `serializeSavedRadioStore` preserve `stationId` alongside `aprsMyCall`, `aprsBeacon`, privilege, and packet fields. `updateSavedRadio` still spreads `...current` before applying the draft.

**UI.** `SavedRadioEditor` offers a station select (None + every `RadioStation`). Preferences and the radio card show the linked nickname when set.

**Station removal.** Deleting a station does not block on linked radios. `clearSavedRadioStationLinks` clears `stationId` on affected radios (without bumping `updatedAt`), then `removeStationFromStore` removes the site and its station antennas. Mounted whips (`radioId`) are unchanged.

**Antenna ownership.** Radio→station does not move or duplicate antennas. A handheld whip remains `radioId`-only.

**Deferred (PR 2 and later).**

- `usedByRadioIds` on `StationAntenna` for many-to-many “this roof antenna used by these radios.”
- Station log / CAT defaults from the radio’s linked station instead of only the globally selected station.
- APRS beacon prefill from linked-station coordinates when no beacon is stored.
- Propagation still uses the selected station antenna; no radio filter yet.

## Consequences

- Operators can name a usual site per radio without changing global station selection or propagation.
- PR 2 can restrict antenna pickers to `radio.stationId` and prune `usedByRadioIds` when sites or radios change.
- Dangling `stationId` values (hand-edited storage) display as None in the editor until the operator saves or the station is removed.