# HamBench

Desktop app for reading and managing ham radio memory.

## Downloads

Installers for macOS (Apple Silicon), Windows, and Linux are published on [GitHub Releases](https://github.com/springfield-ham-radio/ham-radio-ui/releases). Packaged desktop builds check that feed on launch and every few hours, download updates in the background, and prompt you to restart. Turn this off under **Preferences → Updates**.

Builds are **unsigned**. macOS Gatekeeper and Windows SmartScreen may show a warning; you can still open the app (macOS: right-click → Open; Windows: More info → Run anyway).

App versions come from [conventional commits](https://www.conventionalcommits.org/) via semantic-release. See [docs/releasing.md](docs/releasing.md).

## Usage

Open and save a radio memory image as JSON from **File → Open Memory…** (`⌘O` / `Ctrl+O`), **File → Save** (`⌘S` / `Ctrl+S`), and **File → Save As…** (`⇧⌘S` / `Ctrl+Shift+S`). Save writes back to the current file when one is open; Save As always asks for a destination. Import a live image from a connected radio with **File → Import from Radio…**. Write the loaded image to a connected radio with **File → Write to Radio…**; the radio type comes from the memory document, and you only choose the serial port. Every import and write captures serial bytes in and out; save that log from the success toast, the cancel toast, or **Save serial log** if the transfer fails. Click a channel in the Channels table to edit its name, frequencies, tones, and radio-specific settings; changes are written into the loaded memory image.

## Data storage

- **Radio memory files** are user-chosen JSON documents (File → Open / Save). They hold a hex dump of one radio's EEPROM and are not the app database.
- **Channel library** data lives in an embedded SQLite database (`ham-radio.db` under the OS app support directory) managed by the Tauri SQL plugin. Export and import the library as CSV from the Channels page. Use the **Channels** header tab to browse saved portable channels (name, band, frequencies, tones). On the **Radio** page, select memory channels and choose **Save to library** to store them for reuse across radios.

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
