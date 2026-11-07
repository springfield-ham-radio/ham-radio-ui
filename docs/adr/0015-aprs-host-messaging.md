# Opt-in host messaging on the TM-D710 COM port

**Status:** accepted  
**Date:** 2026-11-07  
**Related:** [0014](./0014-aprs-receive.md), [aprs.md](../aprs.md)

## Context

Bryan approved trying two-way APRS messages after the tradeoff was written down. The menu 604 monitor cannot carry a host message: Kenwood's IDM enters PC APRS from PACKET mode with `KISS ON` and `RESTART`, and menus 600–612 do not apply while that host session is running. The same manuals do not document a host byte sequence that leaves KISS once the TNC is already in it. The PG-5G has no RTS or DTR conductor, and `XFLOW` software flow control is not verified on this cable.

## Decision

- The monitor in ADR 0014 is unchanged. It never writes, and it remains the path behind Stations, Map, Packet, and Raw log.
- Messages are a second session on the same saved COM port and the same port-hold list. CAT, memory read/write, the monitor, and this listener cannot hold that adapter together. Disconnect releases the hold and does not send an exit command.
- This build does not send `KISS ON`, `KISS OFF`, `RESTART`, `HB`, a KISS return frame, or any message frame. It does not power-cycle the radio and it does not copy D700 init bytes. It does not read or write `MYCALL`, `UNPROTO`, `KISS`, `XFLOW`, or `HBAUD`.
- **Allow transmit** and **Send** are separate from Listen. Opening the composer does not transmit. An ack reply is a third control and stays off, because an ack is also a transmission. Nothing is retried after Disconnect or a new connect.
- The KISS codec, AX.25 UI frame, and retry state machine exist so a later build can turn on writes without guessing the framing. Hardware transmit stays off until a Kenwood-documented KISS exit, and a verified flow-control behavior for this cable, are both in hand. Tests may enable writes only against an in-memory port.
- No APRS-IS, igate, beacon, or GPS. No new registry or driver fields. A module `aprs.mode` other than `monitor` is still ignored.

## Consequences

- The first hardware check is Listen, then Disconnect, with transmit off. The radio must already be in whatever mode the operator set. HamBench will not change it.
- If the operator enters KISS with another program, they leave it with the Kenwood procedure they used, then press **[TNC]** until **APRS** is shown and confirm menu 604 before using the monitor.
- A future transmit build still does not need a driver or registry change for the frame format. It must not ship until the exit and the flow-control check are documented.
