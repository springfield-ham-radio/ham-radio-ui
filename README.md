# HamBench

Desktop app for amateur radio memory and live CAT. Read and write radios, edit channels, keep a portable channel library, log contacts, and sniff clone-protocol traffic.

**Radio → Read from Radio** with no card open asks for a model and serial port, then opens a temporary guest clone that is not saved under Preferences. The same command is on the Radio page when no card is open. With a card open, it reads into that card. **File** keeps memory files and **Show Backups**.

Docs: [User guide](https://springfield-ham-radio.github.io/ham-radio-docs/guide/) · [Developer docs](https://springfield-ham-radio.github.io/ham-radio-docs/developer/)

## Downloads

Installers for macOS (Apple Silicon), Windows, and Linux are on [GitHub Releases](https://github.com/springfield-ham-radio/ham-radio-ui/releases). Packaged builds check that feed on launch. Builds are **unsigned** (macOS: right-click → Open; Windows: More info → Run anyway).

## Development

Node.js 26 (see `.nvmrc`) and Yarn 4 via Corepack. Rust and [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) are required.

```bash
corepack enable
yarn install
yarn tauri:dev
```
