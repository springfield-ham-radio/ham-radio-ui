# APRS host setup comes from the radio module

**Status:** accepted  
**Date:** 2026-11-09  
**Related:** [0014](./0014-aprs-receive.md), [0015](./0015-aprs-host-messaging.md)

## Context

ADR 0014 shows the APRS tab from `capabilities.aprsReceive`, with a TM-D710 model-id fallback until the module publishes that flag. ADR 0015 then hardcoded the TM-D710 enter sequence in the shared host session: three Ctrl+C bytes, `cmd:`, `KISS ON`, and `RESTART`. Any radio that reached that session would be sent those Kenwood commands. KISS framing, AX.25, and APRS message text are protocol, not a vendor.

The installed module is JSON (`configs/*.json` in radio-module-kenwood), loaded at runtime. CAT already keeps Kenwood command layout in the module `cat` block. `@springfield/ham-radio-registry` 2.1.0 and `@springfield/ham-radio-driver` 3.8.0 have no APRS field. Publishing a new package is not required for HamBench to read an extra JSON block, and this record does not bump those dependencies.

## Decision

- The shared host session sends a command only from an `AprsHostLink` supplied for that radio. With no link, **Request command prompt** and **Enter host KISS** write nothing. A `cmd:` that arrives does not cancel a message and is not treated as that radio's prompt.
- The link is parsed from `aprs.host` on the installed module when `capabilities.aprsReceive` is true and `aprs.mode` is `monitor` or omitted. The block carries `interrupt`, `prompt`, optional `errorReply`, `waitMs`, `enter` steps, `flows`, `defaultFlow`, `flowHelp`, `setup`, and `recovery`. An unusable block is ignored. HamBench does not substitute the TM-D710 sequence.
- A module that omits `capabilities.aprsReceive` still matches a TM-D710 model id. That fallback is the only place the tested D710 bytes remain: interrupt `[3,3,3]`, prompt `cmd:`, error `?EH`, then `KISS ON\r` and `RESTART\r`, each after a fresh prompt. Hardware RTS/CTS stays available and does not force RTS low. Connect still writes nothing.
- Stations, the map, AX.25 UI confirmation, bounded Send retries, Cancel, Disconnect, and automatic acknowledgement stay shared. Automatic acknowledgement still starts off when the port opens. A prompt is not proof of packet mode, and the D710 recovery text still does not promise that one power cycle leaves KISS.

## Consequences

- A monitor-only module, including a future D710 module that sets `aprsReceive` without `aprs.host`, gets the passive monitor and no Kenwood init.
- radio-module-kenwood still has to publish `capabilities.aprsReceive` and `aprs.host` on the TM-D710 configs. Until that install is updated, the model-id fallback preserves the tested D710 behavior. This repository does not depend on an unpublished package.
- ham-radio-registry can later add the same shape to `RadioCapabilities` and `RegistryRadio`. That type is documentation. The running app already accepts the JSON.
- The D710 fallback is removed once every installed D710 module carries the block. It is not a second driver.
