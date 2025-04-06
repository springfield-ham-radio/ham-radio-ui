// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { RadioConnection } from '@springfield/ham-radio-api';
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld("modules", {
  getModels: () => ipcRenderer.invoke("modules:getModels"),
});

contextBridge.exposeInMainWorld("radio", {
  onShowImportDialog: (callback: () => void) => {
    ipcRenderer.on("radio:showImportDialog", callback);
  },

  onShowProgressDialog: (callback: () => void) => {
    ipcRenderer.on("radio:showProgressDialog", callback);
  },

  onHideProgressDialog: (callback: () => void) => {
    ipcRenderer.on("radio:hideProgressDialog", callback);
  },

  onRadioProgressIndicator: (
    callback: (event: IpcRendererEvent, value: number) => void
  ) => ipcRenderer.on("radio:updateProgressIndicator", callback),

  importFromRadio: (connection: RadioConnection) => {
    ipcRenderer.invoke("radio:read", connection);
  },

  cancel: () => {
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
  },
});
