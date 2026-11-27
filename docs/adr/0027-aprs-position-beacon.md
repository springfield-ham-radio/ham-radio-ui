# Host position beacons on the shared KISS session

**Status:** accepted  
**Date:** 2026-11-27  
**Related:** [0015](./0015-aprs-host-messaging.md), [0025](./0025-aprs-kiss-only-host.md), [aprs.md](../aprs.md)

## Context

Entering host KISS on a TM-D710 or TH-D74 stops the radio’s built-in APRS beacon schedule. Operators who use Messages still need a position on the map. HamBench already writes message frames on the same KISS data path after an AX.25 UI frame confirms KISS.

## Decision

- The APRS tab offers **Position beacon** on the host face only. **Beacon now** sends one uncompressed `=` report through `encodeKissData`. There is no retry. Interval beacons use the same gate and the host-session clock, with a minimum of 10 minutes, default 30. The interval switch is off on every Connect and is not saved. Disconnect, KISS exit, and loss of `kissConfirmed` clear the interval.
- Beacon now and the interval use the same gate as **Send**: port open, `hardwareTransmit`, and `kissConfirmed`. Connect, detection, `KISS ON`, and `RESTART` never beacon.
- Source is **My callsign** on the header. AX.25 destination is experimental tocall `APZHMB` until aprs-deviceid registers HamBench. Default path is `WIDE1-1,WIDE2-1`, with up to two hops. Message frames stay generic `APRS` with an empty path.
- Position, symbol, comment, optional altitude, path, and interval default live in `SavedRadio.aprsBeacon` under `ham-radio-saved-radios`. Latitude and longitude are decimal degrees. The radio position is not read while KISS is on.
- A successful write records a `tx-frame` in the serial reply log and passes the AX.25 payload to the same `onAx25Ui` fold used for heard traffic, so Stations, Map, and decoded lines show this station without a separate inject.
- No APRS-IS, igate, GPS, SmartBeaconing, or radio-menu writes.

## Consequences

- Operators must enter a manual position and confirm KISS before a beacon keys the radio.
- Passive Monitor only and the menu 604 session still do not transmit.
- `encodeAx25Ui` accepts an optional destination call; callers that omit it keep generic `APRS`.