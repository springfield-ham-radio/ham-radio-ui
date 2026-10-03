# Sniffer

HamBench talks to a separate headless sniffer process over HTTP. Set **Host** and **Port** in Preferences. The desktop app can also **install, start, and stop** the sniffer for you — on this computer, or on that host when **Control over SSH** is enabled.

## Connection

1. Open **Preferences → Sniffer** and set **Host** (default `127.0.0.1`) and **Port** (default `3010`). **Install directory** (default `~/ham-radio-sniffer`) and **Run command** (default `./ham-radio-sniffer`) are on the Sniffer process card. Changes save automatically. The **Bridge ports** toggle on **Radio → Sniffer** always uses `http://<host>:<port>`. **Preferences → Serial ports** can hide common macOS system devices (Bluetooth Incoming, debug-console, wlan-debug) and any names you add (for example `BryansHeadphones`) from the Computer and Radio port lists; the same filter applies to Read and Write.
2. Open **Radio → Sniffer** and choose ports: **Computer port** is the debug cable (computer ↔ sniffer), **Radio port** is the programming cable (sniffer ↔ radio). Turn on **Bridge ports**. The page header shows **Sniffer** with **Connected** / **Disconnected**. The **Running** / **Stopped** badge sits next to the Bridge heading. When the API is reachable, the version from `/api/health` is shown. Badges follow `/api/health` on that origin, polled while the page is visible.
3. Traffic streams live into the Traffic panel over SSE. The Traffic header shows whether each port is open and how many bytes the UART has delivered (`C→R` / `R→C`). Use **Save capture** to write a JSON file for offline review or driver verification. Turning on **Bridge ports** keeps the existing SSE connection; reachability follows `/api/health`, not EventSource reconnects.

If the bridge is running and byte counts stay at 0, the selected serial device is not receiving — a scope on a different TX line will not change that. On the sniffer host, `SNIFFER_LOG_LEVEL=debug ./ham-radio-sniffer` prints every chunk as hex; default `info` logs the first bytes on each port.

Live traffic arrives as server-sent events. The sniffer itself has no web UI.

You can still start ham-radio-sniffer yourself (`./ham-radio-sniffer`) and only set Host and Port. Install / Running are optional.

## Install, start, and stop

These controls live under **Preferences → Sniffer** and run only in the desktop app. Install copies one binary; Node is not required. Status (host ready, installed, running) is checked automatically when you open the page and when Host, Port, Install directory, Run command, or Control over SSH change.

1. **Install directory** is where the binary is copied (default `~/ham-radio-sniffer`).
2. **Run command** starts the process (default `./ham-radio-sniffer`).
3. **Install** copies the bundled sniffer binary shipped with the app. A Raspberry Pi install uses the Linux ARM64 binary. Use it again to update an existing install.
4. **Running** starts a detached sniffer process on the configured port and waits until `/api/health` responds. Turning it off stops that process. If start fails, the error includes why (process exited, health timeout) and the last lines of `sniffer.log`.

Host check also compares the installed sniffer **version** to the copy bundled in HamBench. An older install shows **Update available**; run **Install** to copy the current binary.

When **Control over SSH** is off, those commands run on this computer. A loopback host binds `127.0.0.1`; any other host binds `0.0.0.0`.

When **Control over SSH** is on, the same commands run on **Host**:

- `192.168.1.10` SSHes to `192.168.1.10`. SSH uses your default user or `~/.ssh/config`.
- `pi@192.168.1.10` SSHes as `pi@192.168.1.10`.

There is no SSH tunnel. Allow the listen port through the host firewall if needed.

SSH uses key or agent authentication only (`BatchMode=yes`). Password prompts are not supported.

The **Bridge ports** toggle on **Radio → Sniffer** opens the serial ports once the API is reachable.

## Capture files

Saved captures use kind `springfield-ham-radio-sniffer-capture` and include:

- Port metadata (`computerPort`, `radioPort`, `baudRate`)
- `packets`: coalesced UI frames with `COMPUTER->RADIO` / `RADIO->COMPUTER`
- `log`: SerialLogger JSON with `SEND` / `RECV` entries (same shape as driver serial logs from Read/Write)

Prefer `log` when comparing a sniffer capture against a driver serial log for protocol verification.
