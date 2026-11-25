# Serial watch flush and close sequencing

**Status:** accepted  
**Date:** 2026-11-25

## Context

Kenwood TH-D74 clone reads transfer 1,955 blocks of 256 bytes; each host `R` gets a 261-byte `W` and an ACK. Serial logs from hardware showed:

- **Fresh app start:** transfer ~28.3 s; mean R→W ~9.7 ms (median 8 ms); full cycle ~14 ms.
- **Second read without restarting HamBench:** ~216.9 s; mean R→W ~108.6 ms (median 105 ms), very consistent; first block ~1 ms.
- On both runs the host was idle after W (W→ACK 0–1 ms, ACK round trip ~1 ms, ACK→next R 0 ms). No retries or timeouts. The radio can answer in about 1 ms.

HamBench already set `serialDataFlushIntervalMs: 1` on `tauri-plugin-serialplugin` 4.2.2 / `serialplugin-core` 0.2.5. That alone did not fix the second session: `WatchOptions.size` defaults to 1024, so a 261-byte reply sits in `CoreWatchSlot` until the hub batch timer or poll wakes. After a programming `E` and CDC reopen, the hub poll interval often tracks the port I/O timeout (~100 ms on Windows and on some reopen paths), matching the ~105 ms R→W on the slow read.

## Decision

1. Set `watch()` and constructor `size: 1` in `TauriNodeSerialPort`, with `serialDataFlushIntervalMs: 1`, so the hub flushes on the first buffered byte and reads one byte per poll when no framer deadline applies.
2. Chain per-path close promises (`trackSerialPathClose` / `waitForSerialPathClose`) so a new open waits for every in-flight `unwatch` / native `close`.
3. On `onDisconnect`, schedule native teardown on a microtask without deasserting DTR/RTS (CDC drop during reboot); call `SerialPort.forceClose(path)` only when `close()` rejects.
4. Do not change `radio-module-kenwood`, `ack.timeout`, or the port open `timeout` default.

## Consequences

- Clone and CAT traffic get one Tauri channel event per received byte until the driver has reassembled a frame; a full `W` is 261 events (~510k per clone). Do not raise `ack.timeout` to mask slow delivery.
- KISS/APRS/CAT callers must keep reassembling `data` chunks; behavior is unchanged except chunk size.
- Hardware check: two back-to-back TH-D74 reads in one HamBench process without restart should both finish well under 30 s, with R→W of a few milliseconds in saved serial logs.

## Amendment (native serial stack)

Front-end `size: 1` and path-close chaining improved the **first** post-reopen clone (~20 s vs minutes) but the **second** back-to-back read still showed ~100 ms R→W plateaus. Saved logs traced that to the native stack, not JavaScript coalescing:

1. **`serialport` 4.10.1** (`posix/tty.rs`): `TTYPort::read` called `poll` before `read`, so bytes already in the CDC TTY buffer waited for the port timeout (~100 ms) on every hub poll.
2. **`serialplugin-core` 0.2.5** (`write_all_port`): after a write, the hub read timeout was reset to a fixed 100 ms instead of the configured open timeout.
3. **`serialplugin-core` hub lifecycle**: `release()` after disconnect dropped `ConnectedPort` without stopping/joining the RX hub (unlike `close()`), leaving poll loops and exclusive fds alive across reopen.

**Decision (vendor patches):** Vendor both crates under `src-tauri/vendor-patches/` with `[patch.crates-io]`, keeping upstream licenses (MPL-2.0 for `serialport`; Apache-2.0 OR MIT for `serialplugin-core`). Apply read-before-poll, timeout restore, shared `teardown_rx_hub` + `Drop for PortRxHub`, and hub poll debug counters. CI `rust-host` runs unit tests for the patched crates on macOS and Windows.

Expected hardware outcome: both clone reads in one process finish well under 30 s with single-digit-ms R→W after `E`/CDC reopen, not ~105 ms stairs.