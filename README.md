# Ham Radio

Desktop app for reading and managing ham radio memory.

## Usage

Open and save a radio memory image as JSON from **File → Open Memory…** (`⌘O` / `Ctrl+O`), **File → Save** (`⌘S` / `Ctrl+S`), and **File → Save As…** (`⇧⌘S` / `Ctrl+Shift+S`). Save writes back to the current file when one is open; Save As always asks for a destination. Import a live image from a connected radio with **File → Import from Radio…**. Write the loaded image to a connected radio with **File → Write to Radio…**; the radio type comes from the memory document, and you only choose the serial port. Every import and write captures serial bytes in and out; save that log from the success toast, the cancel toast, or **Save serial log** if the transfer fails. Click a channel in the Channels table to edit its name, frequencies, tones, and radio-specific settings; changes are written into the loaded memory image.

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
