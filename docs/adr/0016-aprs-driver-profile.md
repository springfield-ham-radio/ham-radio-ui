# APRS host setup comes from the radio module

**Status:** accepted  
**Date:** 2026-11-09  
**Related:** [0014](./0014-aprs-receive.md), [0015](./0015-aprs-host-messaging.md)

## Context

ADR 0014 shows the APRS tab from `capabilities.aprsReceive`, with a TM-D710 model-id fallback until the module publishes that flag. ADR 0015 then hardcoded the TM-D710 enter sequence in the shared host session: three Ctrl+C bytes, `cmd:`, `KISS ON`, and `RESTART`. Any radio that reached that session would be sent those Kenwood commands. KISS framing, AX.25, and APRS message text are protocol, not a vendor.

The installed module is JSON (`configs/*.json` in radio-module-kenwood), loaded at runtime. CAT already keeps Kenwood command layout in the module `cat` block. `@springfield/ham-radio-registry` 2.1.0 and `@springfield/ham-radio-driver` 3.8.0 have no APRS field. Publishing a new package is not required for HamBench to read an extra JSON block, and this record does not bump those dependencies.

## Decision

- The shared host session sends a command only from an `AprsHostLink` supplied for that radio. With no link, **Request command prompt** and **Enter host KISS** write nothing. A `cmd:` that arrives does not cancel a message and is not treated as that radio's prompt.
- The link is parsed from `aprs.host` on the installed module when `capabilities.aprsReceive` is true and `aprs.mode` is `monitor` or omitted. The block carries `interrupt`, `prompt`, optional `errorReply`, `waitMs`, `enter` steps, optional `kissExit`, optional `promptNudge`, `flows`, `defaultFlow`, `flowHelp`, `setup`, and `recovery`. An unusable block is ignored. HamBench does not substitute the TM-D710 sequence.
- A module that omits `capabilities.aprsReceive` still matches a TM-D710 model id. That fallback is the only place the tested D710 bytes remain: interrupt `[3,3,3]`, prompt `cmd:`, error `?EH`, then `KISS ON\r` and `RESTART\r`, each after a fresh prompt. Hardware RTS/CTS stays available and does not force RTS low. The fallback does not declare `kissExit`. Host Connect detection is [0017](./0017-aprs-host-detect.md).
- Stations, the map, AX.25 UI confirmation, bounded Send retries, Cancel, Disconnect, and automatic acknowledgement stay shared. Automatic acknowledgement still starts off when the port opens. A prompt is not proof of PACKET mode. The D710 recovery text quotes the manuals’ “enter (or exit)” sentences and does not turn them into an alternating toggle. A power cycle can show startup. It is not a guaranteed KISS exit.

## Consequences

- A monitor-only module, including a D710 module that sets `aprsReceive` without `aprs.host`, gets the passive monitor and no Kenwood init.
- The model-id fallback in `aprs-capability.ts` is compatibility for an installed module that omits `capabilities.aprsReceive`. It is not the design. It retires when those installed D710 configs set the flag: delete the `d710AprsFamily` host injection and keep reading `aprs.host` from the module. A published package is not required for that retirement.
- An unmerged Kenwood branch is tested by building its module zip and choosing Preferences → Drivers → Install from file…. HamBench reads that installed JSON. `package.json` does not gain a git or unpublished dependency. When the installed config sets `capabilities.aprsReceive`, the fallback is not consulted.
- ham-radio-registry can later add the same shape to `RadioCapabilities` and `RegistryRadio`. That type is documentation. The running app already accepts the JSON.
