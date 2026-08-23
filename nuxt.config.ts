import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const rootDirectory = fileURLToPath(new URL('.', import.meta.url));

function stub(relativePath: string): string {
  return resolve(rootDirectory, relativePath);
}

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@nuxt/ui'],

  css: ['~/assets/css/main.css'],

  ssr: false,

  ui: {
    fonts: false,
  },

  colorMode: {
    preference: 'system',
    fallback: 'light',
    storageKey: 'ham-radio-color-mode',
  },

  telemetry: false,

  devServer: {
    host: '0.0.0.0',
  },

  alias: {
    '#baofeng-uv5r': stub('./node_modules/@springfield/radio-module-baofeng/configs/baofeng-uv5r.json'),
    '#baofeng-uv5r-settings-schema': stub(
      './node_modules/@springfield/radio-module-baofeng/src/shared/schemas/settings-schema.json',
    ),
    '#baofeng-uv5r-channel-schema': stub(
      './node_modules/@springfield/radio-module-baofeng/src/shared/schemas/channel-schema.json',
    ),
    '#baofeng-uv5r-memory-map': stub(
      './node_modules/@springfield/radio-module-baofeng/src/shared/memory-maps/uv5r-settings.json',
    ),
  },

  vite: {
    clearScreen: false,
    envPrefix: ['VITE_', 'TAURI_'],
    define: {
      global: 'globalThis',
      'process.argv': JSON.stringify(['nuxt', 'ham-radio-ui']),
    },
    optimizeDeps: {
      exclude: ['@springfield/ham-radio-driver'],
    },
    json: {
      stringify: true,
      namedExports: false,
    },
    plugins: [
      {
        name: 'webview-node-shims',
        enforce: 'pre',
        resolveId(id: string) {
          if (id.includes('log-comparator')) {
            return stub('./app/utils/log-comparator-stub.ts');
          }

          if (id.includes('radio-protocol-schema')) {
            return stub('./app/utils/json-default-stub.ts');
          }

          if (id.includes('bands.json')) {
            return stub('./node_modules/@springfield/ham-radio-utils/dist/db/bands.json');
          }

          if (id.includes('license-classes.json')) {
            return stub('./node_modules/@springfield/ham-radio-utils/dist/db/license-classes.json');
          }

          return undefined;
        },
        transformIndexHtml() {
          return [
            {
              tag: 'script',
              children: 'globalThis.process = globalThis.process || {}; globalThis.process.argv = globalThis.process.argv || ["nuxt", "ham-radio-ui"];',
              injectTo: 'head-prepend',
            },
          ];
        },
      },
    ],
    resolve: {
      alias: {
        eventemitter3: stub('./app/utils/event-emitter.ts'),
        '@springfield/ham-radio-utils': stub('./app/utils/ham-radio-utils-shim.ts'),
        serialport: stub('./app/utils/serialport-stub.ts'),
        '@serialport/parser-byte-length': stub('./app/utils/byte-length-parser.ts'),
        path: stub('./app/utils/path-stub.ts'),
        os: stub('./app/utils/os-stub.ts'),
        fs: stub('./app/utils/fs-stub.ts'),
        'fs/promises': stub('./app/utils/fs-promises-stub.ts'),
        'node:path': stub('./app/utils/path-stub.ts'),
        'node:os': stub('./app/utils/os-stub.ts'),
        'node:fs': stub('./app/utils/fs-stub.ts'),
        'node:fs/promises': stub('./app/utils/fs-promises-stub.ts'),
      },
    },
    server: {
      strictPort: true,
    },
  },

  ignore: ['**/src-tauri/**'],
});
