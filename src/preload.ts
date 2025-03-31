// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { RadioConnection } from '@springfield/ham-radio-api';
import { contextBridge, ipcRenderer } from 'electron';
import { ConsoleTransport, LogLayer } from "loglayer";

const logger = new LogLayer({
  transport: [
    new ConsoleTransport({
      logger: console,
      level: "debug",
    }),
  ],
});

contextBridge.exposeInMainWorld("modules", {
  getModels: () => ipcRenderer.invoke("modules:getModels"),
});

contextBridge.exposeInMainWorld("radio", {
  importFromRadio: (connection: RadioConnection) => {
    logger.debug('importFromRadio()');
    ipcRenderer.invoke("radio:read", connection);
  },

  cancelImport: () => {
    ipcRenderer.invoke("radio:cancel");
  },
});

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electron', {
    serialPort: {
      reset: (path: string) => ipcRenderer.invoke('reset-serialport', path),
      list: () => ipcRenderer.invoke('list-ports'),
    },

    dialog: {
      onShowImportDialog: (callback: () => void) => {
        ipcRenderer.on('show-import-dialog', callback);
      },
    },
  }
);
