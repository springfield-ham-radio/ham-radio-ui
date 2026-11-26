# Kiss-only APRS host (manual keypad KISS)

**Status:** accepted  
**Date:** 2026-11-26  
**Related:** [0016](./0016-aprs-driver-profile.md), [0017](./0017-aprs-host-detect.md), [aprs.md](../aprs.md)

## Context

The Kenwood TH-D74 built-in TNC is KISS-only over the same USB CDC port as clone and CAT. There is no `cmd:` prompt and no usable passive TNC2 monitor (menu 580 raw packets did not copy traffic in hardware tests). The operator enables KISS on the keypad and sets menu 983 to USB. Verified hardware sent valid KISS frames with DTR and RTS asserted and no flow control. The manual documents KISS exit as the byte sequence `C0 FF C0`, and PC (CAT) commands are not accepted while KISS is on.

ADR 0017 assumes Host Connect may write interrupt, enter steps, and optional `kissExit` during detection. That model fits the TM-D710. It does not fit a radio that is already in KISS before Connect and rejects command text.

## Decision

- Modules may set `aprs.mode` to `kiss`. That mode is host-only: `passive` is false on the resolved profile, Monitor only is not offered on the connection bar, and `capabilities.aprsReceive` without a usable `aprs.host` hides the APRS tab.
- `aprs.host.entry` set to `manual` means the operator turned KISS on before Connect. Connect opens the port, sets detection to **KISS · waiting**, and writes nothing. `kissExit` is required. Command fields (`interrupt`, `prompt`, `enter` steps, `promptNudge`) must be absent. `flowControl` must be `none` or `hardware`; `software` (XON/XOFF) rejects the block because KISS is binary.
- Optional `aprs.host.dtr` and `aprs.host.rts` (`asserted` or `low`) apply on host open. Omitted means the previous default (both low). Hardware RTS/CTS still does not ioctl RTS.
- Disconnect uses the existing host path: when the session badge is KISS waiting or KISS confirmed, HamBench writes `kissExit` once, then closes the port and drops the hold so CAT and Read may open the adapter.
- CAT and clone handshake failures on kiss-only profiles append one sentence: the radio may still be in KISS; use APRS Disconnect or turn KISS off on the radio.

TM-D710 behavior is unchanged: `aprs.mode` monitor or omitted, command `aprs.host`, model-id fallback, and no `kissExit` on the fallback.

## Consequences

- The Kenwood module publishes the JSON shape documented in the companion PR for `configs/kenwood-th-d74.json`.
- Radios with only manual KISS never send Kenwood `KISS ON` / `RESTART` from HamBench.
- DTR low as KISS exit on the D74 is unverified; modules should declare `dtr`/`rts` asserted until hardware says otherwise.
- Future kiss-only radios reuse the same schema without model-id checks in the UI.