# Sniffer

Ham Radio talks to a separate headless sniffer process over HTTP. The default workflow is **URL only**: install and run the sniffer yourself, then tell the app where it is. Optional SSH assist is available in the desktop app when you want help setting up a remote host (for example a Raspberry Pi) without a separate git checkout.

## URL only (default)

1. Start ham-radio-sniffer on the machine that has both USB serial cables (`yarn start` after build, or `yarn dev` while developing). Default origin: `http://127.0.0.1:3010`.
2. Open **Preferences → Sniffer** and set **Sniffer URL** if it is not the default. Changes save automatically.
3. Open the **Sniffer** tab to pick computer/radio ports and start the bridge. The header shows **Connected** / **Disconnected** (or **Remote connected** / **Remote disconnected** when SSH is configured). Connection badges follow API reachability: if `/api/health` succeeds, the page shows connected even when the app no longer owns the SSH child (for example after an app restart with a leftover tunnel). **Remote tunnel up** means the tracked SSH session is alive but the sniffer API is not answering yet.
4. Traffic streams live into the Traffic panel over SSE. Use **Save capture** to write a JSON file for offline review or driver verification.

Live traffic arrives as server-sent events. The sniffer itself has no web UI.

## Optional SSH assist

Leave **SSH host** blank to keep SSH disabled. When a host is set (desktop app only):

1. **Check host** verifies Node.js (major version ≥ 24, matching the sniffer `.nvmrc`), Yarn or Corepack, write access to the remote directory, and whether sources/build already exist. Preferences shows **Host ready / Not ready** and **Installed / Sources only / Not installed** badges. The app does **not** install Node for you.
2. **Install** uploads the **bundled sniffer sources** shipped with the app (not a git clone), then runs `yarn install` and `yarn build` on the remote so native `serialport` bindings match that machine’s architecture. Use it again to update an existing install.
3. The **Remote** switch starts the configured remote start command over SSH with `PORT`/`HOST` set to the configured port (production Nitro defaults to port 3000 otherwise), opens a local port forward on the same port, and waits until `/api/health` responds. The Sniffer URL is updated to `http://127.0.0.1:<port>`. Turning it off ends the SSH session (and the remote process started with it).

SSH uses key or agent authentication only (`BatchMode=yes`). Password prompts are not supported.

The Remote switch lives only under **Preferences → Sniffer**. The Sniffer tab Start/Stop bridge controls open the serial ports once the API is reachable.

## Capture files

Saved captures use kind `springfield-ham-radio-sniffer-capture` and include:

- Port metadata (`computerPort`, `radioPort`, `baudRate`)
- `packets`: coalesced UI frames with `COMPUTER->RADIO` / `RADIO->COMPUTER`
- `log`: SerialLogger JSON with `SEND` / `RECV` entries (same shape as driver serial logs from Import/Write)

Prefer `log` when comparing a sniffer capture against a driver serial log for protocol verification.
