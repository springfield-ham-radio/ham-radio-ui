// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { RadioConnection } from '@springfield/ham-radio-api';
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
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
contextBridge.exposeInMainWorld("electron", {
  serialPort: {
    reset: (path: string) => ipcRenderer.invoke("reset-serialport", path),
    list: () => ipcRenderer.invoke("list-ports"),
  },

  dialog: {
    onShowImportDialog: (callback: () => void) => {
      ipcRenderer.on("show-import-dialog", callback);
    },
    onShowImportProgressDialog: (callback: () => void) => {
      ipcRenderer.on("show-import-progress-dialog", callback);
    },
    onHideImportProgressDialog: (callback: () => void) => {
      ipcRenderer.on("hide-import-progress-dialog", callback);
    },
    onRadioProgressIndicator: (
      callback: (event: IpcRendererEvent, value: number) => void
    ) => ipcRenderer.on("radio-progress-indicator", callback),
  },
});
