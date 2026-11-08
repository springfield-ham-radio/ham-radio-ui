# Opt-in host messaging on the TM-D710 COM port

**Status:** accepted  
**Date:** 2026-11-07  
**Related:** [0014](./0014-aprs-receive.md), [aprs.md](../aprs.md)

## Context

The menu 604 monitor is confirmed on the air and must keep writing nothing. Host messages need KISS, which the IDM enters from PACKET12 with a carriage return, `KISS ON`, and `RESTART`. The A/E command list says that while KISS is ON, powering the radio off and on enters or exits KISS. The G list describes that toggle as `RESTART`. Neither English D710 text documents the TM-D700 bytes `C0 FF C0`, and the IDM says those PC commands are not compatible.

The operation-panel COM jack carries RTS, CTS, TXD, RXD, and ground. The 2.5 mm plug is the GPS jack. PG-5G is the COM-to-DE-9 cable. `XFLOW` defaults to ON in the command list. A TM-D710 display has shown `XFLOW OFF`, which is hardware flow. The Tauri serial plugin can select none, software, or hardware.

## Decision

- ADR 0014 stands for Stations, Map, Packet, and Raw log. That session still opens with flow control off and RTS and DTR low, and it has no write method.
- Messages are a second session on the same port hold. Listen reads and writes nothing. Connect does not enter KISS and does not send a frame.
- **Request command prompt** writes three Ctrl+C bytes and no carriage return, once, and only when this connection has not already shown `cmd:`. The command list uses Ctrl+C to leave Converse or Transparent. A `cmd:` that arrives on this Listen, including one that arrives before the button, is this connection's prompt. **Enter host KISS** writes `KISS ON` only after that, then `RESTART` only after another `cmd:`. No `HB`, beacon, message, or `RESET`. A prompt does not survive Disconnect. `cmd` without the colon does not count.
- **Allow transmit** defaults off. **Send** writes a KISS data frame only when that switch is on, at most 3 times, 15 seconds apart, and only while the session stays open. Cancel stops it. Disconnect clears the queue. A new Listen does not send it again.
- Ack generation is a second switch, default off. An ack or reject is accepted only from the addressed station with the same message id. Duplicates of a numbered message are ignored. A trailing CR or LF on the AX.25 info is the TNC terminator, not part of the ack. SSID bit 7 is not the SSID.
- Host open defaults to software flow control, with RTS and DTR low. **Off** is the same lines as the passive monitor. **Hardware (RTS/CTS)** sets plugin `FlowControl::Hardware` (`CRTSCTS`) and does not ioctl RTS, because the panel MPU `PCCTS` pin is a UART inhibit input. The passive monitor stays on flow control off. None of these sends `XFLOW`. RTS and DTR are not PTT.
- Converse mode was not adopted. Ctrl+C would leave it, but the TNC would own the callsign, path, and connected-mode retry.
- No APRS-IS, igate, beacon, or GPS. No registry or driver change.

## Consequences

- The passive test stays: radio showing APRS, menu 604 ON, Stations **Connect**. Do not select PACKET for that test.
- A listen test on Messages, with both switches off and without **Enter host KISS**, writes nothing.
- Leaving KISS is the operator’s power-cycle toggle, then **[TNC]** until APRS is shown. One cycle is not guaranteed. The IDM’s six STA/CON blinks happen during entry and are not a steady KISS lamp. Dark STA and CON do not mean KISS is off. HamBench does not perform the power cycle and does not treat “blink until dark” as the procedure.
- The host session shows a bounded reply log and keeps bytes from the moment the port opens. Plugin 3.0.7 deletes bytes it read before `watch` (`attach_watch` clears the idle buffer). Host open reads for the startup window before `watch` starts. A timeout with no bytes does not end that read, because the following bytes would be deleted when `watch` attaches. It does not send a command to do it. The passive monitor’s opening discard is unchanged. `cmd:` still requires the colon. A command line is recorded only after `write_binary` returns that length. The plugin does not drain the UART. KISS is unconfirmed until an AX.25 UI frame parses.
- `HBAUD    was 1200` followed by `cmd:` matches the TNC initialization reply to its own `HB 1200`. This program does not send `HB`. The COM jack has no DTR pin. A displayed `XFLOW OFF` means the TNC is using hardware flow. The host selects that on the computer; it does not write `XFLOW`.
- A real transmission still requires **Allow transmit** and **Send**, and the radio already in host KISS. That hardware step is not authorized by this record.
