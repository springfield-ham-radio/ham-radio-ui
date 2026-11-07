# Receive-only APRS on the TM-D710 COM port

**Status:** accepted  
**Date:** 2026-11-07  
**Related:** [aprs.md](../aprs.md), [cat.md](../cat.md)

## Context

The TM-D710 CAT and clone path uses the PC jack on the TX/RX unit. The built-in TNC uses a different connector: the COM jack on the control head, with the optional PG-5G cable. Menu numbers for that jack are not the PC-port baud menu. Messaging and transmit stay out of scope. The map shows positions decoded in the current session.

Kenwood copies received APRS traffic to the COM jack when menu 604 OUTPUT is ON. That is a radio menu, not a host command. Entering KISS requires the computer to send TNC commands, and those commands can put the TNC on a path that transmits.

## Decision

- The APRS tab lives in HamBench. It is a read-only serial listener, not a radio-module memory map and not a CAT session.
- Open the selected adapter at 8N1 with hardware flow control off and RTS and DTR deasserted. Never write bytes. Do not send TNC init, `MON ON`, `KISS ON`, or `RESTART`.
- Claim the port in the same hold list as CAT so Read, Write, and CAT cannot open it. Releasing the card or pressing Disconnect closes the handle and drops the hold.
- Parse TNC2 monitor lines in-process. Decode only fields the packet contains. Keep every raw line, including malformed and unsupported packets, in a bounded log. Station rows update field-by-field and keep an older position when a later packet has none.
- The operator's APRS adapter and baud live on the saved radio (`aprsSerialPort`, `aprsBaudRate`). Saving them does not write the memory `serialPort` or `baudRate`, and the reverse is also true. Connect uses only the APRS fields.
- Show the tab when the installed module sets `capabilities.aprsReceive`. Until that field exists, a TM-D710 model id still shows the tab. A/E/S and G use different port menu numbers; a bare TM-D710 id shows both in the preferences help until the faceplate is confirmed.
- Plot a station only when its own decoded latitude and longitude are finite and in range. Do not invent a position for ambiguity, objects, or unsupported packets. Fit the map to those stations once; later packets update markers without moving the camera. The log is the session's monitor text, not a copy of the radio's internal station list.
- No APRS-IS connection, no igate, no beacon, and no radio menu writes.

An in-tree decoder is used. `@hamradio/aprs` declares MIT but the 1.4.2 package has no LICENSE file, and its Mic-E N/S and longitude-offset bits do not match APRS Protocol Reference 1.0.1. `js-aprs-fap` is a rewrite of a Perl library. GPL APRS parsers are not acceptable in this repository.

## Consequences

- Bryan has to set menu 604 OUTPUT to ON, match menu 528 or 929, and press [TNC] until APRS is shown. HamBench will not do that for him.
- The radio's own beacon, if already enabled, is unchanged.
- The model-id check remains only as a fallback. The module should publish `capabilities.aprsReceive` and an `aprs` block (`mode: "monitor"`, `baudRate`, `baudRates`, optional `help`). HamBench keeps RTS and DTR deasserted even if that block says otherwise, and it ignores any mode other than `monitor`. User port and baud stay in HamBench, not in the module.
- Positions are omitted for Mic-E ambiguity, third-party packets, telemetry, and lines that are not TNC2 monitor text. Those lines stay in the raw log. Menu 604 streams packets heard after it is turned on. It is not a station-list download.
