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

1. Set `watch()` and constructor `size: 261` in `TauriNodeSerialPort` (TH-D74 `W` frame size), with `serialDataFlushIntervalMs: 1`, so the hub reads and flushes one clone reply per poll when no framer deadline applies. Shorter CAT/KISS/handshake traffic still flushes on the 1 ms batch timer.
2. Chain per-path close promises (`trackSerialPathClose` / `waitForSerialPathClose`) so a new open waits for every in-flight `unwatch` / native `close`.
3. On `onDisconnect`, schedule native teardown on a microtask without deasserting DTR/RTS (CDC drop during reboot); call `SerialPort.forceClose(path)` only when `close()` rejects.
4. Do not change `radio-module-kenwood`, `ack.timeout`, or the port open `timeout` default.

## Consequences

- Clone and CAT traffic arrive in hub chunks up to 261 bytes per watch event until the driver reassembles a frame; CAT/APRS/KISS callers must keep reassembling `data` chunks. Do not raise `ack.timeout` to mask slow delivery.
- Hardware check: back-to-back TH-D74 reads in one HamBench process should stay near ~20 s with single-digit-ms R→W in saved serial logs (see amendment).

## Amendment (Vue reactivity on session serial logs)

Hardware on a Mac mini showed the **repeat** slow read was not native I/O. Native write, USB, and the radio stayed at 0–3 ms. The ~110 ms per block (growing across imports) was on the main thread from the first native `W` byte to JS `RECV`.

**Root cause:** After a full D74 import, `captureSerialLog` stores `snapshotFromDriverSerialLog` on `useState('radio-card-sessions')`. That path eagerly `JSON.stringify`d the whole driver log (~8.5 MB) and kept `log.entries` (~7,800 frames of `number[]`) in the session object. Vue deep-proxied that tree, so every later serial event and flush paid for it. Retained imports made the stall worse (third read median ~236 ms; read 2 ~241 s before the fix).

**Decision:**

1. `markRaw` the driver log and snapshot; expose `contents` via a non-enumerable lazy getter so JSON is built only when saving to disk, and session `patchSession` shallow merges do not re-stringify on every update.
2. Build Debug-tab `snifferPacketsFromSerialLog` only while the Debug tab is active.
3. `markRaw` CAT serial log snapshots stored on `useState` for live radios.
4. Vendor-patched `serialport` / `serialplugin-core` (read-before-poll, hub join) were tried on hardware and **reverted**; they did not change the slow read.

**Verified outcome (same Mac mini, fresh process, three full reads back-to-back):** 17.0 s, 18.8 s, 20.7 s; median R→W 6–8 ms (before fix: read 2 ~241 s, ~110 ms R→W plateaus). `size: 261` improved the first read (e.g. 16.8 s vs ~21–28 s at `size: 1`) but did not alone fix session 2; reactivity fix did.