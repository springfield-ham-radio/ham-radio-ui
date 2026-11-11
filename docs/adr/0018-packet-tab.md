# Host-side AX.25 link for the Packet tab

**Status:** proposed  
**Date:** 2026-11-11  
**Related:** [0015](./0015-aprs-host-messaging.md), [0017](./0017-aprs-host-detect.md), [aprs.md](../aprs.md)

## Context

The shared host session already owns the TM-D710 COM port, detects KISS from the module's `aprs.host` block, and decodes AX.25 UI for APRS. Connected packet (a BBS or a keyboard-to-keyboard link) needs every AX.25 frame, not only UI, and it needs the link layer that a TNC would have run in Converse mode. ADR 0015 left that layer in the TNC on purpose. Doing it in the host keeps one serial owner and keeps callsign, paclen, and retries in HamBench.

An unsolicited SABM must not key the radio just because the tab is open.

## Decision

- The Packet tab is a second view of the same host KISS session. It does not open a second port. It subscribes to that session itself, so counters and detection status update while the APRS tab is unmounted. Connect KISS uses the flow control saved for this radio on the APRS host row. The module `defaultFlow` is the fallback when nothing is saved. Detection and `kissExit` stay in the module profile. The tab adds no Kenwood command bytes.
- A KISS data listener sees every port-0 payload. APRS KISS confirmation is unchanged: only an AX.25 UI frame sets it, and only Send writes an APRS message. A connected-mode frame does not confirm KISS for APRS and does not answer an APRS message.
- The monitor parses I, S (RR, RNR, REJ, SREJ), and U (SABM, SABME, UA, DM, DISC, FRMR, UI, XID, TEST) frames. It shows source, destination, the digipeater path with H bits, command/response, N(S), N(R), P/F, PID, and the info as text and hex. I and S frames are modulo 8 unless the operator selects modulo 128. Pause freezes the list and keeps capturing. Clear and copy do not write.
- The link layer is AX.25 2.0 modulo 8 by default. Modulo 128 sends SABME and uses a 16-bit control field. One link is shown. The session map can hold another peer, but a second outgoing connect is refused until the first disconnects.
- Connect sends SABM (or SABME) with P set. UA completes the link. DM clears it. I frames carry sequence numbers and PID `0xF0`. The window is maxframe (default 4). RR acks in-order I frames. RNR pauses them. REJ retransmits from N(R). SREJ retransmits that one outstanding frame. T1 (default 3 s) retries a connect, a disconnect, or a checkpoint RR up to N2 (default 10), then the timers stop and nothing more is sent. T3 (default 3 min) sends one RR poll when the link is idle. DISC/UA clears the link.
- Outgoing frames use the path the operator typed, with H bits clear. A heard frame is accepted only when every digipeater H bit is set. Replies reverse that path and clear the H bits.
- **Accept incoming connections** is off by default and is not implied by opening KISS. An unsolicited SABM or SABME is ignored. No DM is sent. The choice is ignore rather than DM so an incoming call does not key the transmitter. When the switch is on, the host answers that SABM with UA. A SABM while the session's modulo is 128, or a SABME while it is 8, is ignored the same way.
- UI, XID, and TEST frames are monitored and do not get a link reply. FRMR while connected sends DISC.
- Packet writes are allowed only after detection has reached "waiting for traffic" or APRS has confirmed a UI frame, and never while detection is still running. They are a direct result of Connect, a sent line, or a frame that link already owes (RR, REJ, retry, DISC, T3 poll, UA after an accepted SABM).
- Leaving the Packet tab, Disconnect, or closing the KISS port sends one DISC if a link is up, then clears the timers. A retrying Disconnect stays on the port until UA or N2. If KISS detection starts again, timers stop and nothing more is sent.
- The callsign is the operator callsign already stored in HamBench. An SSID in that callsign is kept. Otherwise the Packet SSID is used, default 0. Defaults are paclen 128, maxframe 4, T1 3 s, T3 3 min, N2 10.
- No beacon, no `HB`, no `XFLOW`, and no change to the APRS passive monitor.

## Consequences

- A BBS connect still needs the radio in host KISS and a real peer. That is hardware verification, not something this record can close.
- The monitor will misread modulo-128 I and S frames while the setting stays at 8. U frames are unaffected.
- Ignoring SABM means a caller retries until its own N2. That is the silent choice.
- T3 will key the radio on an idle connected link. Disconnect or leaving the tab stops it.
- One outgoing link is what the terminal operates. A second incoming peer can sit beside it when accept is on.
