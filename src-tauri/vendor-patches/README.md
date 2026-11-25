# Vendor-patched serial crates

HamBench patches `serialport` and `serialplugin-core` to fix slow second TH-D74 clone reads (poll-before-read, write timeout restore, RX hub join on release). See ADR 0024.

Each subdirectory is an upstream release plus a small diff; licenses are unchanged. `[patch.crates-io]` in `../Cargo.toml` redirects both crates for the Tauri app and for `cargo test -p serialport` / `cargo test -p serialplugin-core`.