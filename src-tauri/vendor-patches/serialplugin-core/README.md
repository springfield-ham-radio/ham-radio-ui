# Vendored `serialplugin-core` 0.2.5 (HamBench patch)

Upstream crate from [tauri-plugin-serialplugin](https://github.com/s00d/tauri-plugin-serialplugin), dual-licensed (`LICENSE-APACHE`, `LICENSE-MIT`).

| Field | Value |
| --- | --- |
| Version | 0.2.5 |
| Registry checksum | `bbbe7fab3483898c8ce571bf3ac9e0ac45af14762722d4067871e40954feb422` |

## HamBench changes

- `src/api/serial.rs`: `write_all_port` saves and restores the port read timeout; `teardown_rx_hub` shared by `finish_serialport_info` and `release`.
- `src/hub/desktop.rs`: log `set_timeout` failures in `poll_read_port`; debug counters for data vs idle polls; `Drop for PortRxHub` calls `stop_and_join`.
- Tests: `write_all_port_restores_timeout`, `drop_joins_hub_thread`.

Wired via `[patch.crates-io]` in `src-tauri/Cargo.toml`.