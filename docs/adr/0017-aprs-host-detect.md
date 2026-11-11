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
- A `cmd:` (the module prompt) already in the bytes received on this connection when listening starts, and not followed by a KISS data frame, runs the enter steps immediately. The open buffer is delivered when the data listener attaches, which is before the listen clock starts.
- Monitor text with no prompt waits `waitMs`, then writes the module interrupt once and waits for the prompt. The prompt runs the enter steps. If command text is still arriving after that interrupt and `promptNudge` is declared, those bytes are written once and the prompt wait repeats. If the prompt still does not arrive, detection stops. This path does not send `kissExit`.
- `promptNudge` is an optional byte list on `aprs.host`, 1 to 16 bytes, same acceptance rules as `kissExit`. Omitted means the step does not run. An invalid list rejects the host block. It is written at most once per pass, only after `interrupt` has been written, and only when printable command text arrived after that interrupt and the prompt was not in it. It is not written on silence, not written before the interrupt, and not written after a KISS data frame. The D710 model-id fallback does not declare it. Shared code does not invent `0x0D`.
- Silence writes the module interrupt once and waits for the prompt. The prompt continues with the enter steps. Still silent: if `kissExit` is present, those bytes are written once and the prompt wait repeats, then the enter steps. If `kissExit` is absent, that step is skipped. "The radio may not be in PACKET mode" is this silence result only. It is not used when command text was seen.
- A byte sequence equal to the last write is an echo (`ECHO` defaults to ON) and is not a received KISS frame. `C0 FF C0` is a KISS return, not a data frame. It does not end detection and it does not confirm KISS. Only a port-0 data frame ends the pass as "KISS on, waiting for traffic." Only an AX.25 UI frame confirms KISS.
- Anything else stops. When nothing arrived, the status says the TNC is not answering and the radio may not be in PACKET mode. When command text arrived and the prompt did not, the status says command-mode text was seen and names the missing prompt. The module setup and recovery text is shown. No further bytes are written.
- Bytes after a FEND are a KISS frame only when they start with a port-0 KISS command. A line break in any other partial, or a data frame that does not close within one second, is not left in the hold. The hold stays capped. Command text and `cmd:` stay command text, so detection can see them.
- A prompt or a command line after a confirmed UI frame means KISS was lost. Detection runs again from the module block. Retry detection clears the KISS decoder first. A prompt already on that connection is used. No beacon, `HB`, `RESET`, `XFLOW`, or `KISS OFF`.
- Detection never sends a beacon, a message, `HB`, `RESET`, `XFLOW`, or `KISS OFF`. The D710 model-id fallback does not declare `kissExit` or `promptNudge`. Shared code does not invent `C0 FF C0` or `0x0D`.
- The A/E packet chapter and the G instruction manual say one Ctrl+C restores command mode from Converse, and that Transparent mode is left by holding Ctrl and pressing C three times. Neither command list includes `CMDTIME` or a guard time, so the three Ctrl+C bytes are written together. `SENDPAC` defaults to `$0D` and forces a packet to be sent, so a carriage return is not written before the interrupt. `ECHO` defaults to ON and echoes received characters. `MONITOR` defaults to ON. `MCON` defaults to OFF and means monitor other stations while connected, not while in Converse. Neither list says a bare carriage return reprints `cmd:`. `promptNudge` is how a module that has verified that reply declares the bytes.
- The passive monitor still writes nothing. A module with `aprsReceive` and no `host` block does not get the fallback sequence.

## Consequences

- The Host KISS collapsible is gone. Raw log shows the detection result and each write.
- A Kenwood module can add `kissExit` without a HamBench change. Until it does, silence after the interrupt stops.
- A prompt is still not proof of PACKET mode. A power cycle is still not a guaranteed KISS exit.
