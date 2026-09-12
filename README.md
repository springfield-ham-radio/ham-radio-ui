# HamBench

Desktop app for reading and managing ham radio memory.

## Downloads

Installers for macOS (Apple Silicon), Windows, and Linux are published on [GitHub Releases](https://github.com/springfield-ham-radio/ham-radio-ui/releases). Packaged desktop builds check that feed on launch and every few hours, download updates in the background, and prompt you to restart. Turn this off under **Preferences → Updates**.

Builds are **unsigned**. macOS Gatekeeper and Windows SmartScreen may show a warning; you can still open the app (macOS: right-click → Open; Windows: More info → Run anyway).

App versions come from [conventional commits](https://www.conventionalcommits.org/) via semantic-release. See [docs/releasing.md](docs/releasing.md).

## Usage

On the **Radio** page, **Import** reads memory from a connected radio and **Write** programs the loaded image back to the radio. **Open** and **Save** work with JSON memory files; Save writes back to the current file when one is open, or asks for a destination if none is yet. **File → Save As…** always asks for a destination. The same Open and Save actions are also on **File** (`⌘O` / `Ctrl+O`, `⌘S` / `Ctrl+S`, `⇧⌘S` / `Ctrl+Shift+S`). Until a memory is loaded, Radio tabs also offer **Import from Radio** and **Open Memory**. The radio type for Write comes from the memory document, and you choose the serial port. Import remembers the last manufacturer and model you selected, including across restarts, as long as that radio is still installed. Import and Write remember the last serial port and restore it only when that device is still present. If the radio driver lists more than one programming baud rate, Import and Write also let you pick the speed (the driver default is selected until you choose another; the last choice is remembered per radio). **Preferences → Serial ports** hides common macOS system devices from those port lists by default, and you can add extra names to hide. Every import and write captures serial bytes in and out; inspect that traffic and save the log from the **Debug** tab, or **Save serial log** if the transfer fails. Inspect the radio’s read and write protocol and channel/settings memory maps on **Radio → Driver** (diagram/map or JSON). Bridge two serial ports from **Radio → Sniffer**. Click a channel in the Channels table to edit its name, frequencies, tones, and radio-specific settings; drag the grip handle to move a channel into another occupied memory slot. Use **Add channel** to program an unused memory slot and **Remove** to clear slots. On the **Channels** library page, select saved channels and choose **Add to radio** to copy them into unused memory slots on the loaded radio. Import a RepeaterBook or CHIRP CSV on that page to add repeaters to the same list (they show a Repeater badge). Changes are written into the loaded memory image.

The **CAT** page talks live to radios whose driver sets `capabilities.liveControl` (Kenwood TH-F6, TM-D710A, TH-D74): frequency, mode, power, and press-to-talk. Connect on the radio’s PC port, then disconnect before Import or Write. The CAT **Debug** tab captures serial traffic the same way Radio import does. See [docs/cat.md](docs/cat.md).

## Data storage

- **Radio memory files** are user-chosen JSON documents (Open / Save on the Radio page, or File → Open / Save). They hold a hex dump of one radio's EEPROM and are not the app database.
- **Channel library** data lives in an embedded SQLite database (`ham-radio.db` under the OS app support directory) managed by the Tauri SQL plugin. Export and import the library as CSV from the Channels page. The same import accepts RepeaterBook and CHIRP CSV exports; those rows are stored with the other portable channels and marked as repeaters. Use the **Channels** header tab to browse saved portable channels (name, band, frequencies, tones). On the **Radio** page, select memory channels and choose **Save to library** to store them for reuse across radios. On the **Channels** page, select saved channels and choose **Add to radio** to copy them into unused slots on the loaded radio.
- **Station log** QSO contacts live in the same SQLite database. Use the **Log** header tab to add, edit, search, and delete contacts (callsign, date/time UTC, frequency, mode, RST, and related fields). Import and export the log as ADIF (`.adi`) from that page.

## Development

This project uses [Node.js](https://nodejs.dev) 24 (see `.nvmrc`) and [Yarn](https://yarnpkg.com) 4 via Corepack.

```
corepack enable
git clone https://github.com/springfield-ham-radio/ham-radio-ui.git
cd ham-radio-ui
yarn install
yarn tauri:dev
```

Rust and the Tauri CLI prerequisites are required for `yarn tauri:dev` and `yarn tauri:build`. See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

## Contributing

Report bugs and feature requests at: https://github.com/springfield-ham-radio/ham-radio-ui/issues

For source contributions, open a pull request: https://github.com/springfield-ham-radio/ham-radio-ui/pulls
