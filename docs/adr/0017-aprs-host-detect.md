# Host Connect detects command mode or KISS

**Status:** accepted  
**Date:** 2026-11-11  
**Related:** [0016](./0016-aprs-driver-profile.md), [aprs.md](../aprs.md)

## Context

A TM-D710 left powered off can come back in command mode. KISS does not have to persist. The enter steps were behind a collapsed Host KISS section, so a command-mode TNC looked like a silent port. The bytes that ask for a prompt, enter KISS, or leave KISS belong to the installed module, not to shared code.

## Decision

- Host Connect runs one detection pass from `aprs.host`. Each step runs once, with the module's timeout. There is no retry loop. **Retry detection** on the APRS connection row starts the pass again.
- Listen for `listenMs` (default 3000, allowed 500–15000). A valid KISS frame means KISS mode. Nothing is written. KISS stays unconfirmed until an AX.25 UI frame. The status is "KISS on, waiting for traffic."
- Command text or the module prompt means command mode. The enter steps run, each after a fresh prompt. After the last step the status is "KISS on, waiting for traffic" until a UI frame arrives. A quiet channel is not a failure.
- Monitor text with no prompt waits `waitMs`, then writes the module interrupt once and waits for the prompt. The prompt runs the enter steps. If that prompt still does not arrive, detection stops. This path does not send `kissExit`.
- Silence writes the module interrupt once and waits for the prompt. The prompt continues with the enter steps. Still silent: if `kissExit` is present, those bytes are written once and the prompt wait repeats, then the enter steps. If `kissExit` is absent, that step is skipped.
- Anything else stops. The status says the TNC is not answering and the radio may not be in PACKET mode, and the module setup and recovery text is shown. No further bytes are written.
- Bytes after a FEND are a KISS frame only when they start with a port-0 KISS command. A line break in any other partial, or a data frame that does not close within one second, is not left in the hold. The hold stays capped. Command text and `cmd:` stay command text, so detection can see them.
- A prompt or a command line after a confirmed UI frame means KISS was lost. Detection runs again from the module block. Retry detection clears the KISS decoder first. A prompt already on that connection is used. No beacon, `HB`, `RESET`, `XFLOW`, or `KISS OFF`.
- Detection never sends a beacon, a message, `HB`, `RESET`, `XFLOW`, or `KISS OFF`. The D710 model-id fallback does not declare `kissExit`. Shared code does not invent `C0 FF C0`.
- The passive monitor still writes nothing. A module with `aprsReceive` and no `host` block does not get the fallback sequence.

## Consequences

- The Host KISS collapsible is gone. Raw log shows the detection result and each write.
- A Kenwood module can add `kissExit` without a HamBench change. Until it does, silence after the interrupt stops.
- A prompt is still not proof of PACKET mode. A power cycle is still not a guaranteed KISS exit.
