# Opt-in host messaging on the TM-D710 COM port

**Status:** accepted  
**Date:** 2026-11-07  
**Related:** [0014](./0014-aprs-receive.md), [0017](./0017-aprs-host-detect.md), [aprs.md](../aprs.md)

Host Connect detection in [0017](./0017-aprs-host-detect.md) replaces the rule that a host Connect writes nothing. The passive monitor still writes nothing. Send is still the only message write.

## Context

The menu 604 monitor is confirmed on the air and must keep writing nothing. Host messages need KISS, which the IDM enters from PACKET12 with a carriage return, `KISS ON`, and `RESTART`. The A/E command list says that while KISS is ON, powering the radio off and on causes the TNC to enter (or exit) KISS. The G list uses `RESTART` for that sentence. Neither wording says the result alternates, and a power cycle is not a guaranteed exit. Neither English D710 text documents the TM-D700 bytes `C0 FF C0`, and the IDM says those PC commands are not compatible.

The operation-panel COM jack carries RTS, CTS, TXD, RXD, and ground. The 2.5 mm plug is the GPS jack. PG-5G is the COM-to-DE-9 cable. `XFLOW` defaults to ON in the command list. A TM-D710 display has shown `XFLOW OFF`, which is hardware flow. The Tauri serial plugin can select none, software, or hardware.

## Decision

- ADR 0014 stands for Stations, Map, and Raw log. The selected station’s decoded fields sit on Stations, beside the list. The passive session still opens with flow control off and RTS and DTR low, and it has no write method.
- One APRS COM control chooses the passive monitor or the host session. Connect reads and writes nothing. It does not enter KISS and does not send a frame. Disconnect closes the session that is open. CAT is a separate connection.
- **Request command prompt** writes three Ctrl+C bytes and no carriage return, once, and only when this connection has not already shown `cmd:`. The command list uses Ctrl+C to leave Converse or Transparent. A `cmd:` that arrives on this Listen, including one that arrives before the button, is this connection's prompt. **Enter host KISS** writes `KISS ON` only after that, then `RESTART` only after another `cmd:`. No `HB`, beacon, message, or `RESET`. A prompt does not survive Disconnect. `cmd` without the colon does not count.
- **Send** is the transmit choice. It writes a KISS data frame at most 3 times, 15 seconds apart, and only while this connection stays open and has parsed an AX.25 UI frame. Cancel stops it. Disconnect clears the queue. A new connection does not send it again.
- Ack generation is a second switch, default off. An ack or reject is accepted only from the addressed station with the same message id. Duplicates of a numbered message are ignored. A trailing CR or LF on the AX.25 info is the TNC terminator, not part of the ack. SSID bit 7 is not the SSID.
- A parsed AX.25 UI frame from Listen is folded into the same station list the map reads. The passive monitor remains a separate receive-only text session and does not open the port while Listen holds it.
- A message frame or its retry is written only after this connection has parsed an AX.25 UI frame. A KISS frame that does not parse does not confirm KISS and does not by itself remove a confirmation already earned. `cmd:` outside a KISS frame clears the confirmation and cancels the queue. Automatic acknowledgement is a separate switch, off when the port opens, and it is not saved. Turning it on does not acknowledge messages already heard and does not answer an ack. It applies to the My callsign on the APRS header.
- Host open defaults to software flow control, with RTS and DTR low. **Off** is the same lines as the passive monitor. **Hardware (RTS/CTS)** sets plugin `FlowControl::Hardware` (`CRTSCTS`) and does not ioctl RTS, because the panel MPU `PCCTS` pin is a UART inhibit input. The passive monitor stays on flow control off. None of these sends `XFLOW`. RTS and DTR are not PTT.
- Converse mode was not adopted. Ctrl+C would leave it, but the TNC would own the callsign, path, and connected-mode retry.
- No APRS-IS, igate, beacon, or GPS. No registry or driver change.

## Consequences

- The passive test stays: radio showing APRS, menu 604 ON, Stations **Connect**. Do not select PACKET for that test.
- A listen test on Messages, with both switches off and without **Enter host KISS**, writes nothing.
- HamBench does not leave KISS and does not send Ctrl+C or a carriage return to probe an unknown mode. A power cycle can show the startup banner. That banner is not a guaranteed exit, and `cmd:` in it is not proof of PACKET mode. The IDM’s six STA/CON blinks happen during entry and are not a steady KISS lamp. Dark STA and CON do not mean KISS is off. HamBench does not perform the power cycle and does not treat “blink until dark” as the procedure.
- The host session shows its bounded reply log on Raw log, next to the decoded-line log, and keeps bytes from the moment the port opens. Plugin 3.0.7 deletes bytes it read before `watch` (`attach_watch` clears the idle buffer). Host open reads for the startup window before `watch` starts. A timeout with no bytes does not end that read, because the following bytes would be deleted when `watch` attaches. It does not send a command to do it. The passive monitor’s opening discard is unchanged. `cmd:` still requires the colon. A command line is recorded only after `write_binary` returns that length. The plugin does not drain the UART. KISS is unconfirmed until an AX.25 UI frame parses.
- `HBAUD    was 1200` followed by `cmd:` matches the TNC initialization reply to its own `HB 1200`. This program does not send `HB`. The COM jack has no DTR pin. A displayed `XFLOW OFF` means the TNC is using hardware flow. The host selects that on the computer; it does not write `XFLOW`.
- A real message still requires **Send**, and the radio already in host KISS. That hardware step is not authorized by this record.
