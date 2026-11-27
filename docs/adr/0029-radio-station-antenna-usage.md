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

Adding a radio to an antenna’s list removes that radio from every other site antenna’s list. Changing or clearing a radio’s linked station drops ids that do not belong to the new site. Deleting a radio calls the existing `removeAntennasForRadio`, which also strips the id from all `usedByRadioIds`. Deleting a site antenna or station removes those records; unlinking a station clears each affected radio’s station-antenna picks.

**UI.** `SavedRadioEditor` shows a multi-select of antennas at the linked station (hidden when station is None). `AntennaStationEditor` lists radios at that station that use the antenna. Detail lines on the radio card and Preferences → Radios show shared station antenna nicknames, then whip nicknames.

**Composable wiring.** Antenna membership is persisted from components that already call `useStationAntennas()` at setup (`syncRadioStationAntennas` on save). `useSavedRadios` does not touch the antenna store.

## Consequences

- Propagation, the station log, and APRS beacon prefill remain unchanged.
- Many-to-many sharing is explicit in localStorage on the station-antenna store.
- Hand-edited storage with unknown radio ids is dropped at parse time for `usedByRadioIds` entries that are not strings; dangling ids after radio delete are removed when the store is loaded through serialize/parse or on delete.