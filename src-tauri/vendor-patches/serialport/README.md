# Vendored `serialport` 4.10.1 (HamBench patch)

Upstream crates.io crate, vendored under MPL-2.0 per `LICENSE.txt`.

| Field | Value |
| --- | --- |
| Version | 4.10.1 |
| Registry checksum | `6ba5f8f29aa20853c4e3e85a33ec580eb66be1f057142e77a333834a318bacf2` |

## HamBench changes

- `src/posix/tty.rs`: `TTYPort::read` tries a non-blocking `read(2)` before `poll`, and retries once after a poll timeout so queued CDC bytes are not delayed by the I/O timeout.
- `tests/test_tty.rs`: `test_ttyport_read_queued_before_poll` (Unix).

Wired via `[patch.crates-io]` in `src-tauri/Cargo.toml`.