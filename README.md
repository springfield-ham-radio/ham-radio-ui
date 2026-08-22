# Ham Radio

Desktop app for reading and managing ham radio memory.

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
