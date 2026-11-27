# Radio use of station antennas

**Status:** accepted  
**Date:** 2026-11-27  
**Related:** [0028](./0028-radio-station-link.md)

## Context

PR 1 linked each saved radio to an operating site (`SavedRadio.stationId`). Station antennas remain installed at a site; whips stay on the radio (`radioId`). Operators still need to record which roof or shack antennas a TM-D710 or mobile rig actually uses when it is linked to that site, without moving hardware records or duplicating whips.

## Decision

**Field.** `StationAntenna.usedByRadioIds?: string[]` on site antennas only. Several radios may share one antenna id. Radio-mounted antennas never carry this field.

**Writes.** Membership is updated through pure store helpers:

- `setRadioStationAntennas` from the radio editor after `addRadio` / `saveRadio`.
- `setAntennaUsedByRadioIds` when a site antenna is saved from its slideover.

Several radios may share one site antenna, and one radio may list several antennas at its linked station. The radio editor sets the full pick list for that radio; the antenna editor sets only that antenna’s list. Neither path clears the same radio from other antennas at the same site. Changing or clearing a radio’s linked station drops that radio from antennas at other sites (and from picks that no longer match the site). Deleting a radio calls the existing `removeAntennasForRadio`, which also strips the id from all `usedByRadioIds`. Deleting a site antenna or station removes those records; unlinking a station clears each affected radio’s station-antenna picks.

**UI.** `SavedRadioEditor` shows a multi-select of antennas at the linked station (hidden when station is None). `AntennaStationEditor` lists radios at that station that use the antenna. Detail lines on the radio card and Preferences → Radios show shared station antenna nicknames, then whip nicknames.

**Composable wiring.** Antenna membership is persisted from components that already call `useStationAntennas()` at setup (`syncRadioStationAntennas` on save). `useSavedRadios` does not touch the antenna store.

## Consequences

- Propagation, the station log, and APRS beacon prefill remain unchanged.
- Many-to-many sharing is explicit in localStorage on the station-antenna store.
- Hand-edited storage with non-string or blank ids is dropped at parse time. Unknown or deleted radio ids are stripped whenever the antenna store is persisted, using the current saved-radio list.